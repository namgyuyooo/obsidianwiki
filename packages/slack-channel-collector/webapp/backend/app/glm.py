"""GLM client — natural-language search and profile inference.

Uses the same GLM_* configuration as the collector package
(GLM_API_URL / GLM_API_KEY / GLM_MODEL), assuming an OpenAI-compatible
chat/completions endpoint. When GLM is not configured or unreachable, callers
fall back to deterministic behaviour, so the app degrades gracefully.
"""
from __future__ import annotations

import base64
import json
import os
import re
import ssl
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def config() -> dict[str, str]:
    url = os.environ.get("GLM_API_URL", "").strip()
    # z.ai '코딩 요금제' 엔드포인트(/api/coding/paas)는 비전 모델을 제공하지 않는다.
    # 비전(명함 OCR)은 표준 엔드포인트(/api/paas)로 자동 전환하되, 명시적 override 우선.
    vision_url = os.environ.get("GLM_VISION_API_URL", "").strip()
    if not vision_url:
        vision_url = url.replace("/api/coding/paas/", "/api/paas/") if "/api/coding/paas/" in url else url
    return {
        "url": url,
        "key": os.environ.get("GLM_API_KEY", "").strip(),
        "model": os.environ.get("GLM_MODEL", "").strip() or "glm-4",
        "vision_model": os.environ.get("GLM_VISION_MODEL", "").strip() or "glm-4.5v",
        "vision_url": vision_url,
        "embedding_model": os.environ.get("GLM_EMBEDDING_MODEL", "").strip() or "embedding-3",
    }


def is_configured() -> bool:
    c = config()
    return bool(c["url"] and c["key"])


def _endpoint(url: str) -> str:
    url = url.rstrip("/")
    if url.endswith("/chat/completions"):
        return url
    return f"{url}/chat/completions"


def _embeddings_endpoint(url: str) -> str:
    url = url.rstrip("/")
    if url.endswith("/embeddings"):
        return url
    if url.endswith("/chat/completions"):
        return url[: -len("/chat/completions")] + "/embeddings"
    return f"{url}/embeddings"


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
    payload = _request_json(req, timeout=30)
    return payload["choices"][0]["message"]["content"]


