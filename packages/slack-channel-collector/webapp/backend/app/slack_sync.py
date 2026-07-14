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
import sqlite3
import ssl
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from . import glm, queries, vision, secret_store
from .config import PACKAGE_ROOT, get_settings
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


_RELATE_KEYS = [
    "이름", "업무용 이메일", "휴대폰 번호", "회사명", "부서명", "직책", "관심 솔루션", "문의내용",
]


def _clean_field_value(value: str) -> str:
    value = (value or "").strip()
    if value.startswith("*") and value.endswith("*") and len(value) >= 2:
        value = value[1:-1].strip()
    return value.replace("\r", "").strip()


def _field_value(text: str, key: str, multiline: bool = False) -> str:
    """Extract Slack form fields in both old bold and current plain formats.

    Supports:
      업무용 이메일: *a@b.com*
      업무용 이메일: a@b.com
      문의내용: *first line
      second line*
    """
    # Old Relate formatting: `키: *값*`.
    old = _g(rf"{re.escape(key)}\s*[:：]\s*\*([\s\S]*?)\*", text)
    if old:
        return _clean_field_value(old)

    if multiline:
        next_keys = [k for k in _RELATE_KEYS if k != key]
        stop = "|".join(re.escape(k) for k in next_keys)
        m = re.search(
            rf"{re.escape(key)}\s*[:：]\s*([\s\S]*?)(?=\n(?:{stop})\s*[:：]|\Z)",
            text or "",
        )
        return _clean_field_value(m.group(1)) if m else ""

    m = re.search(rf"^{re.escape(key)}\s*[:：]\s*(.+?)\s*$", text or "", re.MULTILINE)
    return _clean_field_value(m.group(1)) if m else ""


def _ts_to_kst(ts: str | float) -> str:
    try:
        dt = datetime.fromtimestamp(float(ts), tz=KST)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError, OSError):
        return ""


