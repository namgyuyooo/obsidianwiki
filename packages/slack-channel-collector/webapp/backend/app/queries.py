"""SQL read/write helpers.

The customer records are returned in the compact shape the original
``RTM_고객DB_대시보드.html`` used (``e/n/c/d/t/p/i/s/st/sub/f/l/a/q``) so the
React frontend can reuse the exact grouping / filtering / charting logic that
lived in the HTML. Company profile fields are returned as a separate keyed map,
mirroring the old ``AUTO_CINFO`` / ``userCInfo`` model.
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from typing import Any

from .config import get_settings
from .db import AUDIT_SPECS


def begin_change(
    conn: sqlite3.Connection,
    label: str,
    actor: Any | None = None,
    *,
    source: str = "manual",
    reason: str = "",
) -> str:
    """이후의 모든 DB 변경을 하나의 배치로 change_log에 기록하도록 표시."""
    batch = uuid.uuid4().hex[:12]
    conn.execute(
        """
        UPDATE change_batch
        SET batch=?, label=?, logging=1, actor_user_id=?, actor_email=?, source=?, reason=?
        WHERE id=1
        """,
        (
            batch,
            label,
            getattr(actor, "user_id", None),
            getattr(actor, "email", "") if actor else "",
            source,
            reason,
        ),
    )
    return batch


def list_audit(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        """
        SELECT batch, label,
               COALESCE(MAX(actor_email), '') AS actor_email,
               COALESCE(MAX(source), '') AS source,
               MIN(created_at) AS at, COUNT(*) AS changes,
               SUM(CASE WHEN undone=1 THEN 1 ELSE 0 END) AS undone_ct
        FROM change_log
        WHERE batch <> ''
        GROUP BY batch, label
        ORDER BY MAX(id) DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    out = []
    for r in rows:
        out.append({
            "batch": r["batch"],
            "label": r["label"],
            "actor_email": r["actor_email"],
            "source": r["source"],
            "at": r["at"],
            "changes": r["changes"],
            "undone": r["undone_ct"] == r["changes"] and r["changes"] > 0,
        })
    return out


def undo_batch(conn: sqlite3.Connection, batch: str) -> dict:
    """배치의 모든 변경을 역순으로 되돌린다 (원상복구). 되돌리기 자체는 기록하지 않음."""
    rows = conn.execute(
        "SELECT * FROM change_log WHERE batch=? AND undone=0 ORDER BY id DESC",
        (batch,),
    ).fetchall()
    if not rows:
        return {"undone": 0}
    conn.execute("UPDATE change_batch SET logging=0 WHERE id=1")  # 되돌리기는 로깅 제외
    n = 0
    try:
        for r in rows:
            table = r["table_name"]
            cols = AUDIT_SPECS.get(table)
            if not cols:
                continue
            if r["op"] == "INSERT":
                conn.execute(f"DELETE FROM {table} WHERE id=?", (r["row_pk"],))
            elif r["op"] == "DELETE":
                data = json.loads(r["old_json"] or "{}")
                placeholders = ",".join("?" for _ in cols)
                conn.execute(
                    f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({placeholders})",
                    [data.get(c) for c in cols],
                )
            elif r["op"] == "UPDATE":
                data = json.loads(r["old_json"] or "{}")
                sets = ",".join(f"{c}=?" for c in cols if c != "id")
                params = [data.get(c) for c in cols if c != "id"] + [r["row_pk"]]
                conn.execute(f"UPDATE {table} SET {sets} WHERE id=?", params)
            conn.execute("UPDATE change_log SET undone=1 WHERE id=?", (r["id"],))
            n += 1
    finally:
        conn.execute("UPDATE change_batch SET logging=1 WHERE id=1")
    return {"undone": n, "batch": batch}

UNKNOWN_KEY = "(회사 미상)"

_MENTION_RE = re.compile(r"<@([UWB][A-Z0-9]+)>")
_FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "naver.com",
    "hanmail.net",
    "daum.net",
    "kakao.com",
    "nate.com",
    "paran.com",
    "empal.com",
    "dreamwiz.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "yahoo.com",
    "yahoo.co.kr",
    "proton.me",
    "protonmail.com",
}
_NON_COMPANY_NAMES = {"", UNKNOWN_KEY, "(미분류)", "미분류", "불명", "기타", "일반"}


def load_user_map(conn: sqlite3.Connection) -> dict[str, str]:
    try:
        return {
            r["user_id"]: (r["name"] or r["real_name"] or r["user_id"])
            for r in conn.execute("SELECT user_id, name, real_name FROM slack_users")
        }
    except sqlite3.Error:
        return {}


def apply_user_names(text: str, usermap: dict[str, str]) -> str:
    """<@U..> 멘션을 @이름으로 치환 (매핑 없으면 원형 유지)."""
    if not text:
        return text
    return _MENTION_RE.sub(lambda m: "@" + usermap.get(m.group(1), m.group(1)), text)


def _email_domain(email: str) -> str:
    email = (email or "").strip().lower()
    if "@" not in email:
        return ""
    domain = email.rsplit("@", 1)[-1].strip().strip(".")
    if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", domain):
        return ""
    return domain


def _is_business_email_domain(domain: str) -> bool:
    domain = (domain or "").strip().lower()
    if not domain or domain in _FREE_EMAIL_DOMAINS:
        return False
    parts = [p for p in domain.split(".") if p]
    if len(parts) < 2:
        return False
    return not any(p in {"mail", "email", "smtp", "mx"} for p in parts[:1])


def _domain_label(domain: str) -> str:
    parts = [p for p in (domain or "").split(".") if p]
    if len(parts) >= 3 and parts[-2] in {"co", "or", "go", "ac", "ne", "re"}:
        return parts[-3]
    return parts[0] if parts else ""


def is_non_company_name(name: str) -> bool:
    n = (name or "").strip()
    if not n:
        return True
    folded = re.sub(r"\s+", "", n).lower()
    if n in _NON_COMPANY_NAMES or folded in {"개인", "없음", "무", "미정", "모름", "테스트", "test", "asdf", "aaa", "ggg", "ss", "000", "123"}:
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


def personal_company_name(email: str, name: str = "") -> str:
    label = (name or "").strip()
    if is_non_company_name(label):
        label = (email or "").strip().lower()
    return f"개인:{label}" if label else "개인:미상"


def _company_domain_suggestion(
    conn: sqlite3.Connection,
    email: str,
    *,
    include_derived: bool = True,
) -> dict | None:
    domain = _email_domain(email)
    if not _is_business_email_domain(domain):
        return None

    rows = conn.execute(
        """
        SELECT co.id, co.canonical_key, co.display_name, COUNT(*) AS n
        FROM contacts ct
        JOIN companies co ON co.id = ct.company_id
        WHERE lower(substr(ct.email, instr(ct.email, '@') + 1)) = ?
          AND COALESCE(co.display_name, '') NOT LIKE '개인:%'
          AND COALESCE(co.display_name, '') NOT IN (?, ?, ?, ?, ?, ?, ?)
        GROUP BY co.id, co.canonical_key, co.display_name
        ORDER BY n DESC, co.display_name ASC
        LIMIT 5
        """,
        (domain, "", UNKNOWN_KEY, "(미분류)", "미분류", "불명", "기타", "일반"),
    ).fetchall()
    candidates = [
        {
            "company_id": r["id"],
            "company_key": r["canonical_key"],
            "company_name": r["display_name"],
            "count": r["n"],
        }
        for r in rows
    ]
    if candidates:
        total = sum(c["count"] for c in candidates) or 1
        top = candidates[0]
        confidence = top["count"] / total
        if len(candidates) == 1:
            confidence = max(confidence, 0.82)
        return {
            "domain": domain,
            "company_id": top["company_id"],
            "company_key": top["company_key"],
            "company_name": top["company_name"],
            "confidence": round(min(0.97, confidence), 2),
            "reason": f"업무용 이메일 도메인 @{domain}의 기존 연락처 매칭",
            "candidates": candidates,
            "derived": False,
        }

    if not include_derived:
        return None
    label = _domain_label(domain)
    if not label:
        return None
    return {
        "domain": domain,
        "company_id": None,
        "company_key": _norm_company_key(label),
        "company_name": label,
        "confidence": 0.35,
        "reason": f"업무용 이메일 도메인 @{domain}에서 회사명 후보 추정",
        "candidates": [],
        "derived": True,
    }


