"""Minimal stdio MCP client for the z.ai Vision MCP server (`@z_ai/mcp-server`).

The z.ai GLM Coding Plan ships GLM-4.6V vision as a *local MCP server* rather than
a REST endpoint. We spawn it as a subprocess and speak the MCP stdio transport
(newline-delimited JSON-RPC 2.0) to call its image tools — primarily
`image_analysis` and `extract_text_from_screenshot`.

This lets the automated business-card pipeline use the coding-plan vision quota
headlessly, without an interactive MCP client.

Requirements on the host: Node.js >= 22 (for `npx`) and Z_AI_API_KEY (falls back
to GLM_API_KEY). Set Z_AI_MODE=ZAI (default here).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from . import glm

PROTOCOL_VERSION = "2024-11-05"
# Prefer these tools, in order, for card OCR → structured fields.
# Names verified against @z_ai/mcp-server build: general tool is `analyze_image`;
# OCR-only tool is `extract_text_from_screenshot`. Both take `image_source`+`prompt`.
_PREFERRED_TOOLS = ("analyze_image", "extract_text_from_screenshot", "image_analysis")


def _api_key() -> str:
    return (os.environ.get("Z_AI_API_KEY") or os.environ.get("GLM_API_KEY") or "").strip()


def _server_command() -> list[str]:
    """Launch command for the vision MCP server. Override to swap servers later.

    VISION_MCP_COMMAND (JSON array) wins; else npx + VISION_MCP_PACKAGE.
    """
    raw = os.environ.get("VISION_MCP_COMMAND", "").strip()
    if raw:
        try:
            cmd = json.loads(raw)
            if isinstance(cmd, list) and cmd:
                return [str(x) for x in cmd]
        except ValueError:
            pass
    package = os.environ.get("VISION_MCP_PACKAGE", "").strip() or "@z_ai/mcp-server@latest"
    return ["npx", "-y", package]


def is_available() -> bool:
    """True when we can plausibly launch the MCP server (key + launcher present)."""
    if not _api_key():
        return False
    return shutil.which(_server_command()[0]) is not None


def unavailable_reason() -> str:
    if not _api_key():
        return "Z_AI_API_KEY(또는 GLM_API_KEY) 미설정"
    launcher = _server_command()[0]
    if not shutil.which(launcher):
        return f"{launcher} 미설치 (npx는 Node.js >= 22 필요)"
    return ""


class _McpProc:
    """One-shot MCP stdio session over a spawned `@z_ai/mcp-server` process."""

    def __init__(self) -> None:
        env = {
            **os.environ,
            "Z_AI_API_KEY": _api_key(),
            "Z_AI_MODE": os.environ.get("Z_AI_MODE", "ZAI"),
        }
        # stderr → temp file so a full pipe buffer can never deadlock us.
        self._stderr = tempfile.TemporaryFile(mode="w+")
        self.proc = subprocess.Popen(
            _server_command(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self._stderr,
            env=env,
            text=True,
            bufsize=1,
        )
        self._id = 0

    def _stderr_tail(self, n: int = 600) -> str:
        try:
            self._stderr.seek(0)
            return self._stderr.read()[-n:]
        except Exception:  # noqa: BLE001
            return ""

    def _send(self, method: str, params: dict | None = None, notification: bool = False) -> int | None:
        msg: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        rid: int | None = None
        if not notification:
            self._id += 1
            rid = self._id
            msg["id"] = rid
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps(msg, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()
        return rid

    def _read_result(self, want_id: int, timeout: float = 180.0) -> dict:
        assert self.proc.stdout is not None
        end = time.time() + timeout
        while time.time() < end:
            line = self.proc.stdout.readline()
            if not line:
                if self.proc.poll() is not None:
                    raise RuntimeError(
                        f"MCP 프로세스 종료(code={self.proc.returncode}) — {self._stderr_tail()}"
                    )
                continue
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except ValueError:
                continue  # non-JSON log noise on stdout — skip
            if data.get("id") == want_id:
                if "error" in data:
                    raise RuntimeError(f"MCP error: {data['error']}")
                return data.get("result") or {}
            # server notifications / other ids → ignore and keep reading
        raise RuntimeError("MCP 응답 타임아웃")

    def initialize(self, timeout: float = 180.0) -> dict:
        rid = self._send(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "rtm-backend", "version": "1.0"},
            },
        )
        res = self._read_result(rid, timeout=timeout)  # first run downloads via npx
        self._send("notifications/initialized", notification=True)
        return res

    def list_tools(self) -> list[dict]:
        rid = self._send("tools/list", {})
        return (self._read_result(rid) or {}).get("tools", []) or []

    def call_tool(self, name: str, arguments: dict, timeout: float = 240.0) -> dict:
        rid = self._send("tools/call", {"name": name, "arguments": arguments})
        return self._read_result(rid, timeout=timeout)

    def close(self) -> None:
        for fn in (
            lambda: self.proc.stdin and self.proc.stdin.close(),
            self.proc.terminate,
            self._stderr.close,
        ):
            try:
                fn()
            except Exception:  # noqa: BLE001
                pass


def _ext_for(mime: str) -> str:
    m = (mime or "").lower()
    if "png" in m:
        return ".png"
    if "webp" in m:
        return ".webp"
    return ".jpg"


def _build_args(tool: dict, image_path: str, prompt: str) -> dict:
    """Map our (image_path, prompt) onto whatever the tool's inputSchema calls them."""
    schema = (tool.get("inputSchema") or tool.get("input_schema") or {})
    props = schema.get("properties") or {}
    args: dict[str, Any] = {}
    path_keys = ("image_source", "image_path", "path", "image", "file", "file_path", "url", "screenshot", "image_url")
    prompt_keys = ("prompt", "question", "query", "text", "instruction", "task")
    # exact/priority match for the image location
    assigned_path = False
    for k in path_keys:
        if k in props:
            args[k] = image_path
            assigned_path = True
            break
    if not assigned_path:
        for name in props:
            if any(t in name.lower() for t in ("image", "path", "file", "url", "screenshot")):
                args[name] = image_path
                assigned_path = True
                break
    # prompt / instruction
    for k in prompt_keys:
        if k in props:
            args[k] = prompt
            break
    else:
        for name in props:
            if any(t in name.lower() for t in ("prompt", "question", "query", "instruct", "task", "text")):
                args[name] = prompt
                break
    # ensure any remaining required fields exist
    for req in schema.get("required", []) or []:
        if req not in args:
            args[req] = image_path if not assigned_path else prompt
    if not props and not args:
        # unknown schema → best-effort default
        args = {"image": image_path, "prompt": prompt}
    return args


