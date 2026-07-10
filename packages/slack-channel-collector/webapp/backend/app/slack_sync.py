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


def _ensure_collector_importable() -> None:
    """Allow importing the collector from the sibling src/ tree even when the
    `rtm_slack_channel_collector` package isn't pip-installed."""
    src = PACKAGE_ROOT / "src"
    if src.is_dir() and str(src) not in sys.path:
        sys.path.insert(0, str(src))


# ── message parsing ──────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"[^\s<>|@]+@[^\s<>|@]+\.[^\s<>|@]+")


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
    flat: list[dict[str, Any]] = []
    for msg in messages:
        flat.append(msg)
        for reply in msg.get("thread_replies", []) or []:
            flat.append(reply)

    for msg in flat:
        text = msg.get("text", "") or ""
        ts = msg.get("ts", "") or ""
        dt = _ts_to_kst(ts)
        f = _fields(text)

        # company: 회사명 / 고객명 (guide or real meeting-log format)
        company = f.get("회사명") or f.get("고객명") or ""
        if not company:
            m = re.search(r"(?:고객명|회사명)\s*[:：]\s*(.+)", text)
            company = m.group(1).strip() if m else ""
        if not company:
            continue  # not a customer entry — skip chatter/notices

        companies = _split_companies(company) + _split_companies(f.get("관련사", ""))
        companies = list(dict.fromkeys([c for c in companies if c]))

        confirm = f.get("확인상태", "")
        review_required = ("확인 필요" in confirm) or ("추정" in confirm)
        occurred = _norm_date(
            f.get("발생일시") or f.get("방문 일자") or f.get("방문일자") or "", dt
        )

        # 관심 솔루션: 명시 필드 우선, 없으면 본문 키워드 감지
        solution = f.get("관심 솔루션", "")
        if not solution:
            hits = [s for s in _SOLUTIONS if s.lower() in text.lower()]
            solution = ", ".join(hits)

        next_action = f.get("다음 액션") or f.get("Next Plan") or ""
        if not next_action:
            m = re.search(r"(?:Next Plan|다음\s*액션|다음\s*단계)\s*[:：]?\s*(.+)", text, re.I | re.S)
            if m:
                next_action = re.sub(r"\s+", " ", m.group(1)).strip()[:200]

        inquiry = f.get("활동내용") or f.get("문의내용") or f.get("방문 목적") or f.get("방문목적") or ""
        if not inquiry:
            inquiry = _clean_note(text)  # meeting log → full cleaned note

        kind = "activity"
        if "[신규 리드]" in text or text.lstrip().startswith("신규 리드"):
            kind = "lead"
        elif "회사 정보 업데이트" in text or "[회사 정보" in text:
            kind = "company_update"

        # 담당자: 구조화된 '고객 담당자:' 블록이 있을 때만 (미팅 로그는 회사 단위 활동)
        contacts = _parse_contact_lines(text)
        if not contacts and (f.get("이메일") or f.get("이름")):
            em = _mail_of(f.get("이메일", ""))
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
            "source_text": text,  # 원문 그대로 보존 (활동기록에 출력)
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


def _load_from_collector(
    settings: dict, limit: int | None = None, channel_id: str | None = None
) -> tuple[list[dict], str, str]:
    _ensure_collector_importable()
    from rtm_slack_channel_collector import collector  # type: ignore

    overrides: dict[str, Any] = {}
    if channel_id:
        overrides["channel_id"] = channel_id
    elif settings.get("channel_id"):
        overrides["channel_id"] = settings["channel_id"]
    if settings.get("lookback_hours"):
        overrides["lookback_hours"] = int(settings["lookback_hours"])
    if limit:
        # fetch the most recent N: cap the batch and widen the window so count,
        # not time, is the limiting factor.
        overrides["limit"] = int(limit)
        overrides["lookback_hours"] = max(int(settings.get("lookback_hours") or 0), 24 * 3650)
    config = collector.CollectionConfig.from_env(require_token=True)
    if overrides:
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
    conn.execute(
        """
        INSERT INTO slack_raw_messages(channel_id, message_ts, user_id, text, raw_payload)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(channel_id, message_ts) DO UPDATE SET
          text = excluded.text, raw_payload = excluded.raw_payload
        """,
        (
            channel_id,
            ts,
            str(msg.get("user", "")),
            msg.get("text", ""),
            json.dumps(payload, ensure_ascii=False),
        ),
    )


