"""GLM client — natural-language search and profile inference.

Uses the same GLM_* configuration as the collector package
(GLM_API_URL / GLM_API_KEY / GLM_MODEL), assuming an OpenAI-compatible
chat/completions endpoint. When GLM is not configured or unreachable, callers
fall back to deterministic behaviour, so the app degrades gracefully.
"""
from __future__ import annotations

import json
import os
import re
import ssl
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


def config() -> dict[str, str]:
    return {
        "url": os.environ.get("GLM_API_URL", "").strip(),
        "key": os.environ.get("GLM_API_KEY", "").strip(),
        "model": os.environ.get("GLM_MODEL", "").strip() or "glm-4",
    }


def is_configured() -> bool:
    c = config()
    return bool(c["url"] and c["key"])


def _endpoint(url: str) -> str:
    url = url.rstrip("/")
    if url.endswith("/chat/completions"):
        return url
    return f"{url}/chat/completions"


def chat(system: str, user: str, max_tokens: int = 4096) -> str:
    c = config()
    if not (c["url"] and c["key"]):
        raise RuntimeError("GLM not configured")
    body = json.dumps(
        {
            "model": c["model"],
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.1,
            "max_tokens": max_tokens,
        }
    ).encode("utf-8")
    req = Request(
        _endpoint(c["url"]),
        data=body,
        headers={
            "Authorization": f"Bearer {c['key']}",
            "Content-Type": "application/json",
        },
    )
    try:
        with _urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except URLError as exc:
        raise RuntimeError(f"GLM 연결 실패: {getattr(exc, 'reason', exc)}") from exc
    return payload["choices"][0]["message"]["content"]


def _urlopen(req: Request, timeout: int):
    try:
        return urlopen(req, timeout=timeout)
    except URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
            return urlopen(req, timeout=timeout, context=ssl._create_unverified_context())
        raise


def _json_from_text(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of a model response (handles code fences)."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fenced.group(1) if fenced else None
    if raw is None:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        raw = brace.group(0) if brace else "{}"
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return {}


SEARCH_SYSTEM = (
    "너는 RTM 고객 DB 검색 어시스턴트다. 사용자의 자연어 질의를 아래 JSON 필터로 변환해라. "
    "설명 없이 JSON만 출력한다.\n"
    '{"industries":[],"interests":[],"sources":[],"statuses":[],"owners":[],'
    '"keywords":[],"min_activities":0}\n'
    "interests는 Hubble, EHM, RISA, M.AX Agent, TS Agent, 기타 중에서만 고른다. "
    "해당 없으면 빈 배열. 회사/사람 이름 등 구체 단어는 keywords에 넣는다."
)


def extract_search_filters(query: str) -> dict[str, Any]:
    """NL query → structured filter dict (GLM), or keyword fallback."""
    if not is_configured():
        # tokenized substring search; drop very common filler words
        stop = {"고객", "관심", "회사", "찾아줘", "알려줘", "리드"}
        tokens = [t for t in re.split(r"\s+", query.strip()) if t and t not in stop]
        return {"keywords": tokens, "_mode": "fallback"}
    try:
        content = chat(SEARCH_SYSTEM, query, max_tokens=2048)
        data = _json_from_text(content)
        data.setdefault("keywords", [])
        data["_mode"] = "glm"
        return data
    except Exception as exc:  # noqa: BLE001
        return {"keywords": [query.strip()], "_mode": "fallback", "_error": str(exc)}


INFER_SYSTEM = (
    "너는 B2B 기업 정보 분석가다. 주어진 회사명과 문맥으로 업종을 추정해라. "
    "설명 없이 JSON만 출력한다.\n"
    '{"industry":"","sub_industry":"","description":"","confidence":0.0}\n'
    "추정 근거가 약하면 confidence를 낮게 준다. 모르면 빈 문자열."
)


def infer_company_profile(name: str, context: str = "") -> dict[str, Any]:
    if not is_configured():
        return {"_mode": "unavailable", "message": "GLM이 설정되지 않았습니다 (GLM_API_URL/GLM_API_KEY)."}
    user = f"회사명: {name}\n문맥:\n{context[:1500]}"
    try:
        data = _json_from_text(chat(INFER_SYSTEM, user, max_tokens=2048))
        data["_mode"] = "glm"
        return data
    except Exception as exc:  # noqa: BLE001
        return {"_mode": "error", "message": str(exc)}