def _text_from_result(result: dict) -> str:
    """MCP tools/call result → concatenated text content."""
    parts: list[str] = []
    for item in result.get("content", []) or []:
        if isinstance(item, dict):
            if item.get("type") == "text" and item.get("text"):
                parts.append(str(item["text"]))
            elif "text" in item:
                parts.append(str(item["text"]))
    if not parts and isinstance(result.get("structuredContent"), dict):
        return json.dumps(result["structuredContent"], ensure_ascii=False)
    return "\n".join(parts)


_CARD_PROMPT = (
    glm.BUSINESS_CARD_SYSTEM
    + "\n위 규칙에 따라 이 명함 이미지를 읽고 JSON만 반환해라."
)


def analyze_business_card(
    image_bytes: bytes,
    *,
    mime_type: str = "image/jpeg",
    hint: str = "",
    logs: list[str] | None = None,
) -> dict[str, Any]:
    """OCR a business-card image via the z.ai Vision MCP server → structured fields.

    Returns a dict with the same shape as glm.extract_business_card_image plus
    `_mode` in {"glm_mcp","unavailable","error"}.
    """
    def _log(msg: str) -> None:
        if logs is not None:
            logs.append(msg)
            print(msg, flush=True)

    if not is_available():
        return {"_mode": "unavailable", "message": f"Vision MCP 사용 불가: {unavailable_reason()}"}
    if not image_bytes:
        return {"_mode": "error", "message": "empty image"}

    prompt = _CARD_PROMPT
    if hint:
        prompt += f"\n\nSlack 메시지/댓글 힌트:\n{hint[:800]}"

    tmp = Path(tempfile.gettempdir()) / f"rtm_card_{int(time.time() * 1000)}{_ext_for(mime_type)}"
    tmp.write_bytes(image_bytes)
    cli: _McpProc | None = None
    try:
        _log("    · Vision MCP 서버 기동 중… (첫 실행은 npx 다운로드로 수십 초 소요될 수 있음)")
        cli = _McpProc()
        cli.initialize()
        tools = {t.get("name"): t for t in cli.list_tools() if t.get("name")}
        _log(f"    · Vision MCP 도구: {', '.join(tools) or '(없음)'}")
        name = next((t for t in _PREFERRED_TOOLS if t in tools), None)
        if not name:
            return {"_mode": "error", "message": f"vision 도구 없음: {list(tools)}"}
        args = _build_args(tools[name], str(tmp), prompt)
        _log(f"    · Vision MCP 호출: {name}")
        result = cli.call_tool(name, args)
        text = _text_from_result(result)
        data = glm._json_from_text(text) or {}
        if not data:
            # OCR-only tool returned plain text → structure it via the (working)
            # coding-endpoint chat model.
            if glm.is_configured() and text.strip():
                _log("    · OCR 텍스트를 GLM chat으로 구조화")
                try:
                    structured = glm.chat(glm.BUSINESS_CARD_SYSTEM, text[:4000], max_tokens=800)
                    data = glm._json_from_text(structured) or {}
                except Exception as exc:  # noqa: BLE001
                    _log(f"    · 구조화 실패: {exc}")
            if not data:
                data = {"evidence": text[:200]}
        data["_mode"] = "glm_mcp"
        data["_tool"] = name
        data.setdefault("_raw_text", text[:500])
        return data
    except Exception as exc:  # noqa: BLE001
        return {"_mode": "error", "message": str(exc)}
    finally:
        if cli is not None:
            cli.close()
        try:
            tmp.unlink()
        except Exception:  # noqa: BLE001
            pass
