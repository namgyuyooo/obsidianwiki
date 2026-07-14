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

import io
import os
from typing import Any, Callable

from PIL import Image, ImageOps

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

    def run_once(data: bytes, current_mime: str, rotation: int) -> dict[str, Any]:
        last: dict[str, Any] = {"_mode": "unavailable", "message": unavailable_reason()}
        for route in routes:
            if not _PROBES[route]():
                continue
            _log(f"  🪪 Vision[{route}] OCR 시도: {filename} (회전 {rotation}°)")
            if route == "mcp":
                res = zai_vision_mcp.analyze_business_card(
                    data, mime_type=current_mime, hint=hint, logs=logs
                )
                success_mode = "glm_mcp"
            else:
                res = glm.extract_business_card_image(
                    data, mime_type=current_mime, filename=filename, hint=hint
                )
                success_mode = "glm"
            if res.get("_mode") == success_mode:
                res["_mode"] = "ok"
                res["_provider"] = route
                res["_rotation"] = rotation
                return res
            last = res
            _log(f"  ⚠️ Vision[{route}] 실패: {res.get('message', '')}")
        return last

    normalized = image_bytes
    portrait = False
    pil_image: Image.Image | None = None
    try:
        pil_image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
        portrait = pil_image.height > pil_image.width * 1.12
        output = io.BytesIO()
        fmt = "PNG" if "png" in mime_type.lower() else "JPEG"
        save_image = pil_image if fmt == "PNG" else pil_image.convert("RGB")
        save_image.save(output, format=fmt, quality=94)
        normalized = output.getvalue()
        _log(f"  · 이미지 방향 정규화: {pil_image.width}×{pil_image.height}{' (세로)' if portrait else ''}")
    except Exception as exc:  # noqa: BLE001
        _log(f"  · 이미지 방향 메타데이터 보정 건너뜀: {exc}")

    def score(result: dict[str, Any]) -> float:
        if not is_ok(result):
            return -1.0
        populated = sum(bool(str(result.get(k) or "").strip()) for k in (
            "company", "name", "email", "mobile", "phone", "department", "title"
        ))
        return populated + float(result.get("confidence") or 0) * 2 + (2 if "@" in str(result.get("email") or "") else 0)

    best = run_once(normalized, mime_type, 0)
    # 세로 사진은 실제 명함 방향과 촬영 방향이 어긋나는 경우가 많다. 결과가 충분히
    # 풍부하지 않을 때만 90/270도를 재시도해 비용과 지연을 제한한다.
    if portrait and pil_image is not None and score(best) < 6.0:
        for angle in (90, 270):
            _log(f"  ↻ 세로 명함 저품질 감지 — {angle}° 자동 회전 재시도")
            rotated = pil_image.rotate(-angle, expand=True)
            output = io.BytesIO()
            rotated.convert("RGB").save(output, format="JPEG", quality=94)
            candidate = run_once(output.getvalue(), "image/jpeg", angle)
            if score(candidate) > score(best):
                best = candidate
            if score(best) >= 7.0:
                break
    return best