# ── entrypoint ───────────────────────────────────────────────────────────────
def run_sync(
    export_file: str | None = None,
    limit: int | None = None,
    only_channel: str | None = None,
) -> dict:
    export_file = export_file or os.environ.get("RTM_SLACK_EXPORT_FILE", "").strip()
    has_token = bool(
        os.environ.get("SLACK_BOT_TOKEN")
        or os.environ.get("SLACK_USER_TOKEN")
        or os.environ.get("SLACK_TOKEN")
    )

    with get_conn() as conn:
        settings = queries.get_sync_settings(conn)
        if limit is None:
            limit = int(settings.get("sync_limit") or 0) or None
        channels = settings.get("channels", [])
        state = dict(settings.get("channel_state") or {})

        totals = {"collected": 0, "parsed": 0, "new_leads": 0, "new_activities": 0, "queued": 0}
        per_channel = []

        try:
            if export_file:
                p = Path(export_file).expanduser()
                if not p.exists():
                    return _not_ok(f"export 파일을 찾을 수 없습니다: {p}")
                messages, ch_id, source = _load_from_export(p)
                # strategy = matching configured channel, else inbound
                strat = next(
                    (c.get("strategy", "inbound") for c in channels if c.get("id") == ch_id),
                    "inbound",
                )
                r = _process_channel(conn, ch_id or "export", strat, messages, settings, state, limit)
                _merge_totals(totals, r)
                per_channel.append({"channel": ch_id or source, "strategy": strat, **r})
            elif has_token:
                targets = [c for c in channels if c.get("enabled", True) and c.get("id")]
                if only_channel:
                    targets = [c for c in targets if c["id"] == only_channel]
                if not targets:
                    return _not_ok("활성화된 수집 채널이 없습니다. 동기화 설정을 확인하세요.")
                for ch in targets:
                    msgs, ch_id, _ = _load_from_collector(settings, limit=limit, channel_id=ch["id"])
                    r = _process_channel(conn, ch["id"], ch.get("strategy", "inbound"), msgs, settings, state, limit)
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
        print(
            f"[sync] DONE collected={totals['collected']} parsed={totals['parsed']} "
            f"leads={totals['new_leads']} activities={totals['new_activities']} "
            f"queued={totals['queued']}",
            flush=True,
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
        }


def _merge_totals(totals: dict, r: dict) -> None:
    totals["collected"] += r["collected"]
    totals["parsed"] += r["parsed"]
    totals["new_leads"] += r["new_leads"]
    totals["new_activities"] += r["new_activities"]
    totals["queued"] += r["queued"]


def _process_channel(
    conn, channel_id: str, strategy: str, messages: list[dict],
    settings: dict, state: dict, limit: int | None,
) -> dict:
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
            _store_raw_message(conn, channel_id, rep, rpl)
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
    print(
        f"[sync] #{channel_id} ({strategy}) collected={len(messages)} "
        f"parsed={len(events)} fresh={len(fresh)}",
        flush=True,
    )
    for e in fresh:
        _cos = ", ".join(e.get("companies", []) or [e.get("co", "")])
        _who = ", ".join(c.get("email", "") for c in e.get("contacts", [])) or e.get("em", "")
        print(
            f"  [{e.get('dt','')}] {e.get('kind', e.get('src',''))} | 회사: {_cos or '-'}"
            f" | 담당: {_who or '-'} | 솔루션: {e.get('it','') or '-'}",
            flush=True,
        )
    for e in fresh:
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

    state[channel_id] = max_ts
    return counts


def _apply_inbound_event(conn, e: dict, require_review: bool, counts: dict) -> None:
    company = e.get("co", "")
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
    return {
        "ok": False,
        "configured": False,
        "message": message,
        "new_leads": 0,
        "new_activities": 0,
        "queued_reviews": 0,
        "parsed": 0,
    }