def parse_inbound(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """#sales-inbound 전략: 릴레잇/피트페이퍼 훅 봇 메시지 → 신규 리드 이벤트."""
    return parse_messages(messages)


def parse_business_cards(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """#sales-명함 전략: image files → GLM-V OCR candidate events."""
    events: list[dict[str, Any]] = []
    for msg in messages:
        files = [f for f in msg.get("files", []) or [] if _is_image_file(f)]
        if not files:
            continue
        ts = msg.get("ts", "") or ""
        text = msg.get("text", "") or ""
        events.append({
            "ts": ts,
            "dt": _ts_to_kst(ts),
            "kind": "business_card",
            "src": "business_card",
            "files": files,
            "source_text": text,
        })
    return events


def _is_image_file(file_item: dict[str, Any]) -> bool:
    mime = (file_item.get("mimetype") or "").lower()
    ftype = (file_item.get("filetype") or "").lower()
    name = (file_item.get("name") or file_item.get("title") or "").lower()
    if mime.startswith("image/"):
        return True
    return ftype in {"jpg", "jpeg", "png", "webp"} or name.endswith((".jpg", ".jpeg", ".png", ".webp"))


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
            raw = _field_value(text, "업무용 이메일")
            em = _mail_of(raw) or raw
            if "@" not in em:
                continue
            out.append({
                "ts": ts, "dt": dt, "src": "relate", "em": em.lower(),
                "nm": _field_value(text, "이름"),
                "ph": _field_value(text, "휴대폰 번호"),
                "co": _field_value(text, "회사명"),
                "dept": _field_value(text, "부서명"),
                "title": _field_value(text, "직책"),
                "it": _field_value(text, "관심 솔루션"),
                "iq": _field_value(text, "문의내용", multiline=True)[:300],
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
            # 상세 필드(있으면): 회사/이름/이메일 — 구분자(·|(줄바꿈)에서 끊음
            co = _g(r"(?:Company|회사명?)\s*[:：]\s*([^·|\n(]+)", text)
            nm = _g(r"(?:Name|성함|이름)\s*[:：]\s*([^·|\n(]+)", text)
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
    "발생일시", "유입경로", "회사명", "고객명", "관련사", "참석자", "업종", "세부분야",
    "회사설명", "이름", "부서", "직급", "이메일", "휴대폰", "관심 솔루션", "활동유형",
    "방문 일자", "방문일자", "방문 목적", "방문목적", "문의내용", "활동내용",
    "결과", "다음 액션", "Next Plan", "확인상태", "근거",
]

def _companies_from_participants(value: str, known: list[str] | None = None) -> list[str]:
    """참석자 줄에서 회사명 추출 (사람이름 오검출 방지).
    예) '신흥_이해진이사 / FLS 이종국대표 / RTM_허정' → ['신흥', 'FLS'].
    각 '/' 세그먼트에서 회사로 인정하는 경우만:
      (a) '회사_사람'의 '_' 앞 토큰, (b) 대문자 ASCII(FLS/WGS), (c) 등록된 회사명."""
    known = known or []
    out: list[str] = []
    for seg in re.split(r"[/\n]", value or ""):
        seg = re.sub(r"^\s*[■•*·\-]+\s*", "", seg or "")
        seg = seg.replace("*", "").strip()
        if not seg:
            continue
        colon = re.match(r"^([가-힣A-Za-z0-9&().\-\s]{2,30})\s*[:：]\s*(.+)$", seg)
        if colon:
            token = _clean_company(colon.group(1))
        elif "_" in seg:  # 회사_사람 → 확실
            token = _clean_company(seg.split("_", 1)[0])
        else:
            first = seg.split()[0] if seg.split() else ""
            tok = _clean_company(first)
            if tok and tok.isascii() and len(tok) >= 2:
                token = tok  # FLS, WGS 등 대문자 약칭
            else:
                token = next((k for k in known if k and k in seg), "")  # 등록 회사명만
        if not token or token in _CO_STOPWORDS or re.search(r"rtm|알티엠", token, re.I):
            continue
        out.append(token)
    return out


def _participant_block(text: str) -> str:
    """Extract multiline participant bullets following `참석자:`."""
    lines = (text or "").splitlines()
    out: list[str] = []
    collecting = False
    for raw in lines:
        line = raw.strip()
        plain = line.replace("*", "").strip()
        if not collecting and re.match(r"^[■•*·\-\s]*참석자\s*[:：]\s*$", plain):
            collecting = True
            continue
        if not collecting:
            continue
        if not line:
            if out:
                break
            continue
        label = re.sub(r"^[■•*·\-\s]*", "", plain).split(":", 1)[0].split("：", 1)[0].strip()
        # Keep actual participant company labels (`Nexber: ...`) but stop when
        # the next structured field/section begins.
        if label in _FIELD_KEYS:
            break
        if re.match(r"^[■•*·\-\s]*(?:\d+[.)]|[A-Za-z ]+\s*[:：]|목적\s*[:：]|일시\s*[:：])", plain):
            if label in _FIELD_KEYS:
                break
        if re.match(r"^\*?\d+\.\s+", line) or re.match(r"^[■•*·\-\s]*\[", plain):
            break
        out.append(line)
    return "\n".join(out)
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


def _known_company_in_text(text: str, known: list[str]) -> str:
    """본문에 이미 등록된 회사명이 있으면 반환(가장 긴 이름 우선). ASCII는 단어경계."""
    for name in known:
        if name.isascii():
            if re.search(r"(?<![A-Za-z0-9])" + re.escape(name) + r"(?![A-Za-z0-9])", text, re.I):
                return name
        elif name in text:
            return name
    return ""


def parse_cross_team(
    messages: list[dict[str, Any]], known: list[str] | None = None
) -> list[dict[str, Any]]:
    """#tf_cross_team_sales 전략: 사람이 작성한 미팅/활동 템플릿 → 이벤트.

    known: 이미 등록된 회사명 목록(긴 것 우선). 필드/제목에서 회사를 못 찾으면
    본문에 등장하는 기존 회사명으로 매칭해 미분류를 줄인다.
    event kinds: lead / activity / company_update.
    """
    known = known or []
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
        if not company and known:
            company = _known_company_in_text(combined, known)  # 기존 회사명 매칭

        companies = _split_companies(company) + _split_companies(f.get("관련사", ""))
        companies = _normalize_company_list(companies, known)

        # 참석자 줄/블록의 다른 회사(예: FLS, Nexber)도 모두 대상에 추가.
        # 단, 기존 회사에 포함되는(부분문자열) 후보는 중복이므로 제외 (신흥 ⊂ 신흥안산공장).
        participant_text = "\n".join(
            x for x in [f.get("참석자", ""), _participant_block(combined)] if x
        )
        for pc in _companies_from_participants(participant_text, known):
            if any(pc in c or c in pc for c in companies):
                continue
            companies.append(pc)
        companies = _normalize_company_list(companies, known)

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
    # 콜론/별표/구분자 제거, 전체가 괄호로 감싸졌으면 벗김(균형 괄호는 유지)
    n = n.replace("*", "").strip().strip(" .,-·:：")
    if n.startswith("(") and n.endswith(")"):
        n = n[1:-1].strip()
    if n.startswith("[") and n.endswith("]"):
        n = n[1:-1].strip()
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
    "고객측", "자사", "당사", "내부", "우리회사", "우리 회사", "연구소", "부서", "담당자",
}
_OUR_COMPANY_RE = re.compile(r"rtm|알티엠|앝티엠|알티엠\(rtm\)", re.I)
_ORG_UNIT_RE = re.compile(
    r"(?:팀|품질보증팀|연구소|사업부|본부|센터|그룹|파트|랩|Lab|부서)\s*$",
    re.I,
)
_PHRASE_NOISE_RE = re.compile(
    r"도출|협의|확보|조성|합의|확인|요청|검토|진행|필요|사항|대상|데이터|"
    r"제어|환경|예산|일정|현장|설치|라인|테스트|프로세스|향후|세부|논의|결정"
)
_LOW_QUALITY_COMPANY_NAMES = {
    "기타", "개인", "없음", "무", "미정", "모름", "테스트", "test", "asdf",
    "aaa", "ggg", "ss", "ㅇ", "ㅁ", "ㅁㅁ", "000", "123",
}


def _is_company_noise(name: str, known: list[str] | None = None) -> bool:
    """Reject internal labels, departments, roles, and sentence fragments.

    This keeps the parser generic: real customer names are not hardcoded, but
    non-company labels commonly produced by meeting notes cannot become
    companies.
    """
    n = _clean_company(name).strip()
    if not n:
        return True
    known = known or []
    if any(n == k for k in known):
        return False
    folded = re.sub(r"\s+", "", n).lower()
    if folded in {re.sub(r"\s+", "", w).lower() for w in _CO_STOPWORDS}:
        return True
    if _OUR_COMPANY_RE.search(n):
        return True
    if _ORG_UNIT_RE.search(n):
        return True
    if _PHRASE_NOISE_RE.search(n):
        return True
    if n.count(" ") >= 3:
        return True
    if re.fullmatch(r"[가-힣]{1,3}(?:측|팀|부|소)", n):
        return True
    return _is_low_quality_company_name(n)


def _normalize_company_list(values: list[str], known: list[str] | None = None) -> list[str]:
    out: list[str] = []
    for value in values:
        company = _clean_company(value)
        if _is_company_noise(company, known):
            continue
        if any(company in c or c in company for c in out):
            continue
        out.append(company)
    return out


def _is_low_quality_company_name(name: str) -> bool:
    """Detect placeholder/test values from inbound forms.

    Keep legitimate uppercase abbreviations such as ATG/FLS/WGS/LG, but avoid
    creating companies from obvious test strings, numbers, or consonant-only
    Korean placeholders.
    """
    n = _clean_company(name).strip()
    if not n:
        return False
    folded = n.lower().replace(" ", "")
    if folded in _LOW_QUALITY_COMPANY_NAMES:
        return True
    if folded.isdigit():
        return True
    if re.fullmatch(r"[ㄱ-ㅎㅏ-ㅣ]+", n):
        return True
    if len(folded) <= 2 and not (n.isascii() and n.isupper()):
        return True
    if len(set(folded)) == 1 and len(folded) >= 2:
        return True
    return False


def _company_from_freeform(text: str) -> str:
    """회사명 필드가 없을 때 제목/본문에서 회사명을 best-effort 추출.

    예) '*2026.01.22 아사히카세히 미팅 결과*' → '아사히카세히'
        '아사히 카세히 미팅 내역 공유드립니다' → '아사히 카세히'
    """
    head = "\n".join((text or "").splitlines()[:2])
    head = re.sub(r"<@[UWB][A-Z0-9]+>", "", head)
    head = re.sub(r"[:*_]|:[a-z_]+:", "", head)
    # 고정밀만: 날짜+회사+미팅/방문, '회사 미팅 결과', 대괄호 제목.
    # (사람이름/조각 오검출을 막기 위해 '○○ 방문/보고' 같은 느슨한 패턴은 쓰지 않음.
    #  등록된 회사명 매칭은 별도 _known_company_in_text가 담당.)
    patterns = [
        r"\d{2,4}[.\-]\d{1,2}[.\-]\d{1,2}\s*([가-힣A-Za-z()]{2,14}(?:\s[가-힣A-Za-z()]{1,12})?)\s*(?:미팅|방문)",
        r"^\s*([가-힣A-Za-z()]{2,14}(?:\s[가-힣A-Za-z()]{1,12})?)\s*(?:미팅|방문)\s*(?:내역|결과|내용|공유)",
        r"^\s*\[\s*([가-힣A-Za-z()]{2,14}?)[\s\-\]]",
        r"^\s*([가-힣A-Za-z()]{2,14})\s*(?:확장\s*과제|과제\s*확장|업무\s*협의|업무협의)",
        r"(?:^|\s)([A-Z]{2,6})\s*(?:미팅|방문)\s*(?:참석자|내역|결과|내용)?",
    ]
    bad_frag = ("통화", "대응", "신청", "논의", "확인", "문의", "과제", "건", "안내",
                "요청", "관련", "종료", "예정", "님", "이사", "팀장", "차장", "대표",
                "부장", "과장", "책임", "매니저", "실무자")
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
    logs: list[str] | None = None,
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
    if limit and strategy != "business_card":
        overrides["limit"] = int(limit)
        # count 기준으로 최신 N개를 가져오도록 시간 창을 넓힌다
        lookback = max(lookback, FULL_LOOKBACK_HOURS)
    overrides["lookback_hours"] = lookback

    config = collector.CollectionConfig.from_env(require_token=False)
    config = config.__class__(**{**config.__dict__, "token": _slack_token()})
    config = config.__class__(**{**config.__dict__, **overrides})
    on_progress = (lambda m: _log(logs, f"    · {m}")) if logs is not None else None
    result = collector.collect_once(config, dry_run=True, on_progress=on_progress)  # dry_run keeps payload in memory
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
    """Slack users.list + users.profile.get으로 ID→실제 프로필을 저장.

    토큰이 없으면 아무것도 안 하고 현재 저장된 수만 반환.
    """
    has_token = bool(_slack_token())
    if not has_token:
        n = conn.execute("SELECT COUNT(*) FROM slack_users").fetchone()[0]
        return {"ok": False, "configured": False, "stored": n,
                "message": "SLACK 토큰이 없어 유저 이름을 가져올 수 없습니다."}
    try:
        _ensure_collector_importable()
        from rtm_slack_channel_collector import collector  # type: ignore

        config = collector.CollectionConfig.from_env(require_token=False)
        config = config.__class__(**{**config.__dict__, "token": _slack_token()})
        client = collector.SlackClient(config.token, config.api_min_interval_seconds)
        cursor, added, profiled, profile_errors = "", 0, 0, 0
        while True:
            payload = client.request("users.list", {"limit": 200, "cursor": cursor})
            for u in payload.get("members", []):
                uid = u.get("id")
                if not uid:
                    continue
                prof = dict(u.get("profile", {}) or {})
                try:
                    detail = client.request("users.profile.get", {"user": uid, "include_labels": "true"}, max_retries=3)
                    if isinstance(detail.get("profile"), dict):
                        prof.update(detail["profile"])
                        profiled += 1
                except Exception:
                    profile_errors += 1
                name = prof.get("display_name") or prof.get("real_name") or u.get("real_name") or u.get("name") or ""
                conn.execute(
                    """
                    INSERT INTO slack_users(
                      user_id, name, real_name, display_name, title, email, phone,
                      status_text, status_emoji, image_72, profile_json
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(user_id) DO UPDATE SET
                      name=excluded.name,
                      real_name=excluded.real_name,
                      display_name=excluded.display_name,
                      title=excluded.title,
                      email=excluded.email,
                      phone=excluded.phone,
                      status_text=excluded.status_text,
                      status_emoji=excluded.status_emoji,
                      image_72=excluded.image_72,
                      profile_json=excluded.profile_json,
                      updated_at=CURRENT_TIMESTAMP
                    """,
                    (
                        uid,
                        name,
                        u.get("real_name", "") or prof.get("real_name", ""),
                        prof.get("display_name", "") or "",
                        prof.get("title", "") or "",
                        prof.get("email", "") or "",
                        prof.get("phone", "") or "",
                        prof.get("status_text", "") or "",
                        prof.get("status_emoji", "") or "",
                        prof.get("image_72", "") or "",
                        json.dumps(prof, ensure_ascii=False),
                    ),
                )
                added += 1
            cursor = payload.get("response_metadata", {}).get("next_cursor", "")
            if not cursor:
                break
        return {
            "ok": True,
            "configured": True,
            "stored": added,
            "profiled": profiled,
            "profile_errors": profile_errors,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "configured": True, "stored": 0, "message": str(exc)}


def _slack_users_refresh_due(conn, hours: int = 24) -> bool:
    """전체 Slack 프로필 갱신은 비싸므로 하루 한 번만 실행한다."""
    row = conn.execute("SELECT MAX(updated_at) FROM slack_users").fetchone()
    if not row or not row[0]:
        return True
    try:
        last = datetime.strptime(str(row[0])[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
        return datetime.now(KST) - last >= timedelta(hours=max(1, hours))
    except ValueError:
        return True


def _log(logs: list[str], msg: str) -> None:
    """서버 콘솔 출력 + 응답에 담아 브라우저 콘솔에서도 볼 수 있게 수집."""
    print(msg, flush=True)
    logs.append(msg)


def _is_uninformative_notice(text: str) -> bool:
    """'EHM Brochure has been viewed'처럼 회사/사람/이메일 없는 열람 알림 → 반영 불가."""
    t = text or ""
    viewed = bool(re.search(r"has been viewed|열람", t, re.I))
    if not viewed:
        return False
    has_email = "@" in t or "mailto:" in t
    has_company = bool(re.search(r"(회사명|고객명|Company)\s*[:：]", t, re.I))
    # 짧고 식별정보 없으면 반영 불가로 간주
    return not has_email and not has_company and len(t.strip()) < 200


def _mark_applied(conn, channel_id: str, ts: str, kind: str) -> None:
    conn.execute(
        "UPDATE slack_raw_messages SET applied=1, applied_kind=? "
        "WHERE channel_id=? AND message_ts=?",
        (kind, channel_id, str(ts)),
    )


# ── entrypoint ───────────────────────────────────────────────────────────────
def _sync_targets(channels: list[dict], only_channel: str | None = None) -> list[dict]:
    """전체/예약 실행 대상. 명함 전용 채널은 비활성 표시여도 반드시 포함."""
    targets = [
        {
            **c,
            "enabled": True,
            "strategy": "business_card"
            if queries.is_business_card_channel(c.get("id", ""))
            else c.get("strategy", "inbound"),
        }
        for c in channels
        if c.get("id") and (
            c.get("enabled", True) or queries.is_business_card_channel(c.get("id", ""))
        )
    ]
    if only_channel:
        targets = [c for c in targets if c["id"] == only_channel]
    return targets


def run_sync(
    export_file: str | None = None,
    limit: int | None = None,
    only_channel: str | None = None,
    backfill: bool = False,
    logs: list[str] | None = None,
) -> dict:
    export_file = export_file or os.environ.get("RTM_SLACK_EXPORT_FILE", "").strip()
    has_token = bool(_slack_token())
    if logs is None:
        logs = []

    # ── Phase 0: 설정·상태를 짧게 읽고 커넥션을 즉시 닫는다 ──────────────────────
    with get_conn() as conn:
        settings = queries.get_sync_settings(conn)
        card_only = bool(only_channel and queries.is_business_card_channel(only_channel))
        users_refresh_due = (
            has_token and not export_file and not card_only and _slack_users_refresh_due(conn)
        )
    if limit is None:
        limit = int(settings.get("sync_limit") or 0) or None
    channels = settings.get("channels", [])
    state = dict(settings.get("channel_state") or {})
    totals = {"collected": 0, "parsed": 0, "new_leads": 0, "new_activities": 0, "queued": 0}
    per_channel = []
    _log(logs, f"[sync] 시작 — backfill={backfill} limit={limit}")

    # ── Phase 1: Slack에서 메모리(JSON)로만 수집한다. DB 커넥션을 열지 않는다 ────
    # (수집은 수 분 걸리는 네트워크 작업 — 이 동안 DB를 붙잡으면 WAL 경합/디스크 I/O
    #  오류로 서버 전체가 불안정해진다. 그래서 "수집 → JSON 완료 → 단일 DB 세션" 순서.)
    collected: list[tuple[str, str, list, str, bool]] = []  # (ch_id, strategy, msgs, label, full)
    source = "collector"
    try:
        if export_file:
            p = Path(export_file).expanduser()
            if not p.exists():
                return _not_ok(f"export 파일을 찾을 수 없습니다: {p}")
            messages, ch_id, source = _load_from_export(p)
            _log(logs, f"[sync] export 로드: {source} ({len(messages)}개 메시지)")
            strat = next(
                (c.get("strategy", "inbound") for c in channels if c.get("id") == ch_id),
                "inbound",
            )
            collected.append((ch_id or "export", strat, messages, ch_id or source, False))
        elif has_token:
            targets = _sync_targets(channels, only_channel)
            if not targets:
                return _not_ok("활성화된 수집 채널이 없습니다. 동기화 설정을 확인하세요.")
            for ch in targets:
                is_initial = str(ch["id"]) not in state  # 처음 보는 채널은 전체 백필
                full = backfill or is_initial
                _log(logs, f"[sync] #{ch.get('name') or ch['id']} 수집 시작 "
                           f"(전략={ch.get('strategy')}, {'전체 백필' if full else '증분'})")
                _log(logs, f"[sync] Slack API 호출 중… {'전체 히스토리는 수 분 걸릴 수 있음' if full else '증분 조회'}")
                msgs, ch_id, _ = _load_from_collector(
                    settings, limit=limit, channel_id=ch["id"], full=full, logs=logs
                )
                _log(logs, f"[sync] #{ch['id']} Slack에서 {len(msgs)}개 메시지 수집")
                collected.append((ch["id"], ch.get("strategy", "inbound"), msgs, ch.get("name") or ch["id"], full))
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

    total_msgs = sum(len(m) for _, _, m, _, _ in collected)
    _log(logs, f"[sync] 수집 완료 — 총 {total_msgs}개 메시지 → 단일 DB 세션으로 반영 시작")

    # ── Phase 2: 단일 DB 세션에서 일괄 반영하고 커넥션을 닫는다 ──────────────────
    with get_conn() as conn:
        conn.execute("UPDATE change_batch SET logging=0 WHERE id=1")  # 대량: 감사 제외
        conn.commit()
        if users_refresh_due:
            ru = resolve_users(conn)
            if ru.get("ok"):
                _log(logs, f"[sync] 유저 이름 매핑 {ru['stored']}명 갱신")
            conn.commit()
        for cid, strategy, msgs, label, full in collected:
            settings["_backfill"] = full
            r = _process_channel(conn, cid, strategy, msgs, settings, state, limit, logs)
            _merge_totals(totals, r)
            per_channel.append({"channel": label, "strategy": strategy, **r})
            conn.commit()  # 채널별 반영 후 즉시 커밋 → 잠금 보유 최소화
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


def _slack_token() -> str:
    try:
        conn = sqlite3.connect(get_settings().db_path)
        row = conn.execute(
            "SELECT value FROM app_runtime_settings WHERE key='slack.bot_token'"
        ).fetchone()
        conn.close()
        if row is not None:
            return secret_store.decrypt(str(row[0])).strip()
    except (sqlite3.Error, OSError):
        pass
    return (
        os.environ.get("SLACK_BOT_TOKEN")
        or os.environ.get("SLACK_USER_TOKEN")
        or os.environ.get("SLACK_TOKEN")
        or ""
    ).strip()


def test_connection() -> dict[str, str]:
    token = _slack_token()
    if not token:
        raise RuntimeError("Slack Bot Token을 먼저 저장해 주세요")
    req = Request("https://slack.com/api/auth.test", headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
            with urlopen(req, timeout=20, context=ssl._create_unverified_context()) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        else:
            raise RuntimeError(f"Slack 연결 실패: {reason}") from exc
    if not payload.get("ok"):
        raise RuntimeError(str(payload.get("error") or "Slack 인증 실패"))
    return {
        "team": str(payload.get("team") or ""),
        "team_id": str(payload.get("team_id") or ""),
        "user": str(payload.get("user") or ""),
        "user_id": str(payload.get("user_id") or ""),
        "url": str(payload.get("url") or ""),
    }


def _download_slack_file(file_item: dict[str, Any]) -> tuple[bytes, str]:
    url = (file_item.get("url_private") or "").strip()
    if not url:
        raise RuntimeError("Slack 파일 url_private 없음")
    token = _slack_token()
    if not token:
        raise RuntimeError("Slack 토큰 없음")
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(req, timeout=45) as resp:
            return resp.read(), resp.headers.get_content_type()
    except URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
            with urlopen(req, timeout=45, context=ssl._create_unverified_context()) as resp:
                return resp.read(), resp.headers.get_content_type()
        raise


def _post_slack_thread_reply(channel_id: str, thread_ts: str, text: str) -> dict:
    token = _slack_token()
    if not token:
        raise RuntimeError("Slack 토큰 없음")
    body = json.dumps(
        {
            "channel": channel_id,
            "thread_ts": str(thread_ts),
            "text": text,
            "unfurl_links": False,
            "unfurl_media": False,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = Request(
        "https://slack.com/api/chat.postMessage",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    try:
        with urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
            with urlopen(req, timeout=30, context=ssl._create_unverified_context()) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        else:
            raise RuntimeError(f"Slack 콜백 연결 실패: {reason}") from exc
    if not payload.get("ok"):
        raise RuntimeError(f"Slack 콜백 실패: {payload.get('error', 'unknown_error')}")
    return payload


def _post_slack_reaction(channel_id: str, ts: str, reaction: str) -> dict:
    token = _slack_token()
    if not token:
        raise RuntimeError("Slack 토큰 없음")
    names = [(reaction or "database").strip(":")]
    if names[0] == "database":
        names.append("card_file_box")
    last_payload: dict[str, Any] = {}
    for name in dict.fromkeys(names):
        body = json.dumps(
            {
                "channel": channel_id,
                "timestamp": str(ts),
                "name": name,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        req = Request(
            "https://slack.com/api/reactions.add",
            data=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=utf-8",
            },
        )
        try:
            with urlopen(req, timeout=30) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except URLError as exc:
            reason = getattr(exc, "reason", exc)
            if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
                with urlopen(req, timeout=30, context=ssl._create_unverified_context()) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
            else:
                raise RuntimeError(f"Slack reaction 연결 실패: {reason}") from exc
        last_payload = payload
        if payload.get("ok") or payload.get("error") == "already_reacted":
            payload["_reaction_name"] = name
            return payload
        if payload.get("error") != "invalid_name":
            break
    raise RuntimeError(f"Slack reaction 실패: {last_payload.get('error', 'unknown_error')}")


def _callback_text(e: dict, kind: str) -> str:
    return "DB 수집완료했으니 걱정마시게"


def _callback_mode(settings: dict) -> str:
    raw = str(settings.get("slack_callback_mode") or "").strip().lower()
    if raw in {"off", "reaction", "thread"}:
        return raw
    return "reaction" if settings.get("slack_callback_enabled") else "off"


def _post_sync_callback(
    conn,
    channel_id: str,
    e: dict,
    kind: str,
    settings: dict,
    logs: list[str] | None = None,
) -> None:
    is_business_card = kind in {"business_card", "business_card_manual"} or e.get("kind") == "business_card"
    # 명함 수집 완료 표시는 일반 콜백 설정과 무관하게 항상 이모지로 남긴다.
    mode = "reaction" if is_business_card else _callback_mode(settings)
    if mode == "off":
        return
    ts = str(e.get("ts") or "")
    if not channel_id or not ts:
        return
    row = conn.execute(
        "SELECT callback_sent_at FROM slack_raw_messages WHERE channel_id=? AND message_ts=?",
        (channel_id, ts),
    ).fetchone()
    if row and str(row["callback_sent_at"] or ""):
        return
    try:
        if mode == "thread":
            _post_slack_thread_reply(channel_id, ts, _callback_text(e, kind))
            label = "Slack 스레드 콜백"
        else:
            reaction = (
                "white_check_mark"
                if is_business_card
                else str(settings.get("slack_callback_reaction") or "white_check_mark")
            )
            _post_slack_reaction(channel_id, ts, reaction)
            label = f"Slack reaction :{reaction.strip(':')}:"
        sent_at = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "UPDATE slack_raw_messages SET callback_sent_at=? WHERE channel_id=? AND message_ts=?",
            (sent_at, channel_id, ts),
        )
        _log(logs, f"  ↩ {label} 완료: {ts}")
    except Exception as exc:  # noqa: BLE001
        _log(logs, f"  ⚠️ Slack 콜백 실패: {ts} — {exc}")


def _retry_business_card_callbacks(
    conn, channel_id: str, settings: dict, logs: list[str] | None = None, limit: int = 50
) -> int:
    """반영은 끝났지만 Slack 이모지가 실패/누락된 명함을 다음 주기에 재시도."""
    rows = conn.execute(
        """
        SELECT message_ts FROM slack_raw_messages
        WHERE channel_id=? AND applied=1 AND callback_sent_at=''
          AND applied_kind IN ('business_card','business_card_manual')
        ORDER BY CAST(message_ts AS REAL) ASC LIMIT ?
        """,
        (channel_id, max(1, min(limit, 200))),
    ).fetchall()
    for row in rows:
        _post_sync_callback(
            conn, channel_id, {"ts": str(row["message_ts"]), "kind": "business_card"},
            "business_card", settings, logs,
        )
        conn.commit()
    if rows:
        _log(logs, f"[sync] 명함 완료 이모지 누락 {len(rows)}건 재확인")
    return len(rows)


def _ensure_business_card_source(conn) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO sources(code, label, category) VALUES('business_card', 'Slack 명함 OCR', 'channel')"
    )


def _event_uid(channel_id: str, ts: str) -> str:
    """Stable per-message UUID. Slack ts is unique within a channel, so
    channel_id:ts uniquely identifies a message across all syncs/backfills."""
    return f"{channel_id}:{ts}"


def _ensure_parsed_events(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS parsed_events (
            uid         TEXT PRIMARY KEY,
            channel_id  TEXT,
            message_ts  TEXT,
            kind        TEXT,
            applied     INTEGER DEFAULT 0,
            parsed_at   TEXT
        )
        """
    )


def _applied_uids(conn, channel_id: str) -> set[str]:
    """UUIDs of messages already applied for this channel → never re-parse."""
    _ensure_parsed_events(conn)
    return {
        str(r[0])
        for r in conn.execute(
            "SELECT message_ts FROM parsed_events WHERE channel_id=? AND applied=1",
            (channel_id,),
        )
    }


def _record_parsed_event(conn, channel_id: str, ts: str, kind: str, applied: bool) -> None:
    """Idempotently record that a message was parsed. applied=1 messages are
    skipped on future syncs/backfills; applied=0 (failed/unparseable) stay
    retryable so a later run (e.g. after GLM is configured) can pick them up."""
    _ensure_parsed_events(conn)
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """
        INSERT INTO parsed_events(uid, channel_id, message_ts, kind, applied, parsed_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(uid) DO UPDATE SET
            kind=excluded.kind,
            applied=MAX(parsed_events.applied, excluded.applied),
            parsed_at=excluded.parsed_at
        """,
        (_event_uid(channel_id, str(ts)), channel_id, str(ts), kind, 1 if applied else 0, now),
    )


def _process_channel(
    conn, channel_id: str, strategy: str, messages: list[dict],
    settings: dict, state: dict, limit: int | None, logs: list[str] | None = None,
) -> dict:
    logs = logs if logs is not None else []
    if strategy == "business_card" and not queries.is_business_card_channel(channel_id):
        _log(
            logs,
            f"[sync] #{channel_id} 명함 수집 차단 — 전용 채널 "
            f"#{get_settings().business_card_channel_id}만 허용",
        )
        return {
            "collected": 0, "parsed": 0, "new_leads": 0, "new_activities": 0,
            "queued": 0, "skipped_dup": 0,
        }
    if strategy == "business_card":
        # Slack 증분 조회 범위 밖으로 밀린 실패/대기 명함도 DB 원문에서 다시 큐에
        # 합친다. 따라서 장기간 오류나 서버 재시작 뒤에도 다음 예약 실행이 이어받는다.
        known_ts = {str(m.get("ts") or "") for m in messages}
        queued_rows = conn.execute(
            """
            SELECT message_ts, raw_payload
            FROM slack_raw_messages
            WHERE channel_id=? AND applied=0 AND archived=0
            ORDER BY CAST(message_ts AS REAL) ASC
            LIMIT 5000
            """,
            (channel_id,),
        ).fetchall()
        recovered = 0
        for row in queued_rows:
            ts = str(row["message_ts"] or "")
            if not ts or ts in known_ts:
                continue
            try:
                payload = json.loads(row["raw_payload"] or "{}")
            except (ValueError, TypeError):
                continue
            if not any(_is_image_file(f) for f in payload.get("files", []) or [] if isinstance(f, dict)):
                continue
            payload["ts"] = ts
            messages.append(payload)
            known_ts.add(ts)
            recovered += 1
        if recovered:
            _log(logs, f"[sync] 명함 영속 큐에서 {recovered}개 메시지 복구")
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
        # 정보 없는 열람 알림은 반영 불가 → 자동 아카이브 (미반영 목록 정리)
        if _is_uninformative_notice(m.get("text", "")):
            conn.execute(
                "UPDATE slack_raw_messages SET archived=1 WHERE channel_id=? AND message_ts=? AND applied=0",
                (channel_id, str(m.get("ts", ""))),
            )
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
        known = [
            r[0] for r in conn.execute(
                "SELECT display_name FROM companies WHERE LENGTH(display_name)>=3"
            )
            if r[0] and "미분류" not in r[0] and not re.search(r"rtm|알티엠", r[0], re.I)
        ]
        known.sort(key=len, reverse=True)
        events = parse_cross_team(messages, known)
    elif strategy == "business_card":
        events = parse_business_cards(messages)
    else:
        events = parse_inbound(messages)
        allowed = set()
        if settings.get("include_relate", True):
            allowed.add("relate")
        if settings.get("include_featpaper", True):
            allowed.add("featpaper")
        events = [e for e in events if e["src"] in allowed]

    # Per-message UUID dedup: a message already applied (channel_id:ts) is never
    # re-parsed, even during a full-history backfill or after channel_state reset.
    # This is the authoritative dedup; last_ts stays only as a resume optimization.
    applied_uids = _applied_uids(conn, channel_id)
    last_ts = float(state.get(channel_id) or 0)
    candidates = [e for e in events if str(e["ts"]) not in applied_uids]
    skipped_dup = len(events) - len(candidates)
    # Backfill re-scans full history, so don't gate on last_ts there; incremental
    # runs still use the high-water mark to avoid touching old messages.
    if settings.get("_backfill") or strategy == "business_card":
        fresh = candidates
    else:
        fresh = [e for e in candidates if _ts_float(e["ts"]) > last_ts]
    fresh.sort(key=lambda e: _ts_float(e["ts"]))
    if strategy == "business_card":
        # 예산은 메시지가 아니라 이미지 장수 기준이며 이벤트 사이에 공유된다.
        settings["_business_card_budget"] = max(
            1, min(int(settings.get("business_card_batch_size") or 10), 100)
        )
    card_budget_box = {"remaining": int(settings.get("_business_card_budget") or 0)}

    counts = {"collected": len(messages), "parsed": len(events),
              "new_leads": 0, "new_activities": 0, "queued": 0,
              "skipped_dup": skipped_dup}
    max_ts = last_ts
    collected_now = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    require_review = bool(settings.get("require_review_for_new_company"))
    use_glm = (
        strategy == "cross_team"
        and settings.get("glm_parse_cross_team", True)
        and glm.is_configured()
    )
    _log(
        logs,
        f"[sync] #{channel_id} ({strategy}) 수집 {len(messages)} · 파싱 {len(events)}"
        f" · 신규 {len(fresh)} · 중복건너뜀 {skipped_dup}",
    )
    if strategy == "business_card" and len(events) == 0 and len(messages) > 0:
        _log(
            logs,
            "  ⚠️ 명함: 이미지 첨부 메시지를 찾지 못함 — 수집 범위(시간)·파일 권한(files:read)·봇 채널 초대 확인",
        )
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
        event_ts = _ts_float(e["ts"])
        info = info_by_ts.get(str(e["ts"]), {})
        e["permalink"] = info.get("permalink", "")
        e["comments"] = info.get("comments", [])
        e["channel_id"] = channel_id
        e["collected_at"] = collected_now
        if strategy == "business_card":
            e["_budget_box"] = card_budget_box
        if strategy == "cross_team":
            # 결정적 파싱이 회사를 못 찾았거나 작성자가 추정/확인 필요로
            # 표시한 애매한 건만 GLM으로 보강한다. 참석자/관련사가 있다는
            # 이유만으로 전량 GLM 호출하면 대량 백필이 과도하게 느려진다.
            if use_glm and (not e.get("companies") or e.get("review_required")):
                _log(logs, f"    ✨ GLM 파싱 요청 (ts={e['ts']}, 규칙파싱 미검출)")
                _glm_enrich_event(e, logs)
                _log(logs, f"    ✨ GLM 결과: 회사 {', '.join(e.get('companies', []) or []) or '(없음)'}")
            _apply_cross_event(conn, e, require_review, counts)
        elif strategy == "business_card":
            _apply_business_card_event(conn, e, require_review, counts, logs)
        else:
            _apply_inbound_event(conn, e, require_review, counts)
        applied_kind = e.get("kind") or e.get("src") or "activity"
        if e.get("_applied", True):
            _mark_applied(conn, channel_id, e["ts"], applied_kind)
            _record_parsed_event(conn, channel_id, e["ts"], applied_kind, applied=True)
            max_ts = max(max_ts, event_ts)
        else:
            # 파싱은 시도했으나 반영 못함 → 재시도 가능하도록 applied=0 기록
            _record_parsed_event(conn, channel_id, e["ts"], applied_kind, applied=False)
            conn.execute(
                "UPDATE slack_raw_messages SET archived=0 WHERE channel_id=? AND message_ts=?",
                (channel_id, str(e["ts"])),
            )
        if e.get("_applied", True):
            conn.commit()  # Slack API 대기 중 DB 쓰기 잠금을 보유하지 않는다.
            _post_sync_callback(conn, channel_id, e, applied_kind, settings, logs)
        _log(logs, f"  → [{i}/{len(fresh)}] {applied_kind} {'반영' if e.get('_applied', True) else '보류'} (ts={e['ts']})")
        if i % COMMIT_EVERY == 0:
            state[channel_id] = max_ts
            queries.save_sync_settings(conn, {"channel_state": state})
            conn.commit()
            _log(logs, f"  … 진행 저장 {i}/{len(fresh)} (재개 지점 ts={max_ts:.0f})")

    state[channel_id] = max_ts
    queries.save_sync_settings(conn, {"channel_state": state})
    if strategy == "business_card":
        initial_budget = int(settings.get("_business_card_budget") or 0)
        counts["card_processed"] = initial_budget - int(card_budget_box.get("remaining") or 0)
        queue_row = conn.execute(
            """
            SELECT
              SUM(CASE WHEN archived=0 AND status IN ('pending','processing','error','parsed') THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN archived=0 AND status='error' THEN 1 ELSE 0 END) AS retrying
            FROM slack_card_items WHERE channel_id=?
            """,
            (channel_id,),
        ).fetchone()
        counts["card_pending"] = int(queue_row["pending"] or 0)
        counts["card_retrying"] = int(queue_row["retrying"] or 0)
        _log(
            logs,
            f"[sync] 명함 큐 — 이번 실행 {counts['card_processed']}장 · "
            f"남은 대기 {counts['card_pending']}장 · 재시도 {counts['card_retrying']}장",
        )
        counts["card_callback_checked"] = _retry_business_card_callbacks(
            conn, channel_id, settings, logs
        )
    conn.commit()
    return counts


def _apply_business_card_event(
    conn, e: dict, require_review: bool, counts: dict, logs: list[str] | None = None
) -> None:
    """Apply one Slack business-card image message using vision OCR.

    우선순위: z.ai Vision MCP(코딩플랜 GLM-4.6V) → REST vision 폴백.
    """
    _ensure_business_card_source(conn)
    channel_id = str(e.get("channel_id") or "")
    message_ts = str(e.get("ts") or "")
    files = e.get("files", []) or []
    for file_item in files:
        file_id = str(file_item.get("id") or "")
        if file_id:
            conn.execute(
                """
                INSERT OR IGNORE INTO slack_card_items
                  (channel_id, message_ts, file_id, file_name, status)
                VALUES(?, ?, ?, ?, 'pending')
                """,
                (channel_id, message_ts, file_id,
                 file_item.get("name") or file_item.get("title") or file_id),
            )
    conn.commit()

    vision_ok, vision_reason = vision.available()
    if not vision_ok:
        e["_applied"] = False
        _log(logs, f"  ⚠️ 명함 OCR 건너뜀: {vision_reason} (VISION_PROVIDER={vision.provider()})")
        return

    for file_item in files:
        file_id = str(file_item.get("id") or "")
        filename = file_item.get("name") or file_item.get("title") or file_item.get("id") or "business-card"
        state = conn.execute(
            "SELECT status, archived, attempts, next_retry_at FROM slack_card_items "
            "WHERE channel_id=? AND message_ts=? AND file_id=?",
            (channel_id, message_ts, file_id),
        ).fetchone()
        if state and (state["archived"] or state["status"] == "applied"):
            continue
        now = datetime.now(KST)
        if state and state["next_retry_at"]:
            try:
                if datetime.strptime(state["next_retry_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST) > now:
                    _log(logs, f"  ⏳ 명함 재시도 대기: {filename} ({state['next_retry_at']})")
                    continue
            except ValueError:
                pass
        budget = int(e.get("_business_card_budget", 0) or 0)
        # _process_channel이 settings에 둔 공유 예산을 이벤트에 전달한다.
        budget_box = e.get("_budget_box")
        if isinstance(budget_box, dict):
            budget = int(budget_box.get("remaining", 0))
        if budget <= 0:
            _log(logs, f"  ⏸ 명함 OCR 주기 처리량 도달 — 다음 주기에 계속: {filename}")
            continue
        attempts = int(state["attempts"] if state else 0) + 1
        conn.execute(
            "UPDATE slack_card_items SET status='processing', attempts=?, last_error='', "
            "next_retry_at='', updated_at=CURRENT_TIMESTAMP "
            "WHERE channel_id=? AND message_ts=? AND file_id=?",
            (attempts, channel_id, message_ts, file_id),
        )
        conn.commit()  # 네트워크 추론 중 DB 쓰기 잠금을 보유하지 않는다.
        if isinstance(budget_box, dict):
            budget_box["remaining"] = budget - 1
        else:
            e["_business_card_budget"] = budget - 1
        _log(logs, f"  🔄 명함 순차 처리: {filename} (시도 {attempts})")

        def mark_error(message: str) -> None:
            delay_minutes = min(60, 2 ** min(attempts, 6))
            retry_at = (datetime.now(KST) + timedelta(minutes=delay_minutes)).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                "UPDATE slack_card_items SET status='error', last_error=?, next_retry_at=?, "
                "updated_at=CURRENT_TIMESTAMP WHERE channel_id=? AND message_ts=? AND file_id=?",
                (message[:500], retry_at, channel_id, message_ts, file_id),
            )
            conn.commit()

        try:
            image_bytes, detected_mime = _download_slack_file(file_item)
        except Exception as exc:  # noqa: BLE001
            _log(logs, f"  ⚠️ 명함 이미지 다운로드 실패: {filename} — {exc}")
            mark_error(f"다운로드 실패: {exc}")
            continue

        mime_type = file_item.get("mimetype") or detected_mime or "image/jpeg"
        ocr = vision.ocr_business_card(
            image_bytes, mime_type=mime_type, filename=filename,
            hint=e.get("source_text", ""), logs=logs,
        )
        if not vision.is_ok(ocr):
            _log(logs, f"  ⚠️ 명함 OCR 실패: {filename} — {ocr.get('message', 'unknown')}")
            e["_error"] = ocr.get("message", "OCR failed")
            mark_error(str(e["_error"]))
            continue
        _log(logs, f"  🪪 OCR 성공[{ocr.get('_provider', '?')}]: {filename}")

        email = (ocr.get("email") or "").strip().lower()
        company = (ocr.get("company") or "").strip()
        name = (ocr.get("name") or "").strip()
        confidence = float(ocr.get("confidence") or 0)
        if "@" not in email:
            _log(logs, f"  ⚠️ 명함 OCR 보류: {filename} — 이메일을 읽지 못함")
            e["_error"] = "명함 OCR이 이메일을 읽지 못함"
            mark_error(str(e["_error"]))
            continue

        review_required = (
            bool(ocr.get("review_required"))
            or confidence < 0.75
            or (require_review and company and not _company_exists(conn, company))
        )
        apply_company = "" if review_required else company
        phone = (ocr.get("mobile") or ocr.get("phone") or "").strip()
        memo_parts = [
            "명함 OCR",
            f"파일: {filename}",
            f"신뢰도: {confidence:.2f}",
            (ocr.get("evidence") or "").strip(),
        ]
        inquiry = "\n".join(p for p in memo_parts if p)
        res = queries.apply_contact_event(
            conn,
            email=email,
            name=name,
            company=apply_company,
            department=(ocr.get("department") or "").strip(),
            title=(ocr.get("title") or "").strip(),
            phone=phone,
            interest="",
            inquiry=inquiry,
            occurred_at=e["dt"],
            source_code="business_card",
            activity_type="명함 수집",
            collected_at=e.get("collected_at", ""),
            raw_payload={**e, "ocr": ocr, "file": file_item},
        )
        counts["new_leads" if res["created"] else "new_activities"] += 1
        conn.execute(
            "UPDATE slack_card_items SET status='applied', ocr_json=?, applied_at=CURRENT_TIMESTAMP, "
            "last_error='', next_retry_at='', updated_at=CURRENT_TIMESTAMP "
            "WHERE channel_id=? AND message_ts=? AND file_id=?",
            (json.dumps(ocr, ensure_ascii=False), channel_id, message_ts, file_id),
        )
        conn.commit()

        if review_required and company:
            conn.execute(
                """
                INSERT INTO consistency_reviews
                  (review_type, entity_type, entity_id, field_name, current_value,
                   proposed_value, evidence, source_table, confidence)
                VALUES ('business_card_company', 'contact', ?, 'company_id', '', ?, ?, 'slack_sync', ?)
                """,
                (
                    res["contact_id"],
                    company,
                    f"Slack 명함 OCR 회사 연결 확인 필요 — {company} ({filename})",
                    max(0.1, min(confidence, 0.99)),
                ),
            )
            counts["queued"] += 1
        _log(
            logs,
            f"  🪪 명함 OCR: {company or '-'} / {name or '-'} / {email} "
            f"({'검수' if review_required else '반영'})",
        )

    active_ids = [str(f.get("id") or "") for f in files if str(f.get("id") or "")]
    applied_count = 0
    if active_ids:
        placeholders = ",".join("?" for _ in active_ids)
        applied_count = int(conn.execute(
            f"SELECT COUNT(*) FROM slack_card_items WHERE channel_id=? AND message_ts=? "
            f"AND archived=0 AND status='applied' AND file_id IN ({placeholders})",
            [channel_id, message_ts, *active_ids],
        ).fetchone()[0])
        archived_count = int(conn.execute(
            f"SELECT COUNT(*) FROM slack_card_items WHERE channel_id=? AND message_ts=? "
            f"AND archived=1 AND file_id IN ({placeholders})",
            [channel_id, message_ts, *active_ids],
        ).fetchone()[0])
    else:
        archived_count = 0
    e["_applied"] = bool(active_ids) and applied_count + archived_count >= len(active_ids)


def ocr_message_cards(
    conn, channel_id: str, ts: str, logs: list[str] | None = None, file_id: str = ""
) -> dict:
    """On-demand OCR of business-card image(s) in a stored Slack message.

    수집 원문 뷰어의 '명함 추론하기' 버튼용 — DB에 반영하지 않고 추출 필드만 반환한다.
    사용자가 결과를 확인/수정한 뒤 기존 '반영하기'(apply)로 저장한다.
    """
    logs = logs if logs is not None else []
    row = conn.execute(
        "SELECT raw_payload, text FROM slack_raw_messages WHERE channel_id=? AND message_ts=?",
        (channel_id, str(ts)),
    ).fetchone()
    if not row:
        return {"ok": False, "message": "원문을 찾을 수 없습니다."}
    try:
        payload = json.loads(row["raw_payload"] or "{}")
    except (ValueError, TypeError):
        payload = {}
    files = [f for f in payload.get("files", []) or [] if _is_image_file(f)]
    if file_id:
        files = [f for f in files if str(f.get("id") or "") == str(file_id)]
    if not files:
        return {"ok": False, "message": "이 메시지에는 명함 이미지 파일이 없습니다."}
    vision_ok, reason = vision.available()
    if not vision_ok:
        return {"ok": False, "message": f"OCR 백엔드 미가용: {reason} (VISION_PROVIDER={vision.provider()})"}

    hint = payload.get("text", "") or row["text"] or ""
    cards = []
    for f in files:
        name = f.get("name") or f.get("title") or f.get("id") or "명함"
        current_file_id = str(f.get("id") or "")
        _log(logs, f"[ocr] 명함 추론: {name}")
        try:
            image_bytes, detected_mime = _download_slack_file(f)
        except Exception as exc:  # noqa: BLE001
            cards.append({"file_id": current_file_id, "file_name": name, "ok": False, "message": f"다운로드 실패: {exc}"})
            continue
        mime = f.get("mimetype") or detected_mime or "image/jpeg"
        ocr = vision.ocr_business_card(image_bytes, mime_type=mime, filename=name, hint=hint, logs=logs)
        if not vision.is_ok(ocr):
            cards.append({"file_id": current_file_id, "file_name": name, "ok": False, "message": ocr.get("message", "OCR 실패")})
            continue
        card = {
            "file_id": current_file_id,
            "file_name": name,
            "ok": True,
            "provider": ocr.get("_provider", ""),
            "confidence": float(ocr.get("confidence") or 0),
            "fields": {
                "company": (ocr.get("company") or "").strip(),
                "name": (ocr.get("name") or "").strip(),
                "email": (ocr.get("email") or "").strip(),
                "department": (ocr.get("department") or "").strip(),
                "title": (ocr.get("title") or "").strip(),
                "phone": (ocr.get("mobile") or ocr.get("phone") or "").strip(),
            },
            "evidence": (ocr.get("evidence") or "").strip(),
            "rotation": int(ocr.get("_rotation") or 0),
        }
        cards.append(card)
        if current_file_id:
            conn.execute(
                """
                INSERT INTO slack_card_items(channel_id, message_ts, file_id, file_name, status, ocr_json)
                VALUES(?, ?, ?, ?, 'parsed', ?)
                ON CONFLICT(channel_id, message_ts, file_id) DO UPDATE SET
                  file_name=excluded.file_name,
                  status=CASE WHEN slack_card_items.status='applied' THEN 'applied' ELSE 'parsed' END,
                  ocr_json=excluded.ocr_json, updated_at=CURRENT_TIMESTAMP
                """,
                (channel_id, str(ts), current_file_id, name, json.dumps(card, ensure_ascii=False)),
            )
    ok_any = any(c.get("ok") for c in cards)
    return {"ok": ok_any, "cards": cards, "message": "" if ok_any else "OCR 결과가 없습니다."}


def get_message_image(conn, channel_id: str, ts: str, file_id: str) -> tuple[bytes, str, str]:
    """Download one private Slack image for authenticated in-app preview."""
    row = conn.execute(
        "SELECT raw_payload FROM slack_raw_messages WHERE channel_id=? AND message_ts=?",
        (channel_id, str(ts)),
    ).fetchone()
    if not row:
        raise LookupError("원문을 찾을 수 없습니다")
    try:
        payload = json.loads(row["raw_payload"] or "{}")
    except (ValueError, TypeError):
        payload = {}
    files = [f for f in payload.get("files", []) or [] if _is_image_file(f)]
    target = next((f for f in files if str(f.get("id") or "") == file_id), None)
    if target is None:
        raise LookupError("명함 이미지 파일을 찾을 수 없습니다")
    image, detected_mime = _download_slack_file(target)
    mime = str(target.get("mimetype") or detected_mime or "image/jpeg")
    name = str(target.get("name") or target.get("title") or file_id or "business-card")
    return image, mime, name


def _apply_inbound_event(conn, e: dict, require_review: bool, counts: dict) -> None:
    company = e.get("co", "")
    if _is_low_quality_company_name(company):
        company = UNCLASSIFIED
        e["co"] = UNCLASSIFIED
    # 이메일이 없으면 담당자 생성 불가 → 회사 단위 활동으로 보존(회사도 없으면 미분류)
    if not (e.get("em") and "@" in e["em"]):
        co = company or UNCLASSIFIED
        if co == UNCLASSIFIED:
            e["_applied"] = False
            return
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


def _glm_enrich_event(e: dict, logs: list[str] | None = None) -> None:
    """결정적 파싱 실패 이벤트를 GLM으로 회사/담당자/솔루션 보강 (적극 사용)."""
    source = e.get("source_text") or e.get("iq") or ""
    current = list(e.get("companies") or [])
    selected = glm.select_external_company_candidates(source, current)
    if selected.get("_mode") == "glm" and selected.get("companies"):
        normalized = []
        for company in selected.get("companies") or []:
            company = _clean_company(str(company))
            if company and not _is_company_noise(company):
                normalized.append(company)
        normalized = _normalize_company_list(normalized)
        if normalized:
            e["companies"] = normalized
            e["primary_co"] = e["companies"][0]
            e["co"] = e["companies"][0]

    involved = glm.extract_involved_companies(
        source,
        candidates=list(e.get("companies") or []),
    )
    if involved.get("_mode") == "glm":
        current = list(e.get("companies") or [])
        for company in involved.get("companies") or []:
            company = _clean_company(str(company))
            if _is_company_noise(company):
                continue
            if any(company in c or c in company for c in current):
                continue
            current.append(company)
        normalized = _normalize_company_list(current)
        if normalized:
            e["companies"] = normalized
            e["primary_co"] = normalized[0]
            e["co"] = normalized[0]

    res = glm.extract_lead_event(e.get("source_text") or e.get("iq") or "")
    if res.get("_mode") != "glm":
        if logs is not None and involved.get("_mode") == "glm" and involved.get("companies"):
            _log(logs, f"  ✨GLM 관련사 보강: {e.get('companies') or '-'}")
        return
    comps = [
        (c.get("name") or "").strip()
        for c in (res.get("companies") or [])
        if isinstance(c, dict) and (c.get("name") or "").strip()
    ]
    if comps:
        current = list(e.get("companies") or [])
        for comp in comps:
            comp = _clean_company(comp)
            if _is_company_noise(comp):
                continue
            if any(comp in c or c in comp for c in current):
                continue
            current.append(comp)
        normalized = _normalize_company_list(current)
        if normalized:
            e["companies"] = normalized
            e["primary_co"] = normalized[0]
            e["co"] = normalized[0]
    cons = []
    for c in res.get("contacts") or []:
        if not isinstance(c, dict):
            continue
        em = (c.get("email") or "").strip().lower()
        if "@" in em:
            cons.append({
                "email": em, "name": c.get("name", ""), "phone": c.get("phone", ""),
                "department": c.get("department", ""), "title": c.get("title", ""),
            })
    if cons:
        e["contacts"] = cons
    act = res.get("activity") or {}
    if not e.get("it") and isinstance(act, dict) and act.get("solution_name"):
        e["it"] = act["solution_name"]
    if logs is not None and (comps or cons):
        _log(logs, f"  ✨GLM 추출: 회사={e.get('companies') or '-'} 담당={[c['email'] for c in cons] or '-'}")


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

    # 회사도 연락처도 없는 내부 메모/일반 문의는 DB 회사 활동으로 만들지
    # 않는다. 원문은 slack_raw_messages에 보존되며, 필요하면 원문 패널에서
    # 수동 반영한다.
    if not companies and not contacts:
        e["_applied"] = False
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


def run_recleanse(logs: list[str] | None = None) -> dict:
    """저장된 원문(slack_raw_messages)만으로 슬랙 유래 활동을 재생성(재수집 없음).

    - 시드/수기 데이터(collected_at='')는 보존, 슬랙 동기화 활동만 교체.
    - 개선된 파서 + (설정 시) GLM 폴백을 그대로 사용해 안전하게 전체 재정리.
    - 콜백은 강제 비활성(스레드 답글 폭탄 방지), 감사 로그도 남기지 않음(대량).
    """
    logs = logs if logs is not None else []
    with get_conn() as conn:
        conn.execute("UPDATE change_batch SET logging=0 WHERE id=1")  # 대량: 감사 제외
        settings = dict(queries.get_sync_settings(conn))
        settings["slack_callback_enabled"] = False  # 재클렌징은 콜백 금지
        _log(logs, "[recleanse] 저장 원문에서 재파싱 시작 (재수집 없음)")

        removed = conn.execute(
            "SELECT COUNT(*) FROM activities WHERE collected_at <> ''"
        ).fetchone()[0]
        conn.execute("DELETE FROM activities WHERE collected_at <> ''")
        _log(logs, f"[recleanse] 기존 슬랙 활동 {removed}건 제거 → 재생성")
        # 재클렌징은 전량 재생성이므로 UUID 중복표를 초기화해 재파싱을 허용한다.
        _ensure_parsed_events(conn)
        conn.execute("DELETE FROM parsed_events")

        by_ch: dict[str, list] = {}
        for r in conn.execute("SELECT channel_id, raw_payload FROM slack_raw_messages"):
            try:
                p = json.loads(r["raw_payload"] or "{}")
            except (ValueError, TypeError):
                continue
            if p.get("is_reply"):
                continue
            by_ch.setdefault(r["channel_id"], []).append(p)

        channels = {c.get("id"): c for c in settings.get("channels", [])}
        state: dict = {}
        totals = {"collected": 0, "parsed": 0, "new_leads": 0, "new_activities": 0, "queued": 0}
        for ch_id, msgs in by_ch.items():
            strat = channels.get(ch_id, {}).get("strategy", "inbound")
            msgs.sort(key=lambda m: _ts_float(m.get("ts", 0)))
            r = _process_channel(conn, ch_id, strat, msgs, settings, state, None, logs)
            for k in totals:
                totals[k] += r[k]
        queries.save_sync_settings(conn, {"channel_state": state})

        # 슬랙 유래 빈 회사(담당자·활동 0) 정리
        orphans = conn.execute(
            "SELECT id FROM companies "
            "WHERE profile_source IN ('slack_glm','manual','user_register') "
            "AND id NOT IN (SELECT company_id FROM contacts WHERE company_id IS NOT NULL) "
            "AND id NOT IN (SELECT company_id FROM activities WHERE company_id IS NOT NULL)"
        ).fetchall()
        for o in orphans:
            conn.execute("DELETE FROM companies WHERE id = ?", (o["id"],))
        _log(logs, f"[recleanse] 빈 회사 {len(orphans)}곳 정리")

        made = totals["new_leads"] + totals["new_activities"]
        _log(logs, f"[recleanse] 완료 — 활동 {made}건 재생성 · 검수 {totals['queued']}")
        return {
            "ok": True,
            "message": f"재클렌징 완료 — 활동 {made}건 재생성, 검수 {totals['queued']}",
            "removed": removed,
            "collected": totals["collected"],
            "new_leads": totals["new_leads"],
            "new_activities": totals["new_activities"],
            "queued_reviews": totals["queued"],
            "parsed": totals["parsed"],
            "log": logs,
        }


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