def chat_messages(
    messages: list[dict[str, Any]], *, model: str | None = None,
    max_tokens: int = 2048, base_url: str | None = None,
) -> str:
    c = config()
    if not (c["url"] and c["key"]):
        raise RuntimeError("GLM not configured")
    body = json.dumps(
        {
            "model": model or c["model"],
            "messages": messages,
            "temperature": 0.0,
            "max_tokens": max_tokens,
            "thinking": {"type": "disabled"},
        }
    ).encode("utf-8")
    req = Request(
        _endpoint(base_url or c["url"]),
        data=body,
        headers={
            "Authorization": f"Bearer {c['key']}",
            "Content-Type": "application/json",
        },
    )
    payload = _request_json(req, timeout=60)
    return payload["choices"][0]["message"]["content"]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return embeddings from an OpenAI-compatible /embeddings endpoint."""
    c = config()
    if not (c["url"] and c["key"]):
        raise RuntimeError("GLM not configured")
    clean = [str(t or "")[:6000] for t in texts]
    body = json.dumps({"model": c["embedding_model"], "input": clean}).encode("utf-8")
    req = Request(
        _embeddings_endpoint(c["url"]),
        data=body,
        headers={
            "Authorization": f"Bearer {c['key']}",
            "Content-Type": "application/json",
        },
    )
    payload = _request_json(req, timeout=60)
    rows = payload.get("data") or []
    rows = sorted(rows, key=lambda r: int(r.get("index", 0)))
    vectors: list[list[float]] = []
    for row in rows:
        vec = row.get("embedding")
        if not isinstance(vec, list):
            raise RuntimeError("GLM embedding 응답 형식 오류")
        vectors.append([float(x) for x in vec])
    if len(vectors) != len(clean):
        raise RuntimeError("GLM embedding 응답 개수 불일치")
    return vectors


def _urlopen(req: Request, timeout: int):
    try:
        return urlopen(req, timeout=timeout)
    except URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
            return urlopen(req, timeout=timeout, context=ssl._create_unverified_context())
        raise


def _request_json(req: Request, timeout: int) -> dict[str, Any]:
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            with _urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except HTTPError as exc:
            last_exc = exc
            if exc.code == 429 and attempt < 2:
                wait_seconds = max(2, int(exc.headers.get("Retry-After", "3") if exc.headers else "3"))
                time.sleep(wait_seconds)
                continue
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"GLM 연결 실패: HTTP {exc.code} {body[:200]}") from exc
        except URLError as exc:
            last_exc = exc
            reason = getattr(exc, "reason", exc)
            if "Too Many Requests" in str(reason) and attempt < 2:
                time.sleep(3 + attempt * 3)
                continue
            raise RuntimeError(f"GLM 연결 실패: {reason}") from exc
    raise RuntimeError(f"GLM 연결 실패: {last_exc}")


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

BUSINESS_CARD_SYSTEM = (
    "너는 한국 B2B 영업팀의 명함 OCR/정규화 엔진이다. "
    "명함 이미지에서 보이는 텍스트만 근거로 아래 JSON만 출력한다. 설명/코드펜스 금지.\n"
    "{\n"
    '  "company": "",\n'
    '  "name": "",\n'
    '  "department": "",\n'
    '  "title": "",\n'
    '  "email": "",\n'
    '  "phone": "",\n'
    '  "mobile": "",\n'
    '  "website": "",\n'
    '  "address": "",\n'
    '  "memo": "",\n'
    '  "confidence": 0.0,\n'
    '  "review_required": true,\n'
    '  "evidence": "읽힌 핵심 텍스트 1~3줄"\n'
    "}\n"
    "규칙:\n"
    "- 회사명/이름/이메일/휴대폰/직급을 우선 추출한다.\n"
    "- 이메일은 소문자로, 휴대폰/전화는 원문 숫자와 하이픈을 최대한 보존한다.\n"
    "- 휴대폰 번호가 있으면 mobile에, 대표/사무실 번호는 phone에 넣는다.\n"
    "- 불확실하거나 일부가 가려져 있으면 빈 문자열로 두고 confidence를 낮춘다.\n"
    "- 원문에 없는 회사명/이름은 추측하지 않는다.\n"
    "- 명함이 아니거나 읽을 수 없으면 confidence 0.2 이하, review_required true."
)

INVOLVED_COMPANIES_SYSTEM = (
    "너는 RTM 영업 미팅 기록에서 관련 회사를 추출하는 정규화 엔진이다. "
    "Slack 원문을 읽고 아래 JSON만 출력한다. 설명/코드펜스 금지.\n"
    '{"companies":[],"confidence":0.0,"evidence":""}\n'
    "규칙:\n"
    "- 참석자, 관련사, 고객명, Next Steps에 등장한 외부 회사/파트너/고객사를 모두 companies에 넣는다.\n"
    "- `참석자` 아래 `회사명: 사람명 직급` 형식의 콜론 앞 라벨은 외부 회사 후보로 우선 검토한다.\n"
    "- 후보 회사 목록이 제공되면, 그중 외부 회사/파트너/고객사로 판단되는 항목은 누락하지 않는다.\n"
    "- 알티엠, RTM, 우리회사, 내부 담당자는 제외한다.\n"
    "- 사람 이름/직급/부서/제품명은 회사로 넣지 않는다.\n"
    "- 영문 회사명은 원문 표기를 보존하되, 원문과 문맥상 통용 한국어명이 명확하면 한국어 표시명으로 정규화한다.\n"
    "- 원문에 없는 회사는 지어내지 않는다.\n"
    "- 중복/띄어쓰기 변형은 하나로 합친다."
)

COMPANY_CANDIDATE_SYSTEM = (
    "너는 Slack 미팅 참석자 라벨 후보 중 외부 회사만 고르는 검수기다. "
    "아래 JSON만 출력한다. 설명/코드펜스 금지.\n"
    '{"companies":[],"confidence":0.0,"evidence":""}\n'
    "후보 라벨 중 고객사, 파트너사, 협력사는 companies에 넣는다. "
    "RTM, 알티엠, 우리회사, 내부 조직, 사람 이름, 직급, 제품명은 제외한다. "
    "원문/후보에 없는 회사는 추가하지 않는다."
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


def extract_involved_companies(text: str, candidates: list[str] | None = None) -> dict[str, Any]:
    """Slack meeting text -> all non-RTM involved companies."""
    if not is_configured():
        return {"_mode": "unavailable", "message": "GLM이 설정되지 않았습니다 (GLM_API_URL/GLM_API_KEY)."}
    candidate_text = ""
    if candidates:
        candidate_text = "후보 회사 라벨:\n" + "\n".join(f"- {c}" for c in candidates if c) + "\n\n"
    try:
        data = _json_from_text(chat(INVOLVED_COMPANIES_SYSTEM, (candidate_text + text)[:9000], max_tokens=900))
        comps = data.get("companies") if isinstance(data.get("companies"), list) else []
        data["companies"] = [str(c).strip() for c in comps if str(c).strip()]
        data["_mode"] = "glm"
        return data
    except Exception as exc:  # noqa: BLE001
        return {"_mode": "error", "message": str(exc)}


def select_external_company_candidates(text: str, candidates: list[str]) -> dict[str, Any]:
    """Validate generic participant/company candidates with GLM."""
    if not is_configured():
        return {"_mode": "unavailable", "message": "GLM이 설정되지 않았습니다 (GLM_API_URL/GLM_API_KEY)."}
    clean = [str(c).strip() for c in candidates if str(c).strip()]
    if not clean:
        return {"_mode": "glm", "companies": [], "confidence": 0.0}
    user = (
        "후보 라벨:\n"
        + "\n".join(f"- {c}" for c in clean)
        + "\n\n미팅 원문 일부:\n"
        + text[:4000]
    )
    try:
        data = _json_from_text(chat(COMPANY_CANDIDATE_SYSTEM, user, max_tokens=600))
        comps = data.get("companies") if isinstance(data.get("companies"), list) else []
        data["companies"] = [str(c).strip() for c in comps if str(c).strip()]
        data["_mode"] = "glm"
        return data
    except Exception as exc:  # noqa: BLE001
        return {"_mode": "error", "message": str(exc)}


def extract_business_card_image(
    image_bytes: bytes,
    *,
    mime_type: str = "image/jpeg",
    filename: str = "",
    hint: str = "",
) -> dict[str, Any]:
    """Business card image -> structured contact fields via GLM vision."""
    if not is_configured():
        return {"_mode": "unavailable", "message": "GLM이 설정되지 않았습니다 (GLM_API_URL/GLM_API_KEY)."}
    if not image_bytes:
        return {"_mode": "error", "message": "empty image"}
    c = config()
    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type or 'image/jpeg'};base64,{encoded}"
    user_text = "명함 이미지를 OCR해서 고객 DB 입력 필드로 추출해줘."
    if filename:
        user_text += f"\n파일명: {filename}"
    if hint:
        user_text += f"\nSlack 메시지/댓글 힌트:\n{hint[:1000]}"
    try:
        content = chat_messages(
            [
                {"role": "system", "content": BUSINESS_CARD_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
            model=c["vision_model"],
            max_tokens=1200,
            base_url=c["vision_url"],
        )
        data = _json_from_text(content)
        data["_mode"] = "glm"
        data["_model"] = c["vision_model"]
        return data
    except Exception as exc:  # noqa: BLE001
        return {"_mode": "error", "message": f"{c['vision_model']}@{c['vision_url']} — {exc}"}


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
