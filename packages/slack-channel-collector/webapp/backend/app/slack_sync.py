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
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from . import queries
from .db import get_conn

KST = ZoneInfo("Asia/Seoul")


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


# ── message loading ──────────────────────────────────────────────────────────
def _load_from_export(path: Path) -> tuple[list[dict], str, str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload, "", str(path)
    channel_id = (payload.get("channel") or {}).get("id", "") or payload.get("channel_id", "")
    return payload.get("messages", []), channel_id, str(path)


def _load_from_collector(settings: dict, limit: int | None = None) -> tuple[list[dict], str, str]:
    from rtm_slack_channel_collector import collector  # type: ignore

    overrides: dict[str, Any] = {}
    if settings.get("channel_id"):
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
def run_sync(export_file: str | None = None, limit: int | None = None) -> dict:
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

        # 1) figure out where messages come from
        try:
            if export_file:
                p = Path(export_file).expanduser()
                if not p.exists():
                    return _not_ok(f"export 파일을 찾을 수 없습니다: {p}")
                messages, channel_id, source = _load_from_export(p)
            elif has_token:
                messages, channel_id, source = _load_from_collector(settings, limit=limit)
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

        # keep only the most recent N messages when a limit is requested
        if limit:
            messages = sorted(messages, key=lambda m: _ts_float(m.get("ts", 0)), reverse=True)[
                : int(limit)
            ]

        # preserve raw Slack content: text, permalink, and thread comments.
        info_by_ts: dict[str, dict] = {}
        for m in messages:
            ts = str(m.get("ts", ""))
            has_pl = "permalink" in m and m.get("permalink")
            pl = queries.slack_permalink(
                channel_id, ts, json.dumps(m) if has_pl else None
            )
            _store_raw_message(conn, channel_id, m, pl)
            replies = m.get("thread_replies", []) or []
            comments = []
            for rep in replies:
                rts = str(rep.get("ts", ""))
                rpl = queries.slack_permalink(channel_id, rts, None)
                _store_raw_message(conn, channel_id, rep, rpl)
                if rep.get("text"):
                    comments.append({"ts": rts, "text": rep.get("text", ""), "permalink": rpl})
            info_by_ts[ts] = {"permalink": pl, "comments": comments, "channel_id": channel_id}

        # 2) parse + filter by rules
        events = parse_messages(messages)
        allowed = set()
        if settings.get("include_relate", True):
            allowed.add("relate")
        if settings.get("include_featpaper", True):
            allowed.add("featpaper")
        events = [e for e in events if e["src"] in allowed]

        # 3) dedup by last_synced_ts, apply oldest-first
        last_ts = float(settings.get("last_synced_ts") or 0)
        fresh = [e for e in events if _ts_float(e["ts"]) > last_ts]
        fresh.sort(key=lambda e: _ts_float(e["ts"]))

        new_leads = new_acts = queued = 0
        max_ts = last_ts
        require_review = bool(settings.get("require_review_for_new_company"))
        for e in fresh:
            max_ts = max(max_ts, _ts_float(e["ts"]))
            info = info_by_ts.get(str(e["ts"]), {})
            e["permalink"] = info.get("permalink", "")
            e["comments"] = info.get("comments", [])
            e["channel_id"] = info.get("channel_id", channel_id)
            company = e.get("co", "")
            company_known = _company_exists(conn, company) if company else True
            if require_review and company and not company_known:
                _apply_without_company_then_review(conn, e)
                queued += 1
                new_leads += 1
                continue
            res = queries.apply_contact_event(
                conn,
                email=e["em"], name=e.get("nm", ""), company=company,
                department=e.get("dept", ""), title=e.get("title", ""),
                phone=e.get("ph", ""), interest=e.get("it", ""),
                inquiry=(f"[{e['dt'][:10]}] {e['iq']}" if e.get("iq") else ""),
                occurred_at=e["dt"], source_code=e["src"], raw_payload=e,
            )
            if res["created"]:
                new_leads += 1
            else:
                new_acts += 1

        queries.save_sync_settings(conn, {"last_synced_ts": max_ts})

        parts = []
        if new_leads:
            parts.append(f"신규 리드 {new_leads}건")
        if new_acts:
            parts.append(f"기존 고객 활동 {new_acts}건")
        if queued:
            parts.append(f"검수 대기 {queued}건")
        msg = " · ".join(parts) if parts else "새 리드 없음 — 최신 상태입니다"

        return {
            "ok": True,
            "configured": True,
            "source": source,
            "message": f"동기화 완료 — {msg}",
            "collected": len(messages),
            "new_leads": new_leads,
            "new_activities": new_acts,
            "queued_reviews": queued,
            "parsed": len(events),
        }


def _apply_without_company_then_review(conn, e: dict) -> None:
    res = queries.apply_contact_event(
        conn,
        email=e["em"], name=e.get("nm", ""), company="",
        department=e.get("dept", ""), title=e.get("title", ""),
        phone=e.get("ph", ""), interest=e.get("it", ""),
        inquiry=(f"[{e['dt'][:10]}] {e['iq']}" if e.get("iq") else ""),
        occurred_at=e["dt"], source_code=e["src"], raw_payload=e,
    )
    conn.execute(
        """
        INSERT INTO consistency_reviews
          (review_type, entity_type, entity_id, field_name, current_value,
           proposed_value, evidence, source_table, confidence)
        VALUES ('new_company', 'contact', ?, 'company_id', '', ?, ?, 'slack_sync', 0.5)
        """,
        (res["contact_id"], e.get("co", ""), f"Slack {e['src']} 리드의 새 회사 확인 필요"),
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
