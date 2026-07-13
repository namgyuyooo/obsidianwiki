"""Slack lead sync.

Ports the browser ``parseMessages`` / ``applyEvent`` logic from the original
``RTM_고객DB_대시보드.html`` to the backend. Structured bot messages from
릴레잇(홈페이지) and 피트페이퍼 are parsed into lead events and applied to the
customer DB. No GLM required for this path — it recognises the fielded message
formats directly.

Message source (in priority order):
  1. an explicit export JSON file (``export_file`` arg or RTM_SLACK_EXPORT_FILE)
  2. a live collector run (``rtm_slack_channel_collector``) when a Slack token
     is configured
Otherwise a structured "not configured" result is returned (no exception).
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from . import queries
from .config import PACKAGE_ROOT
from .db import get_conn

KST = ZoneInfo("Asia/Seoul")
UNCLASSIFIED = "(미분류)"  # 회사 추출 실패 활동 보존용 placeholder


def _ensure_collector_importable() -> None:
    """Allow importing the collector from the sibling src/ tree even when the
    `rtm_slack_channel_collector` package isn't pip-installed."""
    src = PACKAGE_ROOT / "src"
    if src.is_dir() and str(src) not in sys.path:
        sys.path.insert(0, str(src))


# ── message parsing ──────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"[^\s<>|@()（）,]+@[^\s<>|@()（）,]+\.[^\s<>|@()（）,]+")


def _mail_of(text: str) -> str:
    """Extract a single email address, preferring an explicit mailto: link.

    Never returns the whole blob — falls back to a proper email-token regex so
    a field that merely *contains* text with an '@' can't leak in as the email.
    """
    m = re.search(r"mailto:([^|>\s]+)", text or "")
    if m:
        return m.group(1)
    m2 = _EMAIL_RE.search(text or "")
    return m2.group(0) if m2 else ""


def _g(pattern: str, text: str) -> str:
    m = re.search(pattern, text or "")
    return m.group(1).strip() if m else ""


def _ts_to_kst(ts: str | float) -> str:
    try:
        dt = datetime.fromtimestamp(float(ts), tz=KST)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError, OSError):
        return ""


