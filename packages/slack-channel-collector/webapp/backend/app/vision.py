"""Vision OCR provider abstraction.

Lets the business-card OCR backend be swapped later with **zero code change** —
only environment variables. Today we support the z.ai Coding-Plan Vision MCP
(GLM-4.6V) and any OpenAI-compatible vision REST endpoint. Adding a new provider
means implementing one function and registering it in `_ROUTES`.

Env:
  VISION_PROVIDER = auto (default) | mcp | rest | off
    auto → try MCP first, then REST
    mcp  → z.ai Vision MCP only
    rest → OpenAI-compatible vision endpoint only (GLM_VISION_API_URL / GLM_VISION_MODEL)
    off  → disabled

On success every provider returns a dict with `_mode == "ok"` plus the usual
card fields (email, name, company, …). Callers only check `is_ok(result)`.
"""
from __future__ import annotations

import os
from typing import Any, Callable

from . import glm, zai_vision_mcp


def provider() -> str:
    return (os.environ.get("VISION_PROVIDER", "auto").strip().lower() or "auto")


def _order() -> list[str]:
    return {
        "auto": ["mcp", "rest"],
        "mcp": ["mcp"],
        "rest": ["rest"],
        "off": [],
    }.get(provider(), ["mcp", "rest"])


# ── provider probes ──────────────────────────────────────────────────────────
def _mcp_available() -> bool:
    return zai_vision_mcp.is_available()


def _rest_available() -> bool:
    return glm.is_configured()


_PROBES: dict[str, Callable[[], bool]] = {"mcp": _mcp_available, "rest": _rest_available}


def available() -> tuple[bool, str]:
    """(usable?, reason-if-not) for the currently selected provider."""
    routes = _order()
    if not routes:
        return False, "VISION_PROVIDER=off"
    if any(_PROBES[r]() for r in routes):
        return True, ""
    reasons = []
    if "mcp" in routes:
        reasons.append(f"MCP({zai_vision_mcp.unavailable_reason()})")
    if "rest" in routes:
        reasons.append("REST(GLM_VISION/GLM_API_KEY 미설정)")
    return False, " · ".join(reasons) or "사용 가능한 vision 백엔드 없음"


def unavailable_reason() -> str:
    return available()[1]


def is_ok(result: dict[str, Any]) -> bool:
    return result.get("_mode") == "ok"


# ── the single entry point ───────────────────────────────────────────────────
def ocr_business_card(
    image_bytes: bytes,
    *,
    mime_type: str = "image/jpeg",
    filename: str = "",
    hint: str = "",
    logs: list[str] | None = None,
) -> dict[str, Any]:
    def _log(msg: str) -> None:
        if logs is not None:
            logs.append(msg)
            print(msg, flush=True)

    routes = _order()
    if not routes:
        return {"_mode": "off", "message": "VISION_PROVIDER=off"}

    last: dict[str, Any] = {"_mode": "unavailable", "message": unavailable_reason()}
    for route in routes:
        if not _PROBES[route]():
            continue
        if route == "mcp":
            _log(f"  🪪 Vision[mcp] OCR 시도: {filename}")
            res = zai_vision_mcp.analyze_business_card(
                image_bytes, mime_type=mime_type, hint=hint, logs=logs
            )
            if res.get("_mode") == "glm_mcp":
                res["_mode"] = "ok"
                res["_provider"] = "mcp"
                return res
            last = res
            _log(f"  ⚠️ Vision[mcp] 실패 → 다음 백엔드 시도: {res.get('message', '')}")
        elif route == "rest":
            _log(f"  🪪 Vision[rest] OCR 시도: {filename}")
            res = glm.extract_business_card_image(
                image_bytes, mime_type=mime_type, filename=filename, hint=hint
            )
            if res.get("_mode") == "glm":
                res["_mode"] = "ok"
                res["_provider"] = "rest"
                return res
            last = res
            _log(f"  ⚠️ Vision[rest] 실패: {res.get('message', '')}")
    return last
