"""SQL read/write helpers.

The customer records are returned in the compact shape the original
``RTM_고객DB_대시보드.html`` used (``e/n/c/d/t/p/i/s/st/sub/f/l/a/q``) so the
React frontend can reuse the exact grouping / filtering / charting logic that
lived in the HTML. Company profile fields are returned as a separate keyed map,
mirroring the old ``AUTO_CINFO`` / ``userCInfo`` model.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .config import get_settings

UNKNOWN_KEY = "(회사 미상)"


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
DEFAULT_CHANNELS = [
    {"id": "C07RMMQC8GP", "name": "sales-inbound", "strategy": "inbound", "enabled": True},
    {"id": "C01L5SA4Y4C", "name": "tf_cross_team_sales", "strategy": "cross_team", "enabled": True},
]

DEFAULT_SYNC_SETTINGS: dict[str, Any] = {
    "channels": DEFAULT_CHANNELS,
    "lookback_hours": 24,
    "sync_limit": 0,  # 0 = 증분(시간 기준); N>0 = 채널별 최근 N개 메시지만
    "include_relate": True,  # inbound: 릴레잇(홈페이지) 리드
    "include_featpaper": True,  # inbound: 피트페이퍼 열람/폼
    "require_review_for_new_company": False,  # 새 회사는 검수 큐로
    "auto_sync_enabled": False,
    "auto_sync_interval_minutes": 30,
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
    settings = dict(DEFAULT_SYNC_SETTINGS)
    if row is not None:
        try:
            settings.update(json.loads(row["value"]))
        except (ValueError, TypeError):
            pass
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
            }
        )

    companies = {}
    for co in conn.execute(
        """
        SELECT canonical_key, display_name, industry, sub_industry,
               description, owner, memo, profile_source, needs_review
        FROM companies
        """
    ):
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
        }

    return {"items": items, "companies": companies}


def activities(conn: sqlite3.Connection) -> list[dict]:
    """Sales-history events in the old ``evts`` shape plus type/next/link/comments."""
    rows = conn.execute(
        """
        SELECT occurred_at, source_type, activity_type, next_action,
               email_snapshot, name_snapshot, company_snapshot,
               solution_name, inquiry_text, raw_payload
        FROM activities
        ORDER BY occurred_at DESC
        """
    ).fetchall()
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
                "dt": r["occurred_at"],
                "src": r["source_type"],
                "atype": r["activity_type"],
                "next": r["next_action"],
                "em": r["email_snapshot"],
                "nm": r["name_snapshot"],
                "co": r["company_snapshot"],
                "it": r["solution_name"],
                "iq": r["inquiry_text"],
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
           solution_name, inquiry_text, raw_payload, confidence)
        VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0)
        """,
        (
            occurred_at,
            payload.get("activity_type", ""),
            payload.get("next_action", ""),
            contact_id,
            company_id,
            email_snap,
            name_snap,
            company_snap,
            payload.get("solution_name", ""),
            payload.get("note", ""),
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
                item["entity_context"] = dict(ctx)
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

_COMPANY_COLUMNS = {"industry", "sub_industry", "description", "owner", "memo"}


def update_company_profile(
    conn: sqlite3.Connection, canonical_key: str, fields: dict[str, str]
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
    params = list(updates.values()) + [row["id"]]
    conn.execute(
        f"UPDATE companies SET {sets}, needs_review = 0, "
        f"profile_source = 'user_edit', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        params,
    )
    return {"updated": len(updates), "company_id": row["id"]}


def resolve_review(
    conn: sqlite3.Connection,
    review_id: int,
    action: str,
    value: str | None = None,
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

    if action not in {"approve", "edit"}:
        raise ValueError("action must be approve, edit, reject, link_existing, or register_new")

    proposed = value if (action == "edit" and value is not None) else review["proposed_value"]
    _apply_review_value(conn, review, proposed)
    conn.execute(
        "UPDATE consistency_reviews SET status='approved', proposed_value=?, "
        "resolved_at=CURRENT_TIMESTAMP WHERE id=?",
        (proposed, review_id),
    )
    return {"action": action}


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
        conn.execute(
            "UPDATE contacts SET company_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (co["id"], review["entity_id"]),
        )
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
        conn.execute(
            "UPDATE contacts SET company_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (company_id, review["entity_id"]),
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
    company_id = _upsert_company(conn, company_name) if company_name else None
    date_only = occurred_at[:10] if occurred_at else ""

    existing = conn.execute(
        "SELECT id FROM contacts WHERE email = ?", (email,)
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
          (occurred_at, source_type, contact_id, company_id, email_snapshot,
           name_snapshot, company_snapshot, solution_name, inquiry_text,
           raw_payload, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0)
        """,
        (
            occurred_at, source_code, contact_id, company_id, email, name,
            company_name, interest, inquiry,
            json.dumps(raw_payload or {}, ensure_ascii=False),
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