def slack_permalink(channel_id: str, message_ts: str, raw_payload: str | None) -> str:
    """Return a link to the original Slack message.

    Prefers a permalink already captured in the raw payload; otherwise builds
    the canonical archive URL: <workspace>/archives/<channel>/p<ts-no-dot>.
    """
    if raw_payload:
        try:
            data = json.loads(raw_payload)
            for key in ("permalink", "permalink_public"):
                if isinstance(data, dict) and data.get(key):
                    return str(data[key])
        except (ValueError, TypeError):
            pass
    if not channel_id or not message_ts:
        return ""
    base = get_settings().slack_workspace_url
    ts_compact = message_ts.replace(".", "")
    return f"{base}/archives/{channel_id}/p{ts_compact}"


# Two collection channels, each with its own strategy:
#   - inbound   : #sales-inbound — 릴레잇/피트페이퍼 훅 → 신규 리드 파싱
#   - cross_team: #tf_cross_team_sales — 미팅 일지/액션 템플릿 → 활동/회사정보 파싱
#   - business_card: #sales-명함 — 명함 이미지 OCR(GLM-V) → 연락처/회사 업데이트
DEFAULT_CHANNELS = [
    {"id": "C07RMMQC8GP", "name": "sales-inbound", "strategy": "inbound", "enabled": True},
    {"id": "C01L5SA4Y4C", "name": "tf_cross_team_sales", "strategy": "cross_team", "enabled": True},
    {"id": "C0BGZKBLC4U", "name": "sales-명함", "strategy": "business_card", "enabled": True},
]


def is_business_card_channel(channel_id: str) -> bool:
    """명함 OCR이 허용된 단 하나의 Slack 채널인지 확인한다."""
    allowed = get_settings().business_card_channel_id
    return bool(allowed and str(channel_id) == allowed)

DEFAULT_SYNC_SETTINGS: dict[str, Any] = {
    "channels": DEFAULT_CHANNELS,
    "lookback_hours": 24,
    "sync_limit": 0,  # 0 = 증분(시간 기준); N>0 = 채널별 최근 N개 메시지만
    "include_relate": True,  # inbound: 릴레잇(홈페이지) 리드
    "include_featpaper": True,  # inbound: 피트페이퍼 열람/폼
    "require_review_for_new_company": False,  # 새 회사는 검수 큐로
    "glm_parse_cross_team": True,  # 결정적 파싱이 회사 못 찾으면 GLM으로 추출(적극 사용)
    "slack_callback_enabled": False,  # legacy: callback_mode가 없으면 사용
    "slack_callback_mode": "off",  # off | reaction | thread
    "slack_callback_reaction": "database",
    "auto_sync_enabled": False,
    "auto_sync_interval_minutes": 30,
    "business_card_batch_size": 10,  # 자동 실행 1회당 순차 OCR 최대 이미지 수
    "channel_state": {},  # {channel_id: last_synced_ts}
}


def _ensure_settings_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings "
        "(key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )


def get_sync_settings(conn: sqlite3.Connection) -> dict[str, Any]:
    _ensure_settings_table(conn)
    row = conn.execute(
        "SELECT value FROM app_settings WHERE key = 'sync_rules'"
    ).fetchone()
    settings = {
        **DEFAULT_SYNC_SETTINGS,
        "channels": [dict(ch) for ch in DEFAULT_CHANNELS],
        "channel_state": {},
    }
    if row is not None:
        try:
            settings.update(json.loads(row["value"]))
        except (ValueError, TypeError):
            pass
    if not isinstance(settings.get("channels"), list):
        settings["channels"] = [dict(ch) for ch in DEFAULT_CHANNELS]
    by_id = {str(ch.get("id")): ch for ch in settings.get("channels", []) if isinstance(ch, dict)}
    for default_ch in DEFAULT_CHANNELS:
        if default_ch["id"] not in by_id:
            settings.setdefault("channels", []).append(default_ch)
    return settings


def save_sync_settings(conn: sqlite3.Connection, patch: dict[str, Any]) -> dict[str, Any]:
    current = get_sync_settings(conn)
    # only keep known keys, coerce types from the defaults
    for key, value in patch.items():
        if key not in DEFAULT_SYNC_SETTINGS or value is None:
            continue
        default = DEFAULT_SYNC_SETTINGS[key]
        if isinstance(default, bool):
            current[key] = bool(value)
        elif isinstance(default, (list, dict)):
            current[key] = value  # channels / channel_state passthrough
        elif isinstance(default, int):
            current[key] = int(value)
        elif isinstance(default, float):
            current[key] = float(value)
        else:
            current[key] = str(value)
    conn.execute(
        "INSERT INTO app_settings(key, value) VALUES('sync_rules', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (json.dumps(current, ensure_ascii=False),),
    )
    return current


def _normalize_card_ocr(ocr: object) -> dict | None:
    """저장된 명함 OCR JSON을 프런트가 쓰기 좋은 단일 형태로 정규화.

    두 가지 저장 형태를 모두 흡수한다:
      1) ocr_message_cards 저장분: {"ok":.., "provider":.., "fields":{...}}
      2) 수집 반영 저장분: 최상위에 company/name/email/mobile/phone/... 가 바로 존재
    항상 {ok, provider, confidence, evidence, rotation, fields:{...}} 로 반환한다.
    """
    if not isinstance(ocr, dict):
        return None
    raw = ocr.get("fields") if isinstance(ocr.get("fields"), dict) else ocr
    fields = {
        "company": str(raw.get("company") or "").strip(),
        "name": str(raw.get("name") or "").strip(),
        "email": str(raw.get("email") or "").strip(),
        "department": str(raw.get("department") or "").strip(),
        "title": str(raw.get("title") or "").strip(),
        "phone": str(raw.get("phone") or raw.get("mobile") or "").strip(),
    }
    if not any(fields.values()):
        return None
    return {
        "ok": bool(ocr.get("ok", True)),
        "provider": str(ocr.get("provider") or ocr.get("_provider") or ""),
        "confidence": float(ocr.get("confidence") or 0),
        "evidence": str(ocr.get("evidence") or ""),
        "rotation": int(ocr.get("rotation") or ocr.get("_rotation") or 0),
        "fields": fields,
    }