def parse_inbound(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """#sales-inbound 전략: 릴레잇/피트페이퍼 훅 봇 메시지 → 신규 리드 이벤트."""
    return parse_messages(messages)


def parse_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn normalized Slack messages into lead events.

    Each event: ts, dt, src(relate|featpaper), em, nm, ph, co, dept, title,
    it, iq. Detection is by message text shape (robust to workspace-specific
    bot user ids). Thread replies are flattened in.
    """
    flat: list[dict[str, Any]] = []
    for msg in messages:
        flat.append(msg)
        for reply in msg.get("thread_replies", []) or []:
            flat.append(reply)

    out: list[dict[str, Any]] = []
    for msg in flat:
        text = msg.get("text", "") or ""
        ts = msg.get("ts", "") or ""
        dt = _ts_to_kst(ts)

        # 릴레잇(홈페이지) 문의 폼
        if "업무용 이메일:" in text and "이름:" in text:
            raw = _g(r"업무용 이메일: \*(.*?)\*", text)
            em = _mail_of(raw) or raw
            if "@" not in em:
                continue
            out.append({
                "ts": ts, "dt": dt, "src": "relate", "em": em.lower(),
                "nm": _g(r"이름: \*(.*?)\*", text),
                "ph": _g(r"휴대폰 번호: \*(.*?)\*", text),
                "co": _g(r"회사명: \*(.*?)\*", text),
                "dept": _g(r"부서명: \*(.*?)\*", text),
                "title": _g(r"직책: \*(.*?)\*", text),
                "it": _g(r"관심 솔루션: \*(.*?)\*", text),
                "iq": _g(r"문의내용: \*([\s\S]*?)\*", text)[:300],
            })
            continue

        # 피트페이퍼 폼 (Document / 성함 필드)
        if "*Document*" in text or "*성함*" in text:
            doc = _g(r"\*Document\*\n(.+)", text)
            em = _mail_of(text) or _g(r"\*(?:업무 이메일|Email)\*\n([^\n<]+)", text)
            em = (em or "").lower()
            if "@" not in em:
                continue
            nm = _g(r"\*성함\*\n(.+)", text)
            if "mailto" in nm:
                nm = ""
            out.append({
                "ts": ts, "dt": dt, "src": "featpaper", "em": em, "nm": nm,
                "ph": _g(r"\*(?:휴대폰 번호|Phone)\*\n(?:<tel:)?([\d\-]+)", text),
                "co": _g(r"\*(?:회사명|Company)\*\n(.+)", text),
                "dept": "", "title": "", "it": doc, "iq": "",
            })
            continue

        # 피트페이퍼 열람 알림 (영문): "EHM Brochure has been viewed"
        if re.search(r"has been viewed|열람하였습니다|viewed the", text, re.I):
            em = _mail_of(text)
            doc_m = re.search(r"(.+?)\s+(?:Brochure|소개서)?\s*has been viewed", text, re.I)
            doc = (doc_m.group(1).strip() if doc_m else "").splitlines()[-1] if doc_m else ""
            # 상세 필드(있으면): 회사/이름/이메일
            co = _g(r"(?:Company|회사명?)\s*[:：]\s*(.+)", text)
            nm = _g(r"(?:Name|성함|이름)\s*[:：]\s*(.+)", text)
            sol = next((s for s in _SOLUTIONS if s.lower() in text.lower()), "")
            if not em and not co:
                # 이메일·회사 정보가 전혀 없으면 리드로 만들지 않음(원문은 raw 보존)
                continue
            out.append({
                "ts": ts, "dt": dt, "src": "featpaper", "em": (em or "").lower(),
                "nm": nm, "ph": "", "co": co, "dept": "", "title": "",
                "it": sol or doc, "iq": _clean_note(text)[:200],
            })
            continue

        # 피트페이퍼 열람 안내
        if "열람 안내" in text:
            em = _mail_of(text)
            if not em:
                continue
            bullets = [
                b.strip()
                for b in re.findall(r"• ?([^\n•]*)", text)
                if b.strip() and not b.strip().startswith("<https")
            ]
            doc_m = re.search(r"\[(.*?) 열람 안내\]", text)
            doc = doc_m.group(1) if doc_m else ""
            co = nm = ph = ""
            if len(bullets) >= 4:
                co, nm, ph = bullets[0], bullets[1], re.sub(r"\D", "", bullets[3])
            out.append({
                "ts": ts, "dt": dt, "src": "featpaper", "em": em.lower(),
                "nm": nm, "ph": ph, "co": co, "dept": "", "title": "",
                "it": doc, "iq": "",
            })
    return out


# ── cross-team meeting-log strategy ──────────────────────────────────────────
_FIELD_KEYS = [
    "발생일시", "유입경로", "회사명", "고객명", "관련사", "업종", "세부분야", "회사설명",
    "이름", "부서", "직급", "이메일", "휴대폰", "관심 솔루션", "활동유형",
    "방문 일자", "방문일자", "방문 목적", "방문목적", "문의내용", "활동내용",
    "결과", "다음 액션", "Next Plan", "확인상태", "근거",
]
_SOLUTIONS = ["Hubble", "EHM", "RISA", "M.AX Agent", "TS Agent"]


def _fields(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in (text or "").splitlines():
        # strip leading bullets/emphasis (■ • * · -) used in real meeting logs
        line = re.sub(r"^\s*[■•*·\-]+\s*", "", line)
        line = line.replace("*", "")
        m = re.match(r"^\s*([가-힣A-Za-z ]+?)\s*[:：]\s*(.+?)\s*$", line)
        if m and m.group(1).strip() in _FIELD_KEYS:
            out[m.group(1).strip()] = m.group(2).strip()
    return out


def _clean_note(text: str) -> str:
    t = re.sub(r"<@[UWB][A-Z0-9]+>", "", text or "")
    t = re.sub(r"<(https?://[^|>]+)(?:\|[^>]*)?>", r"\1", t)
    t = t.replace("*", "").replace("■", "").strip()
    return re.sub(r"\s+", " ", t)[:600]


def _norm_date(value: str, fallback: str) -> str:
    v = (value or "").strip()
    # 2026-07-08 14:00 / 2026-07-08
    m = re.match(r"(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?", v)
    if not m:
        # 26.07.08
        m2 = re.match(r"(\d{2})[.](\d{1,2})[.](\d{1,2})", v)
        if m2:
            y, mo, d = "20" + m2.group(1), m2.group(2), m2.group(3)
            return f"{y}-{int(mo):02d}-{int(d):02d} 00:00:00"
        return fallback
    y, mo, d = m.group(1), int(m.group(2)), int(m.group(3))
    hh = int(m.group(4)) if m.group(4) else 0
    mm = int(m.group(5)) if m.group(5) else 0
    return f"{y}-{mo:02d}-{d:02d} {hh:02d}:{mm:02d}:00"


def _parse_contact_lines(text: str) -> list[dict[str, str]]:
    """Parse '고객 담당자:' bullet lines: 이름 / 부서 / 직급 / 이메일 / 휴대폰."""
    contacts = []
    section = re.search(r"고객 담당자\s*[:：]\s*\n((?:\s*[-•].*\n?)+)", text)
    if not section:
        return contacts
    for line in section.group(1).splitlines():
        line = re.sub(r"^\s*[-•]\s*", "", line).strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("/")]
        c = {"name": "", "department": "", "title": "", "email": "", "phone": ""}
        rest = []
        for p in parts:
            if "@" in p or "mailto:" in p:
                c["email"] = _mail_of(p)
            elif re.fullmatch(r"[\d\s\-]+", p):
                c["phone"] = p
            else:
                rest.append(p)
        if rest:
            c["name"] = rest[0]
        if len(rest) > 1:
            c["department"] = rest[1]
        if len(rest) > 2:
            c["title"] = rest[2]
        if c["email"] or c["name"]:
            contacts.append(c)
    return contacts


def parse_cross_team(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """#tf_cross_team_sales 전략: 사람이 작성한 미팅/활동 템플릿 → 이벤트.

    event kinds: lead / activity / company_update. `review_required`가 True면
    (확인상태=확인 필요/추정) 자동 확정 대신 검수 큐로 보낸다.
    """
    out: list[dict[str, Any]] = []
    # top-level 메시지 기준. 스레드 댓글은 '연결 정보'로 취급해 추출에 합치되(combined),
    # 원문(source_text)은 부모 메시지, 댓글은 comments로 분리 보존한다.
    for msg in messages:
        text = msg.get("text", "") or ""
        ts = msg.get("ts", "") or ""
        dt = _ts_to_kst(ts)
        replies = msg.get("thread_replies", []) or []
        reply_text = "\n".join(r.get("text", "") for r in replies if r.get("text"))
        combined = text + (("\n---(스레드)---\n" + reply_text) if reply_text else "")
        f = _fields(combined)

        # company: 회사명 / 고객명 (guide or real meeting-log format), 실패 시 자유형식 추출
        company = f.get("회사명") or f.get("고객명") or ""
        if not company:
            m = re.search(r"(?:고객명|회사명)\s*[:：]\s*(.+)", combined)
            company = m.group(1).strip() if m else ""
        if not company:
            company = _company_from_freeform(text) or _company_from_freeform(reply_text)

        companies = _split_companies(company) + _split_companies(f.get("관련사", ""))
        companies = list(dict.fromkeys([c for c in companies if c]))

        # 원문 보존 우선: 회사 추출 실패해도 활동 신호가 있으면 버리지 않는다.
        stripped = re.sub(r"<@[UWB][A-Z0-9]+>", "", text).strip()
        is_activity = bool(_ACTIVITY_SIGNALS.search(combined)) and len(stripped) > 15
        if not companies and not is_activity:
            continue  # 순수 잡담/멘션만 → 활동으로 만들지 않음 (원문은 raw에 보존됨)

        confirm = f.get("확인상태", "")
        review_required = ("확인 필요" in confirm) or ("추정" in confirm)
        # 발생일시 필드 → 제목/본문의 날짜 → 메시지 ts 순으로 활동일 결정
        date_raw = f.get("발생일시") or f.get("방문 일자") or f.get("방문일자") or ""
        if not date_raw:
            md = re.search(r"\d{4}[.\-]\d{1,2}[.\-]\d{1,2}", text)
            date_raw = md.group(0) if md else ""
        occurred = _norm_date(date_raw, dt)

        # 관심 솔루션: 명시 필드 우선, 없으면 본문+댓글 키워드 감지
        solution = f.get("관심 솔루션", "")
        if not solution:
            hits = [s for s in _SOLUTIONS if s.lower() in combined.lower()]
            solution = ", ".join(hits)

        next_action = f.get("다음 액션") or f.get("Next Plan") or ""
        if not next_action:
            m = re.search(r"(?:Next Plan|다음\s*액션|다음\s*단계)\s*[:：]?\s*(.+)", combined, re.I | re.S)
            if m:
                next_action = re.sub(r"\s+", " ", m.group(1)).strip()[:200]

        inquiry = f.get("활동내용") or f.get("문의내용") or f.get("방문 목적") or f.get("방문목적") or ""
        if not inquiry:
            inquiry = _clean_note(text)  # 원문(부모) 노트

        kind = "activity"
        if "[신규 리드]" in combined or text.lstrip().startswith("신규 리드"):
            kind = "lead"
        elif "회사 정보 업데이트" in combined or "[회사 정보" in combined:
            kind = "company_update"

        # 담당자: 본문+댓글에서 이메일/담당자 추출 (댓글에 연락처가 오는 경우 多)
        contacts = _parse_contact_lines(combined)
        if not contacts:
            em = _mail_of(f.get("이메일", "")) or _mail_of(combined)
            if em or f.get("이름"):
                contacts = [{
                    "name": f.get("이름", ""), "department": f.get("부서", ""),
                    "title": f.get("직급", ""), "email": em, "phone": f.get("휴대폰", ""),
                }]
        contacts = [c for c in contacts if c.get("email")]

        out.append({
            "ts": ts, "dt": occurred, "kind": kind,
            "companies": companies, "primary_co": companies[0] if companies else "",
            "co": companies[0] if companies else "",
            "contacts": contacts, "it": solution, "iq": inquiry,
            "source_text": text,  # 원문(부모 메시지) 그대로 보존
            "next": next_action, "atype": f.get("활동유형", "") or "미팅/보고",
            "review_required": review_required,
            "industry": f.get("업종", ""), "sub_industry": f.get("세부분야", ""),
            "description": f.get("회사설명", ""),
        })
    return out


def _clean_company(name: str) -> str:
    """Strip Slack links, URL parentheticals, and trailing junk from a company name."""
    n = re.sub(r"<[^>]*>", "", name or "")          # <http...|..> / <@U..>
    n = re.sub(r"\((?=[^)]*(?:https?://|www\.|@|\|))[^)]*\)", "", n)  # (url) parenthetical
    n = re.sub(r"\(\s*\)", "", n)                    # empty parens left over
    n = n.replace("*", "").strip().strip(" .,-·")
    # reject leftovers that are clearly not a company name
    if not n or re.search(r"https?://|www\.|@|\|", n) or len(n) > 40:
        return ""
    return n


_ACTIVITY_SIGNALS = re.compile(
    r"미팅|방문|참석자|논의|결과|견적|데모|문의|고객|회사명|고객명|"
    r"Hubble|EHM|RISA|M\.AX|TS Agent|PoC|납품|발주|영업|상담|소개서"
)
_CO_STOPWORDS = {
    "미팅", "방문", "결과", "내역", "내용", "공유", "금일", "오늘", "고객", "고객사",
    "회사", "각", "사", "2사", "3사", "관련", "차장", "부장", "대표", "이사", "책임",
}


def _company_from_freeform(text: str) -> str:
    """회사명 필드가 없을 때 제목/본문에서 회사명을 best-effort 추출.

    예) '*2026.01.22 아사히카세히 미팅 결과*' → '아사히카세히'
        '아사히 카세히 미팅 내역 공유드립니다' → '아사히 카세히'
    """
    head = "\n".join((text or "").splitlines()[:2])
    head = re.sub(r"<@[UWB][A-Z0-9]+>", "", head)
    head = re.sub(r"[:*_]|:[a-z_]+:", "", head)
    # 보수적: 이름은 짧고(≤14자, 공백 0~1개) 동사/명사 조각이 아니어야 함.
    patterns = [
        r"\d{4}[.\-]\d{1,2}[.\-]\d{1,2}\s*([가-힣A-Za-z()]{2,14}(?:\s[가-힣A-Za-z()]{1,12})?)\s*(?:미팅|방문)",
        r"^\s*([가-힣A-Za-z()]{2,14}(?:\s[가-힣A-Za-z()]{1,12})?)\s*(?:미팅|방문)\s*(?:내역|결과|내용|공유)",
    ]
    bad_frag = ("통화", "대응", "신청", "논의", "확인", "문의", "과제", "건", "안내", "요청", "관련")
    for pat in patterns:
        m = re.search(pat, head)
        if not m:
            continue
        cand = _clean_company(m.group(1))
        for w in _CO_STOPWORDS:
            cand = re.sub(rf"\s*{re.escape(w)}\s*$", "", cand).strip()
        if (
            cand
            and cand not in _CO_STOPWORDS
            and 2 <= len(cand) <= 14
            and cand.count(" ") <= 1
            and not any(b in cand for b in bad_frag)
        ):
            return cand
    return ""


def _split_companies(value: str) -> list[str]:
    """'PSKH, PSK, 에이비씨' → ['PSKH','PSK','에이비씨'] (URL-safe, no '/' split)."""
    if not value:
        return []
    value = re.sub(r"<[^>]*>", "", value)  # drop links before splitting
    parts = re.split(r"[,、]| 및 |과 |와 ", value)
    out = []
    for p in parts:
        c = _clean_company(p)
        if c:
            out.append(c)
    return out


# ── message loading ──────────────────────────────────────────────────────────
def _load_from_export(path: Path) -> tuple[list[dict], str, str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload, "", str(path)
    channel_id = (payload.get("channel") or {}).get("id", "") or payload.get("channel_id", "")
    return payload.get("messages", []), channel_id, str(path)


FULL_LOOKBACK_HOURS = 24 * 3650  # ~10 years → effectively "all history"
FULL_LIMIT = 1_000_000  # paginate to exhaustion


def _load_from_collector(
    settings: dict,
    limit: int | None = None,
    channel_id: str | None = None,
    full: bool = False,
) -> tuple[list[dict], str, str]:
    _ensure_collector_importable()
    from rtm_slack_channel_collector import collector  # type: ignore

    overrides: dict[str, Any] = {}
    if channel_id:
        overrides["channel_id"] = channel_id
    elif settings.get("channel_id"):
        overrides["channel_id"] = settings["channel_id"]

    lookback = int(settings.get("lookback_hours") or 24)
    if full:
        # 초기 전체 히스토리 백필: 시간 창을 사실상 무제한으로 넓히고 전량 수집
        lookback = FULL_LOOKBACK_HOURS
        if not limit:
            limit = FULL_LIMIT
        # collector가 자체 state 파일로 증분 동작해 최근 것만 가져오는 것을 방지:
        # 존재하지 않는 임시 state 경로를 지정해 lookback 창 전체를 강제 수집.
        import tempfile

        tmp_state = Path(tempfile.gettempdir()) / f"rtm_backfill_state_{channel_id or 'ch'}.json"
        if tmp_state.exists():
            tmp_state.unlink()
        overrides["state_path"] = tmp_state
    if limit:
        overrides["limit"] = int(limit)
        # count 기준으로 최신 N개를 가져오도록 시간 창을 넓힌다
        lookback = max(lookback, FULL_LOOKBACK_HOURS)
    overrides["lookback_hours"] = lookback

    config = collector.CollectionConfig.from_env(require_token=True)
    config = config.__class__(**{**config.__dict__, **overrides})
    result = collector.collect_once(config, dry_run=True)  # dry_run keeps payload in memory
    payload = result.get("sample_payload", {})
    return payload.get("messages", []), result.get("channel_id", ""), result.get("channel_id", "")


def _store_raw_message(conn, channel_id: str, msg: dict, permalink: str) -> None:
    """Preserve the original Slack message (text + permalink + payload)."""
    ts = str(msg.get("ts", ""))
    if not ts:
        return
    payload = dict(msg)
    payload["permalink"] = permalink
    thread_ts = str(msg.get("thread_ts", "") or "")
    conn.execute(
        """
        INSERT INTO slack_raw_messages(channel_id, message_ts, user_id, text, raw_payload, thread_ts)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(channel_id, message_ts) DO UPDATE SET
          text = excluded.text, raw_payload = excluded.raw_payload, thread_ts = excluded.thread_ts
        """,
        (
            channel_id,
            ts,
            str(msg.get("user", "")),
            msg.get("text", ""),
            json.dumps(payload, ensure_ascii=False),
            thread_ts,
        ),
    )


def resolve_users(conn) -> dict:
    """Slack users.list로 ID→이름 매핑을 받아 slack_users에 저장.

    토큰이 없으면 아무것도 안 하고 현재 저장된 수만 반환.
    """
    has_token = bool(
        os.environ.get("SLACK_BOT_TOKEN")
        or os.environ.get("SLACK_USER_TOKEN")
        or os.environ.get("SLACK_TOKEN")
    )
    if not has_token:
        n = conn.execute("SELECT COUNT(*) FROM slack_users").fetchone()[0]
        return {"ok": False, "configured": False, "stored": n,
                "message": "SLACK 토큰이 없어 유저 이름을 가져올 수 없습니다."}
    try:
        _ensure_collector_importable()
        from rtm_slack_channel_collector import collector  # type: ignore

        config = collector.CollectionConfig.from_env(require_token=True)
        client = collector.SlackClient(config.token, config.api_min_interval_seconds)
        cursor, added = "", 0
        while True:
            payload = client.request("users.list", {"limit": 200, "cursor": cursor})
            for u in payload.get("members", []):
                uid = u.get("id")
                if not uid:
                    continue
                prof = u.get("profile", {}) or {}
                name = prof.get("display_name") or prof.get("real_name") or u.get("real_name") or u.get("name") or ""
                conn.execute(
                    "INSERT INTO slack_users(user_id, name, real_name) VALUES (?,?,?) "
                    "ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, "
                    "real_name=excluded.real_name, updated_at=CURRENT_TIMESTAMP",
                    (uid, name, u.get("real_name", "") or prof.get("real_name", "")),
                )
                added += 1
            cursor = payload.get("response_metadata", {}).get("next_cursor", "")
            if not cursor:
                break
        return {"ok": True, "configured": True, "stored": added}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "configured": True, "stored": 0, "message": str(exc)}


def _log(logs: list[str], msg: str) -> None:
    """서버 콘솔 출력 + 응답에 담아 브라우저 콘솔에서도 볼 수 있게 수집."""
    print(msg, flush=True)
    logs.append(msg)


def _mark_applied(conn, channel_id: str, ts: str, kind: str) -> None:
    conn.execute(
        "UPDATE slack_raw_messages SET applied=1, applied_kind=? "
        "WHERE channel_id=? AND message_ts=?",
        (kind, channel_id, str(ts)),
    )


# ── entrypoint ───────────────────────────────────────────────────────────────
def run_sync(
    export_file: str | None = None,
    limit: int | None = None,
    only_channel: str | None = None,
    backfill: bool = False,
) -> dict:
    export_file = export_file or os.environ.get("RTM_SLACK_EXPORT_FILE", "").strip()
    has_token = bool(
        os.environ.get("SLACK_BOT_TOKEN")
        or os.environ.get("SLACK_USER_TOKEN")
        or os.environ.get("SLACK_TOKEN")
    )

    with get_conn() as conn:
        # 대량 수집은 감사 로그에서 제외 (되돌리기는 backups/channel_state로)
        conn.execute("UPDATE change_batch SET logging=0 WHERE id=1")
        settings = queries.get_sync_settings(conn)
        if limit is None:
            limit = int(settings.get("sync_limit") or 0) or None
        channels = settings.get("channels", [])
        state = dict(settings.get("channel_state") or {})

        totals = {"collected": 0, "parsed": 0, "new_leads": 0, "new_activities": 0, "queued": 0}
        per_channel = []
        logs: list[str] = []
        _log(logs, f"[sync] 시작 — backfill={backfill} limit={limit}")
        if has_token and not export_file:
            ru = resolve_users(conn)
            if ru.get("ok"):
                _log(logs, f"[sync] 유저 이름 매핑 {ru['stored']}명 갱신")

        try:
            if export_file:
                p = Path(export_file).expanduser()
                if not p.exists():
                    return _not_ok(f"export 파일을 찾을 수 없습니다: {p}")
                messages, ch_id, source = _load_from_export(p)
                _log(logs, f"[sync] export 로드: {source} ({len(messages)}개 메시지)")
                # strategy = matching configured channel, else inbound
                strat = next(
                    (c.get("strategy", "inbound") for c in channels if c.get("id") == ch_id),
                    "inbound",
                )
                r = _process_channel(conn, ch_id or "export", strat, messages, settings, state, limit, logs)
                _merge_totals(totals, r)
                per_channel.append({"channel": ch_id or source, "strategy": strat, **r})
            elif has_token:
                targets = [c for c in channels if c.get("enabled", True) and c.get("id")]
                if only_channel:
                    targets = [c for c in targets if c["id"] == only_channel]
                if not targets:
                    return _not_ok("활성화된 수집 채널이 없습니다. 동기화 설정을 확인하세요.")
                for ch in targets:
                    # 처음 보는 채널(=수집 이력 없음)은 전체 히스토리 백필
                    is_initial = str(ch["id"]) not in state
                    full = backfill or is_initial
                    _log(logs, f"[sync] #{ch.get('name') or ch['id']} 수집 시작 "
                               f"(전략={ch.get('strategy')}, {'전체 백필' if full else '증분'})")
                    msgs, ch_id, _ = _load_from_collector(
                        settings, limit=limit, channel_id=ch["id"], full=full
                    )
                    _log(logs, f"[sync] #{ch['id']} Slack에서 {len(msgs)}개 메시지 가져옴")
                    r = _process_channel(conn, ch["id"], ch.get("strategy", "inbound"), msgs, settings, state, limit, logs)
                    _merge_totals(totals, r)
                    per_channel.append({"channel": ch.get("name") or ch["id"], "strategy": ch.get("strategy"), **r})
                source = "collector"
            else:
                return _not_ok(
                    "Slack 동기화가 아직 설정되지 않았습니다. "
                    "SLACK_BOT_TOKEN을 설정하거나, 테스트용으로 RTM_SLACK_EXPORT_FILE에 "
                    "수집 export JSON 경로를 지정하세요."
                )
        except ImportError as exc:
            return _not_ok(f"수집 모듈을 불러올 수 없습니다: {exc}")
        except Exception as exc:  # noqa: BLE001 - surface any collector error to UI
            return _not_ok(f"수집 실패: {exc}")

        queries.save_sync_settings(conn, {"channel_state": state})
        _log(
            logs,
            f"[sync] 완료 — 수집 {totals['collected']} · 파싱 {totals['parsed']} · "
            f"신규 {totals['new_leads']} · 활동 {totals['new_activities']} · 검수 {totals['queued']}",
        )

        parts = []
        if totals["new_leads"]:
            parts.append(f"신규 리드 {totals['new_leads']}건")
        if totals["new_activities"]:
            parts.append(f"활동 {totals['new_activities']}건")
        if totals["queued"]:
            parts.append(f"검수 대기 {totals['queued']}건")
        msg = " · ".join(parts) if parts else "새 항목 없음 — 최신 상태입니다"

        return {
            "ok": True,
            "configured": True,
            "source": source,
            "message": f"동기화 완료 — {msg}",
            "collected": totals["collected"],
            "new_leads": totals["new_leads"],
            "new_activities": totals["new_activities"],
            "queued_reviews": totals["queued"],
            "parsed": totals["parsed"],
            "channels": per_channel,
            "log": logs,
        }


def _merge_totals(totals: dict, r: dict) -> None:
    totals["collected"] += r["collected"]
    totals["parsed"] += r["parsed"]
    totals["new_leads"] += r["new_leads"]
    totals["new_activities"] += r["new_activities"]
    totals["queued"] += r["queued"]


def _process_channel(
    conn, channel_id: str, strategy: str, messages: list[dict],
    settings: dict, state: dict, limit: int | None, logs: list[str] | None = None,
) -> dict:
    logs = logs if logs is not None else []
    if limit:
        messages = sorted(messages, key=lambda m: _ts_float(m.get("ts", 0)), reverse=True)[
            : int(limit)
        ]

    # preserve raw content (text + permalink + thread comments)
    info_by_ts: dict[str, dict] = {}
    for m in messages:
        ts = str(m.get("ts", ""))
        has_pl = bool(m.get("permalink"))
        pl = queries.slack_permalink(channel_id, ts, json.dumps(m) if has_pl else None)
        _store_raw_message(conn, channel_id, m, pl)
        comments = []
        for rep in m.get("thread_replies", []) or []:
            rts = str(rep.get("ts", ""))
            rpl = queries.slack_permalink(channel_id, rts, None)
            _store_raw_message(conn, channel_id, {**rep, "is_reply": True}, rpl)
            if rep.get("text"):
                comments.append({"ts": rts, "text": rep.get("text", ""), "permalink": rpl})
        info_by_ts[ts] = {"permalink": pl, "comments": comments, "channel_id": channel_id}

    # parse by strategy
    if strategy == "cross_team":
        events = parse_cross_team(messages)
    else:
        events = parse_inbound(messages)
        allowed = set()
        if settings.get("include_relate", True):
            allowed.add("relate")
        if settings.get("include_featpaper", True):
            allowed.add("featpaper")
        events = [e for e in events if e["src"] in allowed]

    last_ts = float(state.get(channel_id) or 0)
    fresh = [e for e in events if _ts_float(e["ts"]) > last_ts]
    fresh.sort(key=lambda e: _ts_float(e["ts"]))

    counts = {"collected": len(messages), "parsed": len(events),
              "new_leads": 0, "new_activities": 0, "queued": 0}
    max_ts = last_ts
    collected_now = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    require_review = bool(settings.get("require_review_for_new_company"))
    _log(logs, f"[sync] #{channel_id} ({strategy}) 수집 {len(messages)} · 파싱 {len(events)} · 신규 {len(fresh)}")
    for e in fresh:
        _cos = ", ".join(e.get("companies", []) or [e.get("co", "")])
        _who = ", ".join(c.get("email", "") for c in e.get("contacts", [])) or e.get("em", "")
        _log(
            logs,
            f"  [{e.get('dt','')[:16]}] {e.get('kind', e.get('src',''))} | 회사: {_cos or '(미분류)'}"
            f" | 담당: {_who or '-'} | 솔루션: {e.get('it','') or '-'}",
        )
    # Resumable: commit progress every N events so an interrupted backfill can
    # continue without re-applying (channel_state advances past applied ts).
    COMMIT_EVERY = 20
    for i, e in enumerate(fresh, 1):
        max_ts = max(max_ts, _ts_float(e["ts"]))
        info = info_by_ts.get(str(e["ts"]), {})
        e["permalink"] = info.get("permalink", "")
        e["comments"] = info.get("comments", [])
        e["channel_id"] = channel_id
        e["collected_at"] = collected_now
        if strategy == "cross_team":
            _apply_cross_event(conn, e, require_review, counts)
        else:
            _apply_inbound_event(conn, e, require_review, counts)
        _mark_applied(conn, channel_id, e["ts"], e.get("kind") or e.get("src") or "activity")
        if i % COMMIT_EVERY == 0:
            state[channel_id] = max_ts
            queries.save_sync_settings(conn, {"channel_state": state})
            conn.commit()
            _log(logs, f"  … 진행 저장 {i}/{len(fresh)} (재개 지점 ts={max_ts:.0f})")

    state[channel_id] = max_ts
    queries.save_sync_settings(conn, {"channel_state": state})
    conn.commit()
    return counts


def _apply_inbound_event(conn, e: dict, require_review: bool, counts: dict) -> None:
    company = e.get("co", "")
    # 이메일이 없으면 담당자 생성 불가 → 회사 단위 활동으로 보존(회사도 없으면 미분류)
    if not (e.get("em") and "@" in e["em"]):
        co = company or UNCLASSIFIED
        if not _company_exists(conn, co):
            queries._upsert_company(conn, co)
        queries.log_activity(conn, {
            "company_key": queries._norm_company_key(co),
            "activity_type": e.get("src", "featpaper"), "solution_name": e.get("it", ""),
            "note": e.get("iq", ""), "occurred_at": e["dt"],
            "source_type": e.get("src", "featpaper"), "collected_at": e.get("collected_at", ""),
        })
        counts["new_activities"] += 1
        return
    known = _company_exists(conn, company) if company else True
    if require_review and company and not known:
        _apply_without_company_then_review(conn, e, e.get("src", "inbound"))
        counts["queued"] += 1
        counts["new_leads"] += 1
        return
    res = queries.apply_contact_event(
        conn,
        email=e["em"], name=e.get("nm", ""), company=company,
        department=e.get("dept", ""), title=e.get("title", ""),
        phone=e.get("ph", ""), interest=e.get("it", ""),
        inquiry=(f"[{e['dt'][:10]}] {e['iq']}" if e.get("iq") else ""),
        occurred_at=e["dt"], source_code=e["src"],
        collected_at=e.get("collected_at", ""), raw_payload=e,
    )
    counts["new_leads" if res["created"] else "new_activities"] += 1


def _apply_cross_event(conn, e: dict, require_review: bool, counts: dict) -> None:
    """Fan out one cross-team message to ALL involved companies and contacts."""
    kind = e.get("kind", "activity")
    companies = e.get("companies") or ([e["primary_co"]] if e.get("primary_co") else [])
    contacts = [c for c in e.get("contacts", []) if c.get("email")]
    review_required = bool(e.get("review_required"))
    atype = e.get("atype", "") or ("신규 리드" if kind == "lead" else "고객 활동")
    note = e.get("source_text") or e.get("iq") or ""  # 원문 그대로

    if kind == "company_update":
        for co in companies or [""]:
            if co:
                _company_update_review(conn, e, co)
                counts["queued"] += 1
        return

    # 회사 미상 활동도 원문 보존 우선 → '(미분류)'로 저장해 사용자가 보고 수정
    if not companies and not contacts:
        queries._upsert_company(conn, UNCLASSIFIED)
        queries.log_activity(conn, {
            "company_key": queries._norm_company_key(UNCLASSIFIED),
            "activity_type": atype, "solution_name": e.get("it", ""),
            "note": note, "next_action": e.get("next", ""),
            "occurred_at": e["dt"], "permalink": e.get("permalink", ""),
            "source_type": "cross_team", "collected_at": e.get("collected_at", ""),
        })
        counts["new_activities"] += 1
        return

    primary = companies[0] if companies else ""

    # 1) every contact → recorded (attached to the primary company)
    for c in contacts:
        if review_required or (require_review and primary and not _company_exists(conn, primary)):
            _apply_contact_review(conn, e, c, primary)
            counts["queued"] += 1
            counts["new_leads" if kind == "lead" else "new_activities"] += 1
        else:
            res = queries.apply_contact_event(
                conn,
                email=c["email"], name=c.get("name", ""), company=primary,
                department=c.get("department", ""), title=c.get("title", ""),
                phone=c.get("phone", ""), interest=e.get("it", ""),
                inquiry=note, occurred_at=e["dt"], source_code="cross_team",
                activity_type=atype, next_action=e.get("next", ""),
                collected_at=e.get("collected_at", ""), raw_payload=e,
            )
            counts["new_leads" if res["created"] else "new_activities"] += 1

    # 2) every involved company → a company-level touch so all can see it.
    #    (primary is already covered by the contact activities above.)
    extra_companies = companies if not contacts else companies[1:]
    for co in extra_companies:
        if not _company_exists(conn, co):
            if require_review or review_required:
                _standalone_new_company_review(conn, e, co)
                counts["queued"] += 1
                continue
            queries._upsert_company(conn, co)
        queries.log_activity(conn, {
            "company_key": queries._norm_company_key(co),
            "activity_type": atype, "solution_name": e.get("it", ""),
            "note": note, "next_action": e.get("next", ""),
            "occurred_at": e["dt"], "permalink": e.get("permalink", ""),
            "source_type": "cross_team", "collected_at": e.get("collected_at", ""),
        })
        counts["new_activities"] += 1


def _company_update_review(conn, e: dict, company: str) -> None:
    """[회사 정보 업데이트] → 회사 필드 정합성 확인 요청으로 적재."""
    key = queries._norm_company_key(company)
    row = conn.execute(
        "SELECT id, industry, sub_industry, description FROM companies WHERE canonical_key = ?",
        (key,),
    ).fetchone()
    entity_id = row["id"] if row else None
    fields = {
        "industry": e.get("industry", ""),
        "sub_industry": e.get("sub_industry", ""),
        "description": e.get("description", ""),
    }
    for field, proposed in fields.items():
        if not proposed:
            continue
        current = (row[field] if row else "") or ""
        conn.execute(
            """
            INSERT INTO consistency_reviews
              (review_type, entity_type, entity_id, field_name, current_value,
               proposed_value, evidence, source_table, confidence)
            VALUES ('company_update', 'company', ?, ?, ?, ?, ?, 'slack_sync', 0.5)
            """,
            (entity_id, field, current, proposed,
             f"Slack cross_team 회사 정보 업데이트 — {company}"),
        )


def _apply_contact_review(conn, e: dict, c: dict, company: str) -> None:
    """Create the contact without a company link and queue a company review."""
    res = queries.apply_contact_event(
        conn,
        email=c["email"], name=c.get("name", ""), company="",
        department=c.get("department", ""), title=c.get("title", ""),
        phone=c.get("phone", ""), interest=e.get("it", ""),
        inquiry=(f"[{e['dt'][:10]}] {e['iq']}" if e.get("iq") else ""),
        occurred_at=e["dt"], source_code="manual",
        activity_type=e.get("atype", ""), next_action=e.get("next", ""), raw_payload=e,
    )
    conn.execute(
        """
        INSERT INTO consistency_reviews
          (review_type, entity_type, entity_id, field_name, current_value,
           proposed_value, evidence, source_table, confidence)
        VALUES ('new_company', 'contact', ?, 'company_id', '', ?, ?, 'slack_sync', 0.5)
        """,
        (res["contact_id"], company, f"Slack cross_team 리드의 회사 연결 확인 필요 — {company}"),
    )


def _standalone_new_company_review(conn, e: dict, company: str) -> None:
    """Queue a new-company review for a company with no contact to attach to.

    Deduplicated: if a pending new-company review already exists for this
    company name, don't add another (avoids flooding on repeated mentions).
    """
    dup = conn.execute(
        """
        SELECT 1 FROM consistency_reviews
        WHERE status='pending' AND review_type='new_company'
          AND entity_type='company' AND proposed_value=?
        """,
        (company,),
    ).fetchone()
    if dup:
        return
    conn.execute(
        """
        INSERT INTO consistency_reviews
          (review_type, entity_type, entity_id, field_name, current_value,
           proposed_value, evidence, source_table, confidence)
        VALUES ('new_company', 'company', NULL, 'name', '', ?, ?, 'slack_sync', 0.5)
        """,
        (company, f"Slack cross_team 활동의 새 회사 확인 필요 — {company}"),
    )


# inbound path keeps a single contact/company per event
def _apply_without_company_then_review(conn, e: dict, src: str) -> None:
    res = queries.apply_contact_event(
        conn,
        email=e["em"], name=e.get("nm", ""), company="",
        department=e.get("dept", ""), title=e.get("title", ""),
        phone=e.get("ph", ""), interest=e.get("it", ""),
        inquiry=(f"[{e['dt'][:10]}] {e['iq']}" if e.get("iq") else ""),
        occurred_at=e["dt"], source_code=src if src in ("relate", "featpaper") else "manual",
        activity_type=e.get("atype", ""), next_action=e.get("next", ""), raw_payload=e,
    )
    conn.execute(
        """
        INSERT INTO consistency_reviews
          (review_type, entity_type, entity_id, field_name, current_value,
           proposed_value, evidence, source_table, confidence)
        VALUES ('new_company', 'contact', ?, 'company_id', '', ?, ?, 'slack_sync', 0.5)
        """,
        (res["contact_id"], e.get("co", ""), f"Slack {src} 리드의 새 회사 확인 필요"),
    )


def _company_exists(conn, name: str) -> bool:
    key = queries._norm_company_key(name)
    return (
        conn.execute(
            "SELECT 1 FROM companies WHERE canonical_key = ?", (key,)
        ).fetchone()
        is not None
    )


def _ts_float(ts: str | float) -> float:
    try:
        return float(ts)
    except (ValueError, TypeError):
        return 0.0


def _not_ok(message: str) -> dict:
    print(f"[sync] 중단 — {message}", flush=True)
    return {
        "ok": False,
        "configured": False,
        "message": message,
        "new_leads": 0,
        "new_activities": 0,
        "queued_reviews": 0,
        "parsed": 0,
        "collected": 0,
        "log": [f"[sync] 중단 — {message}"],
    }
