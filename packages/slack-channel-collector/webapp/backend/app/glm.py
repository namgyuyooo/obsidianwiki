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


# DB 스키마(slack_glm_extraction.schema.json)에 그대로 매핑되는 구조화 추출 프롬프트.
EXTRACT_SYSTEM = (
    "너는 RTM 영업 Slack 메시지를 고객 DB에 넣기 위한 구조화 추출기다. "
    "메시지(및 스레드 댓글)를 읽고 아래 JSON 스키마로만 출력한다. 설명/코드펜스 금지.\n"
    "{\n"
    '  "kind": "lead|activity|company_update|ignore",\n'
    '  "confidence": 0.0,\n'
    '  "evidence": "판단 근거가 된 원문 인용(1~2줄)",\n'
    '  "companies": [{"name":"", "industry":"", "sub_industry":"", "description":""}],\n'
    '  "contacts": [{"email":"", "name":"", "phone":"", "department":"", "title":""}],\n'
    '  "activity": {"occurred_at":"YYYY-MM-DD HH:MM", "activity_type":"방문 미팅|콜|견적|데모|자료요청|후속확인|문의", "solution_name":"", "inquiry_text":"", "next_action":""},\n'
    '  "review_required": true\n'
    "}\n"
    "규칙:\n"
    "- 회사가 여러 곳이면 companies 배열에 모두. 주 고객사를 첫 번째로.\n"
    "- 참석자/담당자는 contacts 배열에. 이메일 없으면 email은 빈 문자열.\n"
    "- solution_name은 Hubble/EHM/RISA/M.AX Agent/TS Agent/기타 중에서만.\n"
    "- 날짜는 본문에서 찾아 YYYY-MM-DD HH:MM. 시간 없으면 00:00.\n"
    "- 값이 불확실하거나 기존 DB와 충돌 가능하면 review_required=true, confidence를 낮게.\n"
    "- 잡담/단순알림이면 kind=ignore.\n"
    "- 원문에 없는 값은 절대 지어내지 말고 빈 문자열."
)


def extract_lead_event(text: str, hint: str = "") -> dict[str, Any]:
    """Slack 원문 → DB 반영 가능한 구조화 결과(GLM). 미설정/실패 시 _mode 표시."""
    if not is_configured():
        return {"_mode": "unavailable", "message": "GLM이 설정되지 않았습니다 (GLM_API_URL/GLM_API_KEY)."}
    user = text if not hint else f"[참고: {hint}]\n{text}"
    try:
        data = _json_from_text(chat(EXTRACT_SYSTEM, user[:6000], max_tokens=900))
        data.setdefault("companies", [])
        data.setdefault("contacts", [])
        data.setdefault("activity", {})
        data["_mode"] = "glm"
        return data
    except Exception as exc:  # noqa: BLE001
        return {"_mode": "error", "message": str(exc)}


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