def slack_messages(conn: sqlite3.Connection, limit: int = 300, q: str = "") -> list[dict]:
    """모든 수집 원문(부모 메시지)을 최신순으로 반환 — 파싱 성공 여부와 무관하게 출력.

    스레드 댓글은 부모 payload의 thread_replies에서 꺼내 comments로 붙인다.
    (댓글 자체 row는 is_reply 표시로 최상위 목록에서 제외)
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    usermap = load_user_map(conn)
    # 저장된 명함 OCR 결과(ocr_json)까지 함께 로드해 프런트가 재파싱 없이 프리필할 수 있게 한다.
    card_states: dict[tuple[str, str, str], tuple[str, bool, dict | None]] = {}
    for x in conn.execute(
        "SELECT channel_id, message_ts, file_id, status, archived, ocr_json FROM slack_card_items"
    ).fetchall():
        try:
            ocr = json.loads(x["ocr_json"]) if x["ocr_json"] else None
        except (ValueError, TypeError):
            ocr = None
        card_states[(str(x["channel_id"]), str(x["message_ts"]), str(x["file_id"]))] = (
            str(x["status"]), bool(x["archived"]), ocr
        )
    rows = [dict(r) for r in conn.execute(
        """
        SELECT channel_id, message_ts, user_id, text, raw_payload, thread_ts,
               applied, applied_kind, archived
        FROM slack_raw_messages
        ORDER BY CAST(message_ts AS REAL) DESC
        LIMIT 3000
        """
    ).fetchall()]
    for r in rows:
        try:
            r["_payload"] = json.loads(r["raw_payload"] or "{}")
        except (ValueError, TypeError):
            r["_payload"] = {}

    # 수집 당시 알 수 있는 스레드 관계(thread_ts)로 댓글을 부모에 연결
    def is_reply(r: dict) -> bool:
        tt = r.get("thread_ts") or ""
        return bool(r["_payload"].get("is_reply")) or (tt and tt != r["message_ts"])

    replies_by_parent: dict[str, list] = {}
    for r in rows:
        if is_reply(r):
            replies_by_parent.setdefault(r.get("thread_ts") or "", []).append(r)

    ql = q.strip().lower()
    out = []
    for r in rows:
        if is_reply(r):
            continue
        text = r["text"] or ""
        payload = r["_payload"]
        files = []
        for f in payload.get("files", []) or []:
            if not isinstance(f, dict):
                continue
            card_state = card_states.get(
                (str(r["channel_id"]), str(r["message_ts"]), str(f.get("id") or "")),
                ("applied" if r.get("applied") else "pending", False, None),
            )
            ocr = _normalize_card_ocr(card_state[2] if len(card_state) > 2 else None)
            files.append({
                "id": str(f.get("id") or ""),
                "name": str(f.get("name") or f.get("title") or ""),
                "title": str(f.get("title") or f.get("name") or ""),
                "mimetype": str(f.get("mimetype") or ""),
                "filetype": str(f.get("filetype") or ""),
                "pretty_type": str(f.get("pretty_type") or ""),
                "size": int(f.get("size") or 0),
                "card_status": card_state[0],
                "card_archived": card_state[1],
                # 이전에 파싱해 저장한 OCR 결과(있으면, 정규화됨). 프런트에서 즉시 프리필용.
                "card_ocr": ocr,
            })
        file_text = " ".join(f"{f['name']} {f['title']} {f['mimetype']} {f['filetype']}" for f in files)
        if ql and ql not in (text + " " + file_text).lower():
            continue
        # 댓글: 부모 payload의 thread_replies + thread_ts로 연결된 별도 row 병합(중복 제거)
        comments: dict[str, dict] = {}
        for rep in payload.get("thread_replies", []) or []:
            if rep.get("text"):
                comments[str(rep.get("ts", ""))] = {
                    "text": apply_user_names(rep.get("text", ""), usermap),
                    "permalink": rep.get("permalink", ""),
                    "user": usermap.get(rep.get("user", ""), rep.get("user", "")),
                }
        for rep in replies_by_parent.get(r["message_ts"], []):
            comments[rep["message_ts"]] = {
                "text": apply_user_names(rep["text"] or "", usermap),
                "permalink": rep["_payload"].get("permalink", ""),
                "user": usermap.get(rep["user_id"], rep["user_id"]),
            }
        try:
            dt = datetime.fromtimestamp(float(r["message_ts"]), tz=ZoneInfo("Asia/Seoul"))
            when = dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, TypeError, OSError):
            when = r["message_ts"]
        out.append({
            "channel_id": r["channel_id"],
            "ts": r["message_ts"],
            "when": when,
            "user": usermap.get(r["user_id"], r["user_id"]),
            "text": apply_user_names(text, usermap),
            "permalink": payload.get("permalink", ""),
            "files": files,
            "is_business_card_channel": is_business_card_channel(r["channel_id"]),
            "comments": sorted(comments.values(), key=lambda c: c.get("text", "")),
            "applied": bool(r.get("applied")),
            "applied_kind": r.get("applied_kind") or "",
            "archived": bool(r.get("archived")),
        })
        if len(out) >= limit:
            break
    return out


def set_raw_archived(conn: sqlite3.Connection, channel_id: str, ts: str, archived: bool) -> None:
    conn.execute(
        "UPDATE slack_raw_messages SET archived=? WHERE channel_id=? AND message_ts=?",
        (1 if archived else 0, channel_id, str(ts)),
    )


def summary(conn: sqlite3.Connection) -> dict[str, int]:
    def scalar(sql: str) -> int:
        return int(conn.execute(sql).fetchone()[0])

    return {
        "companies": scalar("SELECT COUNT(*) FROM companies"),
        "contacts": scalar("SELECT COUNT(*) FROM contacts"),
        "activities": scalar("SELECT COUNT(*) FROM activities"),
        "pending_reviews": scalar(
            "SELECT COUNT(*) FROM consistency_reviews WHERE status='pending'"
        ),
    }


def customers(conn: sqlite3.Connection) -> dict[str, Any]:
    """Return every contact plus a companies profile map.

    We fetch the full set (the frontend paginates client-side, exactly like the
    original HTML which held ``BASE`` in memory).
    """
    rows = conn.execute(
        """
        SELECT
          ct.id            AS contact_id,
          ct.email         AS e,
          ct.name          AS n,
          COALESCE(co.display_name, '') AS c,
          ct.department    AS d,
          ct.title         AS t,
          ct.phone         AS p,
          ct.status        AS st,
          ct.is_subscribed AS sub,
          ct.first_seen    AS f,
          ct.last_seen     AS l,
          ct.activity_count AS a,
          ct.inquiry_summary AS q,
          COALESCE(co.canonical_key, '') AS ckey
        FROM contacts ct
        LEFT JOIN companies co ON ct.company_id = co.id
        """
    ).fetchall()

    # interests per contact
    interests: dict[int, list[str]] = {}
    for cid, name in conn.execute(
        """
        SELECT ci.contact_id, s.name
        FROM contact_interests ci
        JOIN solutions s ON ci.solution_id = s.id
        """
    ):
        interests.setdefault(cid, []).append(name)

    # sources (labels) per contact
    sources: dict[int, list[str]] = {}
    for cid, label in conn.execute(
        """
        SELECT cs.contact_id, src.label
        FROM contact_sources cs
        JOIN sources src ON cs.source_id = src.id
        """
    ):
        bucket = sources.setdefault(cid, [])
        if label not in bucket:
            bucket.append(label)

    # free-form tags per contact
    tags: dict[int, list[str]] = {}
    for cid, tag in conn.execute("SELECT contact_id, tag FROM contact_tags"):
        tags.setdefault(cid, []).append(tag)

    # NEW: collected within the last 24h (only slack-synced rows set collected_at)
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    cutoff = (datetime.now(ZoneInfo("Asia/Seoul")) - timedelta(days=1)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    new_contacts: set[int] = set()
    new_company_ids: set[int] = set()
    for cid, coid in conn.execute(
        "SELECT contact_id, company_id FROM activities "
        "WHERE collected_at <> '' AND collected_at >= ?",
        (cutoff,),
    ):
        if cid is not None:
            new_contacts.add(cid)
        if coid is not None:
            new_company_ids.add(coid)
    new_company_keys = set()
    if new_company_ids:
        placeholders = ",".join("?" * len(new_company_ids))
        for (ck,) in conn.execute(
            f"SELECT canonical_key FROM companies WHERE id IN ({placeholders})",
            list(new_company_ids),
        ):
            new_company_keys.add(ck)

    items = []
    for r in rows:
        cid = r["contact_id"]
        items.append(
            {
                "e": r["e"],
                "n": r["n"],
                "c": r["c"],
                "d": r["d"],
                "t": r["t"],
                "p": r["p"],
                "i": interests.get(cid, []),
                "s": sources.get(cid, []),
                "tags": tags.get(cid, []),
                "st": r["st"],
                "sub": r["sub"],
                "f": r["f"],
                "l": r["l"],
                "a": r["a"],
                "q": r["q"],
                "ckey": r["ckey"] or "",
                "isNew": cid in new_contacts,
            }
        )

    # 회사별 활동 수/최근활동 (담당자 없이 회사 단위로만 쌓인 활동도 표시하기 위해)
    act_by_company: dict[int, tuple[int, str]] = {}
    for cid, n, last in conn.execute(
        "SELECT company_id, COUNT(*), MAX(occurred_at) FROM activities "
        "WHERE company_id IS NOT NULL GROUP BY company_id"
    ):
        act_by_company[cid] = (n, last or "")
    contact_count_by_company: dict[int, int] = {}
    for coid, n in conn.execute(
        "SELECT company_id, COUNT(*) FROM contacts WHERE company_id IS NOT NULL GROUP BY company_id"
    ):
        contact_count_by_company[coid] = n

    companies = {}
    for co in conn.execute(
        """
        SELECT id, canonical_key, display_name, industry, sub_industry,
               description, owner, memo, profile_source, needs_review
        FROM companies
        """
    ):
        act_n, act_last = act_by_company.get(co["id"], (0, ""))
        companies[co["canonical_key"]] = {
            "key": co["canonical_key"],
            "name": co["display_name"],
            "ind": co["industry"],
            "sub": co["sub_industry"],
            "desc": co["description"],
            "owner": co["owner"],
            "memo": co["memo"],
            "auto": co["profile_source"] == "frontend_auto_cinfo"
            and bool(co["industry"] or co["description"]),
            "new": co["canonical_key"] in new_company_keys,
            "act_count": act_n,
            "act_last": act_last,
            "contact_count": contact_count_by_company.get(co["id"], 0),
        }

    return {"items": items, "companies": companies}


def activities(conn: sqlite3.Connection) -> list[dict]:
    """Sales-history events in the old ``evts`` shape plus type/next/link/comments."""
    rows = conn.execute(
        """
        SELECT a.id, a.occurred_at, a.source_type, a.activity_type, a.next_action,
               a.email_snapshot, a.name_snapshot, a.company_snapshot,
               a.solution_name, a.inquiry_text, a.raw_payload,
               COALESCE(co.canonical_key, '') AS cokey
        FROM activities a
        LEFT JOIN companies co ON a.company_id = co.id
        ORDER BY a.occurred_at DESC
        """
    ).fetchall()
    usermap = load_user_map(conn)
    out = []
    for r in rows:
        link = ""
        comments: list = []
        try:
            payload = json.loads(r["raw_payload"] or "{}")
            if isinstance(payload, dict):
                link = payload.get("permalink", "") or ""
                comments = payload.get("comments", []) or []
        except (ValueError, TypeError):
            pass
        out.append(
            {
                "id": r["id"],
                "dt": r["occurred_at"],
                "src": r["source_type"],
                "atype": r["activity_type"],
                "next": r["next_action"],
                "em": r["email_snapshot"],
                "nm": r["name_snapshot"],
                "co": r["company_snapshot"],
                "cokey": r["cokey"],
                "it": r["solution_name"],
                "iq": apply_user_names(r["inquiry_text"], usermap),
                "link": link,
                "comments": comments,
            }
        )
    return out


def set_contact_tags(conn: sqlite3.Connection, email: str, tags: list[str]) -> dict:
    row = conn.execute(
        "SELECT id FROM contacts WHERE email = ?", (email.lower(),)
    ).fetchone()
    if row is None:
        raise KeyError(email)
    cid = row["id"]
    conn.execute("DELETE FROM contact_tags WHERE contact_id = ?", (cid,))
    clean = sorted({t.strip() for t in tags if t and t.strip()})
    for tag in clean:
        conn.execute(
            "INSERT OR IGNORE INTO contact_tags(contact_id, tag) VALUES (?, ?)",
            (cid, tag),
        )
    return {"contact_id": cid, "tags": clean}


def log_activity(conn: sqlite3.Connection, payload: dict) -> dict:
    """Append a sales-history touch to an existing contact and/or company.

    Unlike a new lead, this never creates a contact — it records an ongoing
    interaction (visit / call / quote / demo / follow-up) against the existing
    company→department→contact hierarchy.
    """
    email = (payload.get("email") or "").strip().lower()
    company_key = (payload.get("company_key") or "").strip()
    contact_id = None
    company_id = None
    email_snap = name_snap = company_snap = ""

    if email:
        row = conn.execute(
            "SELECT id, name, company_id FROM contacts WHERE email = ?", (email,)
        ).fetchone()
        if row is None:
            raise KeyError(email)
        contact_id = row["id"]
        company_id = row["company_id"]
        email_snap, name_snap = email, row["name"]
    if company_key and company_id is None:
        co = conn.execute(
            "SELECT id FROM companies WHERE canonical_key = ?", (company_key,)
        ).fetchone()
        if co is not None:
            company_id = co["id"]
    if company_id is not None:
        co = conn.execute(
            "SELECT display_name FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
        company_snap = co["display_name"] if co else ""

    occurred_at = payload.get("occurred_at") or ""
    conn.execute(
        """
        INSERT INTO activities
          (occurred_at, source_type, activity_type, next_action, contact_id,
           company_id, email_snapshot, name_snapshot, company_snapshot,
           solution_name, inquiry_text, collected_at, raw_payload, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0)
        """,
        (
            occurred_at,
            payload.get("source_type", "manual"),
            payload.get("activity_type", ""),
            payload.get("next_action", ""),
            contact_id,
            company_id,
            email_snap,
            name_snap,
            company_snap,
            payload.get("solution_name", ""),
            payload.get("note", ""),
            payload.get("collected_at", ""),
            json.dumps(payload, ensure_ascii=False),
        ),
    )
    if contact_id is not None:
        conn.execute(
            "UPDATE contacts SET activity_count = activity_count + 1, "
            "last_seen = MAX(last_seen, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (occurred_at[:10], contact_id),
        )
    return {"contact_id": contact_id, "company_id": company_id}


def reviews(conn: sqlite3.Connection, status: str) -> list[dict]:
    """Pending (or other status) reviews enriched with the raw collected
    source and the GLM interpretation so the user can compare them side by side
    before registering a new record or linking to an existing company.
    """
    rows = conn.execute(
        """
        SELECT id, review_type, entity_type, entity_id, field_name,
               current_value, proposed_value, evidence, confidence,
               status, requested_at, resolved_at, source_table, source_id
        FROM consistency_reviews
        WHERE status = ?
        ORDER BY confidence ASC, requested_at ASC
        LIMIT 1000
        """,
        (status,),
    ).fetchall()

    result = []
    for r in rows:
        item = dict(r)
        item["raw_source"] = None
        item["interpretation"] = None

        # Enrich glm-sourced reviews with raw text + structured interpretation.
        if r["source_table"] == "glm_extractions" and r["source_id"] is not None:
            ext = conn.execute(
                """
                SELECT ge.extraction_type, ge.extracted_payload, ge.confidence,
                       rm.text AS raw_text, rm.channel_id, rm.message_ts,
                       rm.user_id, rm.raw_payload
                FROM glm_extractions ge
                LEFT JOIN slack_raw_messages rm ON ge.raw_message_id = rm.id
                WHERE ge.id = ?
                """,
                (r["source_id"],),
            ).fetchone()
            if ext is not None:
                item["raw_source"] = {
                    "text": ext["raw_text"] or "",
                    "channel_id": ext["channel_id"] or "",
                    "message_ts": ext["message_ts"] or "",
                    "user_id": ext["user_id"] or "",
                    "permalink": slack_permalink(
                        ext["channel_id"] or "",
                        ext["message_ts"] or "",
                        ext["raw_payload"],
                    ),
                }
                try:
                    payload = json.loads(ext["extracted_payload"] or "{}")
                except (ValueError, TypeError):
                    payload = {"_raw": ext["extracted_payload"]}
                item["interpretation"] = {
                    "kind": ext["extraction_type"],
                    "confidence": ext["confidence"],
                    "payload": payload,
                }

        # Contact context (email/name) so the panel is readable even for the
        # legacy missing-field reviews that have no glm source.
        if r["entity_type"] == "contact" and r["entity_id"] is not None:
            ctx = conn.execute(
                """
                SELECT ct.email, ct.name, ct.company_id,
                       COALESCE(co.display_name,'') AS company
                FROM contacts ct LEFT JOIN companies co ON ct.company_id = co.id
                WHERE ct.id = ?
                """,
                (r["entity_id"],),
            ).fetchone()
            if ctx is not None:
                context = dict(ctx)
                suggestion = _company_domain_suggestion(conn, context.get("email") or "")
                if suggestion is not None:
                    context["domain_suggestion"] = suggestion
                item["entity_context"] = context
        result.append(item)
    return result


def search_by_filters(conn: sqlite3.Connection, filters: dict) -> dict:
    """Apply structured filters (from GLM or fallback) over the customer set.

    Returns matching contact emails + a short human-readable summary so the
    frontend can scope the table to the result.
    """
    data = customers(conn)
    companies = data["companies"]
    lc = lambda xs: [str(x).lower() for x in xs or []]  # noqa: E731
    industries = lc(filters.get("industries"))
    interests = lc(filters.get("interests"))
    sources = lc(filters.get("sources"))
    statuses = lc(filters.get("statuses"))
    owners = lc(filters.get("owners"))
    keywords = lc(filters.get("keywords"))
    min_acts = int(filters.get("min_activities") or 0)

    emails = []
    for r in data["items"]:
        co = companies.get(r["ckey"], {})
        ind = str(co.get("ind", "")).lower()
        owner = str(co.get("owner", "")).lower()
        if industries and not any(x in ind for x in industries):
            continue
        if interests and not any(any(x in i.lower() for i in r["i"]) for x in interests):
            continue
        if sources and not any(any(x in s.lower() for s in r["s"]) for x in sources):
            continue
        if statuses and r["st"].lower() not in statuses:
            continue
        if owners and not any(x in owner for x in owners):
            continue
        if r["a"] < min_acts:
            continue
        if keywords:
            hay = " ".join([
                r["e"], r["n"], r["c"], r["q"], " ".join(r["s"]),
                " ".join(r.get("tags", [])), ind, str(co.get("desc", "")),
            ]).lower()
            if not all(x in hay for x in keywords):
                continue
        emails.append(r["e"])
    return {"emails": emails, "count": len(emails)}


def _dup_fingerprint(name: str) -> str:
    """Aggressive normalization for near-duplicate grouping.

    Lowercase, drop legal/spacing noise, romanize a few common Korean↔English
    tech words, and keep only alnum so '삼성전자(통합)' and '삼성전자' or
    'CTR Robotics' and 'CTR 로보틱스' land together.
    """
    n = (name or "").lower()
    n = re.sub(r"\(주\)|㈜|주식회사|\(株\)|co\.?,?\s*ltd\.?|inc\.?|corp\.?|ltd\.?", "", n)
    repl = {
        "로보틱스": "robotics", "로보틱": "robot", "테크놀로지": "technology",
        "테크놀러지": "technology", "테크": "tech", "시스템즈": "systems",
        "시스템": "system", "솔루션즈": "solutions", "솔루션": "solution",
        "일렉트로닉스": "electronics", "일렉트릭": "electric", "코리아": "korea",
        "글로벌": "global", "인터내셔널": "international", "컴퍼니": "company",
        "그룹": "group", "홀딩스": "holdings", "인더스트리": "industry",
    }
    for k, v in repl.items():
        n = n.replace(k, v)
    n = re.sub(r"\([^)]*\)", "", n)  # drop parentheticals
    n = re.sub(r"[^0-9a-z가-힣]", "", n)
    return n


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a or not b:
        return len(a) + len(b)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _dup_signature(members: list[dict]) -> str:
    return ",".join(sorted(m["canonical_key"] for m in members))


def dismiss_duplicate(conn: sqlite3.Connection, keys: list[str]) -> dict:
    sig = ",".join(sorted(keys))
    conn.execute("INSERT OR IGNORE INTO dup_dismissed(signature) VALUES (?)", (sig,))
    return {"dismissed": sig}


def find_duplicate_companies(conn: sqlite3.Connection, limit: int = 100) -> list[dict]:
    """Group companies whose fingerprints collide or where one name contains
    the other — candidate near-duplicates for merge review. '병합 안 함'으로
    무시된 조합은 제외한다."""
    dismissed = {r[0] for r in conn.execute("SELECT signature FROM dup_dismissed")}
    rows = conn.execute(
        """
        SELECT co.id, co.canonical_key, co.display_name, co.industry,
               COUNT(ct.id) AS contact_count
        FROM companies co LEFT JOIN contacts ct ON ct.company_id = co.id
        GROUP BY co.id
        """
    ).fetchall()
    companies = [dict(r) for r in rows]
    for c in companies:
        c["fp"] = _dup_fingerprint(c["display_name"])

    groups: dict[str, list[dict]] = {}
    for c in companies:
        if c["fp"]:
            groups.setdefault(c["fp"], []).append(c)

    out = []
    seen = set()
    # exact fingerprint collisions
    for fp, members in groups.items():
        if len(members) > 1:
            members.sort(key=lambda m: (-m["contact_count"], m["id"]))
            out.append({"key": fp, "companies": members})
            for m in members:
                seen.add(m["id"])

    # containment (one fingerprint is a prefix/substring of another)
    fps = [(c["fp"], c) for c in companies if c["fp"] and c["id"] not in seen and len(c["fp"]) >= 3]
    for i in range(len(fps)):
        for j in range(len(fps)):
            if i == j:
                continue
            a, ca = fps[i]
            b, cb = fps[j]
            if len(a) >= 4 and a != b and a in b and ca["id"] not in seen and cb["id"] not in seen:
                out.append({"key": a, "companies": sorted(
                    [ca, cb], key=lambda m: (-m["contact_count"], m["id"])
                )})
                seen.add(ca["id"]); seen.add(cb["id"])

    # 편집거리 1 (오타/한 글자 차이) — 짧은 이름은 오검출 방지 위해 len>=5
    near = [(c["fp"], c) for c in companies if c["fp"] and c["id"] not in seen and len(c["fp"]) >= 5]
    for i in range(len(near)):
        for j in range(i + 1, len(near)):
            a, ca = near[i]
            b, cb = near[j]
            if ca["id"] in seen or cb["id"] in seen:
                continue
            if abs(len(a) - len(b)) <= 1 and _levenshtein(a, b) == 1:
                out.append({"key": a, "companies": sorted(
                    [ca, cb], key=lambda m: (-m["contact_count"], m["id"])
                )})
                seen.add(ca["id"]); seen.add(cb["id"])
    out = [g for g in out if _dup_signature(g["companies"]) not in dismissed]
    return out[:limit]


def delete_company(conn: sqlite3.Connection, canonical_key: str) -> dict:
    """회사 삭제. 담당자·활동은 회사 연결만 해제(NULL)하고 데이터는 유지."""
    row = conn.execute("SELECT id, display_name FROM companies WHERE canonical_key=?", (canonical_key,)).fetchone()
    if row is None:
        raise KeyError(canonical_key)
    cid = row["id"]
    c1 = conn.execute("UPDATE contacts SET company_id=NULL WHERE company_id=?", (cid,))
    c2 = conn.execute("UPDATE activities SET company_id=NULL WHERE company_id=?", (cid,))
    conn.execute("DELETE FROM company_aliases WHERE company_id=?", (cid,))
    conn.execute("DELETE FROM companies WHERE id=?", (cid,))
    return {"deleted": canonical_key, "name": row["display_name"],
            "unlinked_contacts": c1.rowcount, "unlinked_activities": c2.rowcount}


def merge_companies(conn: sqlite3.Connection, keep_key: str, merge_keys: list[str]) -> dict:
    """Merge ``merge_keys`` companies into ``keep_key``: reassign contacts and
    activities, register aliases, then delete the merged company rows."""
    keep = conn.execute(
        "SELECT id, display_name FROM companies WHERE canonical_key = ?", (keep_key,)
    ).fetchone()
    if keep is None:
        raise KeyError(keep_key)
    keep_id = keep["id"]
    keep_name = keep["display_name"]
    moved_contacts = moved_activities = 0
    for mk in merge_keys:
        if mk == keep_key:
            continue
        row = conn.execute(
            "SELECT id FROM companies WHERE canonical_key = ?", (mk,)
        ).fetchone()
        if row is None:
            continue
        mid = row["id"]
        cur = conn.execute(
            "UPDATE contacts SET company_id = ? WHERE company_id = ?", (keep_id, mid)
        )
        moved_contacts += cur.rowcount
        # 활동 병합: company_id + company_snapshot(표시명)까지 keep으로 갱신
        cur = conn.execute(
            "UPDATE activities SET company_id = ?, company_snapshot = ? WHERE company_id = ?",
            (keep_id, keep_name, mid),
        )
        moved_activities += cur.rowcount
        conn.execute(
            "INSERT OR IGNORE INTO company_aliases(alias_key, company_id, source) "
            "VALUES (?, ?, 'merge')",
            (mk, keep_id),
        )
        conn.execute("DELETE FROM companies WHERE id = ?", (mid,))
    return {
        "kept": keep_key,
        "merged": merge_keys,
        "moved_contacts": moved_contacts,
        "moved_activities": moved_activities,
    }


def search_companies(conn: sqlite3.Connection, q: str, limit: int = 20) -> list[dict]:
    like = f"%{q.strip()}%"
    rows = conn.execute(
        """
        SELECT co.id, co.canonical_key, co.display_name, co.industry,
               COUNT(ct.id) AS contact_count
        FROM companies co
        LEFT JOIN contacts ct ON ct.company_id = co.id
        WHERE co.display_name LIKE ? OR co.canonical_key LIKE ?
        GROUP BY co.id
        ORDER BY contact_count DESC, co.display_name ASC
        LIMIT ?
        """,
        (like, like, limit),
    ).fetchall()
    return [dict(r) for r in rows]


# ── write paths ────────────────────────────────────────────────────────────

_COMPANY_COLUMNS = {"industry", "sub_industry", "description", "owner", "memo", "display_name"}


def update_company_profile(
    conn: sqlite3.Connection,
    canonical_key: str,
    fields: dict[str, str],
    profile_source: str = "user_edit",
) -> dict:
    row = conn.execute(
        "SELECT id FROM companies WHERE canonical_key = ?", (canonical_key,)
    ).fetchone()
    if row is None:
        raise KeyError(canonical_key)
    updates = {k: v for k, v in fields.items() if k in _COMPANY_COLUMNS and v is not None}
    if not updates:
        return {"updated": 0}
    sets = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(
        f"UPDATE companies SET {sets}, needs_review = 0, "
        f"profile_source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        list(updates.values()) + [profile_source, row["id"]],
    )
    return {"updated": len(updates), "company_id": row["id"]}


_CONTACT_COLUMNS = {"name", "phone", "department", "title", "status"}


def _company_name_by_id(conn: sqlite3.Connection, company_id: int | None) -> str:
    if company_id is None:
        return ""
    row = conn.execute(
        "SELECT display_name FROM companies WHERE id = ?", (company_id,)
    ).fetchone()
    return row["display_name"] if row else ""


def _is_personal_or_unassigned_company(name: str) -> bool:
    n = (name or "").strip()
    return n.startswith("개인:") or n in _NON_COMPANY_NAMES or is_non_company_name(n)


def _set_contact_company(
    conn: sqlite3.Connection,
    contact_id: int,
    company_id: int | None,
    company_name: str,
    *,
    move_activities: bool = True,
) -> None:
    conn.execute(
        "UPDATE contacts SET company_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (company_id, contact_id),
    )
    if move_activities:
        conn.execute(
            """
            UPDATE activities
            SET company_id=?, company_snapshot=?
            WHERE contact_id=?
            """,
            (company_id, company_name if company_id is not None else "", contact_id),
        )


def update_contact(conn: sqlite3.Connection, email: str, fields: dict) -> dict:
    row = conn.execute(
        "SELECT id, company_id FROM contacts WHERE email = ?", (email.lower(),)
    ).fetchone()
    if row is None:
        raise KeyError(email)
    updates = {k: v for k, v in fields.items() if k in _CONTACT_COLUMNS and v is not None}
    if fields.get("company") is not None:
        company = fields["company"].strip()
        if company and is_non_company_name(company):
            company = personal_company_name(email, fields.get("name") or "")
        cid = _upsert_company(conn, company) if company else None
        _set_contact_company(conn, row["id"], cid, company, move_activities=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        conn.execute(
            f"UPDATE contacts SET {sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            list(updates.values()) + [row["id"]],
        )
    return {"contact_id": row["id"], "updated": list(updates) + (["company"] if fields.get("company") is not None else [])}


def delete_contact(conn: sqlite3.Connection, email: str) -> dict:
    row = conn.execute(
        "SELECT id, email, name FROM contacts WHERE email = ?", (email.lower(),)
    ).fetchone()
    if row is None:
        raise KeyError(email)
    activity_count = conn.execute(
        "SELECT COUNT(*) AS n FROM activities WHERE contact_id = ?", (row["id"],)
    ).fetchone()["n"]
    review_count = conn.execute(
        """
        SELECT COUNT(*) AS n FROM consistency_reviews
        WHERE entity_type='contact' AND entity_id=? AND status='pending'
        """,
        (row["id"],),
    ).fetchone()["n"]
    conn.execute(
        """
        UPDATE consistency_reviews
        SET status='rejected',
            resolution_note='contact deleted',
            resolved_at=CURRENT_TIMESTAMP
        WHERE entity_type='contact' AND entity_id=? AND status='pending'
        """,
        (row["id"],),
    )
    conn.execute("DELETE FROM contacts WHERE id = ?", (row["id"],))
    return {
        "contact_id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "detached_activities": activity_count,
        "closed_reviews": review_count,
    }


def company_activities(conn: sqlite3.Connection, canonical_key: str, limit: int = 50) -> list[dict]:
    """특정 회사(예: 미분류)의 활동 목록 (id + 원문) — 개별 재분류용."""
    co = conn.execute("SELECT id FROM companies WHERE canonical_key=?", (canonical_key,)).fetchone()
    if co is None:
        return []
    rows = conn.execute(
        "SELECT id, occurred_at, inquiry_text FROM activities WHERE company_id=? "
        "ORDER BY occurred_at DESC LIMIT ?",
        (co["id"], limit),
    ).fetchall()
    return [{"id": r["id"], "dt": r["occurred_at"], "text": r["inquiry_text"]} for r in rows]


def unclassified_suggestions(conn: sqlite3.Connection, limit: int = 100) -> list[dict]:
    """(미분류) 활동 목록 + 원문에서 기존 회사명 자동 감지 제안(결정적)."""
    co = conn.execute("SELECT id FROM companies WHERE canonical_key=?", (_norm_company_key("(미분류)"),)).fetchone()
    if co is None:
        return []
    # 매칭 후보: 기존 회사 display_name (3자 이상, 미분류 제외) — 긴 이름 우선
    known = [
        (r["display_name"], r["canonical_key"])
        for r in conn.execute(
            "SELECT display_name, canonical_key FROM companies WHERE LENGTH(display_name)>=3"
        )
        if r["display_name"] and "미분류" not in r["display_name"]
    ]
    known.sort(key=lambda x: -len(x[0]))
    rows = conn.execute(
        "SELECT id, occurred_at, inquiry_text FROM activities WHERE company_id=? "
        "ORDER BY occurred_at DESC LIMIT ?",
        (co["id"], limit),
    ).fetchall()
    out = []
    for r in rows:
        text = r["inquiry_text"] or ""
        suggestion = ""
        for name, _key in known:
            if name in text:
                suggestion = name
                break
        out.append({"id": r["id"], "dt": r["occurred_at"], "text": text, "suggestion": suggestion})
    return out


def reassign_activity(conn: sqlite3.Connection, activity_id: int, company: str) -> dict:
    """단일 활동을 지정 회사로 이동 (회사 없으면 생성)."""
    company = (company or "").strip()
    if not company:
        raise ValueError("company required")
    to_id = _upsert_company(conn, company)
    cur = conn.execute("UPDATE activities SET company_id=?, company_snapshot=? WHERE id=?",
                       (to_id, company, activity_id))
    return {"moved": cur.rowcount, "company_id": to_id, "company": company}


def reassign_activities(conn: sqlite3.Connection, from_key: str, to_company: str) -> dict:
    """(미분류) 등 한 회사의 활동을 다른 회사로 재분류(이동)."""
    src = conn.execute("SELECT id FROM companies WHERE canonical_key=?", (from_key,)).fetchone()
    if src is None:
        raise KeyError(from_key)
    to_id = _upsert_company(conn, to_company.strip())
    cur = conn.execute("UPDATE activities SET company_id=? WHERE company_id=?", (to_id, src["id"]))
    conn.execute("UPDATE contacts SET company_id=? WHERE company_id=?", (to_id, src["id"]))
    return {"moved": cur.rowcount, "to_company": to_company.strip()}


def resolve_review(
    conn: sqlite3.Connection,
    review_id: int,
    action: str,
    value: str | None = None,
    fields: dict | None = None,
    company_key: str | None = None,
    company_name: str | None = None,
    company_fields: dict | None = None,
) -> dict:
    review = conn.execute(
        "SELECT * FROM consistency_reviews WHERE id = ?", (review_id,)
    ).fetchone()
    if review is None:
        raise KeyError(review_id)

    if action == "reject":
        _close_review(conn, review_id, "rejected", "")
        return {"action": action}

    if action == "link_existing":
        result = _link_existing_company(conn, review, company_key)
        _close_review(conn, review_id, "approved", "linked", result.get("company_id"))
        return {"action": action, **result}

    if action == "register_new":
        result = _register_new_company(conn, review, company_name, company_fields or {})
        _close_review(conn, review_id, "approved", "registered", result.get("company_id"))
        return {"action": action, **result}

    if action == "apply_fields":
        result = _apply_review_fields(conn, review, fields or {})
        _close_review(conn, review_id, "approved", "fields_applied")
        return {"action": action, **result}

    if action not in {"approve", "edit"}:
        raise ValueError("action must be approve, edit, reject, link_existing, register_new, or apply_fields")

    proposed = value if (action == "edit" and value is not None) else review["proposed_value"]
    _apply_review_value(conn, review, proposed)
    conn.execute(
        "UPDATE consistency_reviews SET status='approved', proposed_value=?, "
        "resolved_at=CURRENT_TIMESTAMP WHERE id=?",
        (proposed, review_id),
    )
    return {"action": action}


def _apply_review_fields(
    conn: sqlite3.Connection, review: sqlite3.Row, fields: dict
) -> dict:
    """Apply multiple basic fields from a review card in one transaction.

    Used by the review queue when the user wants to reflect company/name/title
    etc. directly from the raw/GLM interpretation, then close the review.
    """
    if review["entity_id"] is None:
        raise ValueError("review has no entity to update")
    cleaned = {
        str(k): str(v).strip()
        for k, v in (fields or {}).items()
        if v is not None and str(v).strip() != ""
    }
    if not cleaned:
        raise ValueError("fields required")

    if review["entity_type"] == "contact":
        row = conn.execute(
            "SELECT id FROM contacts WHERE id = ?", (review["entity_id"],)
        ).fetchone()
        if row is None:
            raise ValueError("contact not found")

        contact_updates = {
            k: cleaned[k]
            for k in ("name", "phone", "department", "title", "status")
            if k in cleaned
        }
        if contact_updates:
            sets = ", ".join(f"{k}=?" for k in contact_updates)
            conn.execute(
                f"UPDATE contacts SET {sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                list(contact_updates.values()) + [review["entity_id"]],
            )

        company_id = None
        if cleaned.get("company"):
            company_id = _upsert_company(conn, cleaned["company"])
            _set_contact_company(conn, review["entity_id"], company_id, cleaned["company"], move_activities=True)
        return {
            "updated": sorted(list(contact_updates) + (["company"] if company_id else [])),
            "company_id": company_id,
        }

    if review["entity_type"] == "company":
        row = conn.execute(
            "SELECT id FROM companies WHERE id = ?", (review["entity_id"],)
        ).fetchone()
        if row is None:
            raise ValueError("company not found")
        allowed = {
            "display_name", "name", "industry", "sub_industry",
            "description", "owner", "memo",
        }
        updates = {k: cleaned[k] for k in cleaned if k in allowed}
        if "name" in updates and "display_name" not in updates:
            updates["display_name"] = updates.pop("name")
        if "display_name" in updates:
            updates["canonical_key"] = _norm_company_key(updates["display_name"])
        sets = ", ".join(f"{k}=?" for k in updates)
        conn.execute(
            f"UPDATE companies SET {sets}, needs_review=0, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            list(updates.values()) + [review["entity_id"]],
        )
        return {"updated": sorted(updates)}

    raise ValueError("unsupported review entity type")


def _close_review(
    conn: sqlite3.Connection, review_id: int, status: str, note: str, value: object = None
) -> None:
    if value is not None:
        conn.execute(
            "UPDATE consistency_reviews SET status=?, resolution_note=?, "
            "proposed_value=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?",
            (status, note, str(value), review_id),
        )
    else:
        conn.execute(
            "UPDATE consistency_reviews SET status=?, resolution_note=?, "
            "resolved_at=CURRENT_TIMESTAMP WHERE id=?",
            (status, note, review_id),
        )


def _link_existing_company(
    conn: sqlite3.Connection, review: sqlite3.Row, company_key: str | None
) -> dict:
    if not company_key:
        raise ValueError("company_key required for link_existing")
    co = conn.execute(
        "SELECT id, display_name FROM companies WHERE canonical_key = ?", (company_key,)
    ).fetchone()
    if co is None:
        raise ValueError(f"company not found: {company_key}")
    if review["entity_type"] == "contact" and review["entity_id"] is not None:
        _set_contact_company(conn, review["entity_id"], co["id"], co["display_name"], move_activities=True)
    return {"company_id": co["id"], "company_name": co["display_name"]}


def _register_new_company(
    conn: sqlite3.Connection,
    review: sqlite3.Row,
    company_name: str | None,
    fields: dict,
) -> dict:
    if not company_name or not company_name.strip():
        raise ValueError("company_name required for register_new")
    key = _norm_company_key(company_name)
    existing = conn.execute(
        "SELECT id FROM companies WHERE canonical_key = ?", (key,)
    ).fetchone()
    if existing:
        company_id = existing["id"]
    else:
        cur = conn.execute(
            """
            INSERT INTO companies
              (canonical_key, display_name, industry, sub_industry, description,
               profile_source, needs_review)
            VALUES (?, ?, ?, ?, ?, 'user_register', 0)
            """,
            (
                key,
                company_name.strip(),
                fields.get("industry", ""),
                fields.get("sub_industry", ""),
                fields.get("description", ""),
            ),
        )
        company_id = cur.lastrowid
    if review["entity_type"] == "contact" and review["entity_id"] is not None:
        _set_contact_company(
            conn, review["entity_id"], company_id, company_name.strip(), move_activities=True
        )
    return {"company_id": company_id, "company_name": company_name.strip(), "created": not existing}


def _apply_review_value(conn: sqlite3.Connection, review: sqlite3.Row, value: str) -> None:
    if review["entity_id"] is None or value is None:
        return
    if review["entity_type"] == "contact":
        column = {
            "name": "name",
            "phone": "phone",
            "department": "department",
            "title": "title",
        }.get(review["field_name"])
        table = "contacts"
    elif review["entity_type"] == "company":
        column = {
            "name": "display_name",
            "industry": "industry",
            "sub_industry": "sub_industry",
            "description": "description",
        }.get(review["field_name"])
        table = "companies"
    else:
        return
    if column:
        conn.execute(
            f"UPDATE {table} SET {column}=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (value, review["entity_id"]),
        )


def add_lead(conn: sqlite3.Connection, payload: dict) -> dict:
    """Insert / update a contact from a manual lead and log an activity."""
    return apply_contact_event(
        conn,
        email=payload.get("email", ""),
        name=payload.get("name", ""),
        company=payload.get("company", ""),
        department=payload.get("department", ""),
        title=payload.get("title", ""),
        phone=payload.get("phone", ""),
        interest=payload.get("interest", ""),
        inquiry=_inquiry_line(
            (payload.get("occurred_at") or "")[:10], payload
        ),
        occurred_at=payload.get("occurred_at") or "",
        source_code="manual",
        raw_payload=payload,
    )


def apply_contact_event(
    conn: sqlite3.Connection,
    *,
    email: str,
    name: str = "",
    company: str = "",
    department: str = "",
    title: str = "",
    phone: str = "",
    interest: str = "",
    inquiry: str = "",
    occurred_at: str = "",
    source_code: str = "manual",
    activity_type: str = "",
    next_action: str = "",
    collected_at: str = "",
    raw_payload: dict | None = None,
) -> dict:
    """Upsert a contact and log an activity, mirroring the HTML ``applyEvent``.

    An existing email adds an activity (and fills blank fields); a new email
    creates the contact and company as needed. Used by both manual lead entry
    and the Slack sync pipeline.
    """
    email = (email or "").strip().lower()
    if "@" not in email:
        raise ValueError("valid email required")
    company_name = (company or "").strip()
    domain_suggestion = None
    if is_non_company_name(company_name):
        domain_suggestion = _company_domain_suggestion(
            conn, email, include_derived=False
        )
        if domain_suggestion and domain_suggestion.get("confidence", 0) >= 0.72:
            company_name = domain_suggestion["company_name"]
        else:
            company_name = personal_company_name(email, name)
    company_id = _upsert_company(conn, company_name) if company_name else None
    date_only = occurred_at[:10] if occurred_at else ""

    existing = conn.execute(
        "SELECT id, company_id FROM contacts WHERE email = ?", (email,)
    ).fetchone()

    if existing is None:
        cur = conn.execute(
            """
            INSERT INTO contacts
              (email, name, company_id, department, title, phone, status,
               is_subscribed, first_seen, last_seen, activity_count,
               inquiry_summary, seed_source)
            VALUES (?,?,?,?,?,?,?,0,?,?,1,?,?)
            """,
            (
                email, name, company_id, department, title, _norm_phone(phone),
                _status_of(email, name), date_only, date_only, inquiry,
                f"slack_{source_code}" if source_code != "manual" else "manual",
            ),
        )
        contact_id = cur.lastrowid
        created = True
    else:
        contact_id = existing["id"]
        # fill blank fields, bump counts, extend last_seen — never overwrite.
        conn.execute(
            """
            UPDATE contacts SET
              name = CASE WHEN name='' THEN ? ELSE name END,
              company_id = COALESCE(company_id, ?),
              department = CASE WHEN department='' THEN ? ELSE department END,
              title = CASE WHEN title='' THEN ? ELSE title END,
              phone = CASE WHEN phone='' THEN ? ELSE phone END,
              activity_count = activity_count + 1,
              last_seen = MAX(last_seen, ?),
              inquiry_summary = TRIM(
                CASE WHEN ?<>'' THEN inquiry_summary || CASE WHEN inquiry_summary<>'' THEN ' | ' ELSE '' END || ? ELSE inquiry_summary END
              ),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (name, company_id, department, title, _norm_phone(phone),
             date_only, inquiry, inquiry, contact_id),
        )
        current_company = _company_name_by_id(conn, existing["company_id"])
        if company_id is not None and _is_personal_or_unassigned_company(current_company):
            _set_contact_company(conn, contact_id, company_id, company_name, move_activities=True)
        created = False

    _link_source(conn, contact_id, source_code)
    interest = (interest or "").strip()
    if interest:
        for one in [normalize_interest(i) for i in interest.split(",")]:
            if one:
                _link_interest(conn, contact_id, one)

    conn.execute(
        """
        INSERT INTO activities
          (occurred_at, source_type, activity_type, next_action, contact_id,
           company_id, email_snapshot, name_snapshot, company_snapshot,
           solution_name, inquiry_text, collected_at, raw_payload, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0)
        """,
        (
            occurred_at, source_code, activity_type, next_action, contact_id,
            company_id, email, name, company_name, interest, inquiry,
            collected_at,
            json.dumps(
                {
                    **(raw_payload or {}),
                    **(
                        {"domain_company_suggestion": domain_suggestion}
                        if domain_suggestion and not company
                        else {}
                    ),
                },
                ensure_ascii=False,
            ),
        ),
    )
    return {"contact_id": contact_id, "created": created}


def normalize_interest(value: str) -> str:
    return (
        (value or "")
        .replace(" Brochure", "")
        .replace("2025 ", "")
        .replace("Hubble Engine", "Hubble")
        .strip()
    )


def _norm_phone(phone: str) -> str:
    import re

    digits = re.sub(r"\D", "", phone or "")
    if not digits or re.fullmatch(r"0+", digits):
        return ""
    if len(digits) == 11 and digits.startswith("010"):
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    return phone.strip()


def _status_of(email: str, name: str) -> str:
    email = (email or "").lower()
    if email.endswith("@rtm.ai"):
        return "내부"
    if "테스트" in (name or ""):
        return "테스트"
    return "정상"


def _inquiry_line(date_only: str, payload: dict) -> str:
    tag = (payload.get("tag") or "").strip()
    memo = (payload.get("memo") or "").strip()
    body = " ".join(x for x in [f"[{tag}]" if tag else "", memo] if x).strip()
    if not body:
        return ""
    return f"[{date_only}] {body}" if date_only else body


def _upsert_company(conn: sqlite3.Connection, name: str) -> int:
    key = _norm_company_key(name)
    row = conn.execute(
        "SELECT id FROM companies WHERE canonical_key = ?", (key,)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO companies (canonical_key, display_name, profile_source, "
        "needs_review) VALUES (?, ?, 'manual', 1)",
        (key, name),
    )
    return cur.lastrowid


def _norm_company_key(name: str) -> str:
    import re

    k = (name or "").lower()
    k = re.sub(r"\(주\)|㈜|주식회사", "", k)
    k = re.sub(r"[\s()]", "", k)
    k = re.sub(r"\.(?=.)", "", k)
    return k.strip()


def _link_source(conn: sqlite3.Connection, contact_id: int, code: str) -> None:
    src = conn.execute("SELECT id FROM sources WHERE code = ?", (code,)).fetchone()
    if src is None:
        return
    conn.execute(
        "INSERT OR IGNORE INTO contact_sources (contact_id, source_id) VALUES (?, ?)",
        (contact_id, src["id"]),
    )


def _link_interest(conn: sqlite3.Connection, contact_id: int, name: str) -> None:
    sol = conn.execute("SELECT id FROM solutions WHERE name = ?", (name,)).fetchone()
    if sol is None:
        cur = conn.execute("INSERT INTO solutions (name) VALUES (?)", (name,))
        sol_id = cur.lastrowid
    else:
        sol_id = sol["id"]
    conn.execute(
        "INSERT OR IGNORE INTO contact_interests (contact_id, solution_id, source) "
        "VALUES (?, ?, 'manual')",
        (contact_id, sol_id),
    )
