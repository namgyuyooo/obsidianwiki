from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "rtm_customer.db"


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: import_glm_extractions.py GLM_JSON [DB_PATH]", file=sys.stderr)
        return 2
    payload_path = Path(sys.argv[1]).resolve()
    db_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else DEFAULT_DB
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        messages = payload
    else:
        messages = [payload]

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    counts = {"messages": 0, "extractions": 0, "reviews": 0, "activities": 0}
    with conn:
        for message in messages:
            counts["messages"] += 1
            raw_id = upsert_raw_message(conn, message)
            for extraction in message.get("extractions", []):
                counts["extractions"] += 1
                extraction_id = insert_extraction(conn, raw_id, extraction)
                result = stage_or_apply_extraction(conn, raw_id, extraction_id, message, extraction)
                counts["reviews"] += result["reviews"]
                counts["activities"] += result["activities"]
    conn.close()
    print(json.dumps({"db": str(db_path), **counts}, ensure_ascii=False, indent=2))
    return 0


def upsert_raw_message(conn: sqlite3.Connection, message: dict[str, Any]) -> int:
    channel_id = message.get("channel_id", "")
    message_ts = str(message.get("message_ts", ""))
    conn.execute(
        """
        INSERT OR IGNORE INTO slack_raw_messages(channel_id, message_ts, user_id, text, raw_payload)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            channel_id,
            message_ts,
            message.get("user_id", ""),
            message.get("raw_text", ""),
            json.dumps(message, ensure_ascii=False),
        ),
    )
    row = conn.execute(
        "SELECT id FROM slack_raw_messages WHERE channel_id = ? AND message_ts = ?",
        (channel_id, message_ts),
    ).fetchone()
    return int(row["id"])


def insert_extraction(conn: sqlite3.Connection, raw_id: int, extraction: dict[str, Any]) -> int:
    cur = conn.execute(
        """
        INSERT INTO glm_extractions(raw_message_id, extraction_type, extracted_payload, confidence, status)
        VALUES (?, ?, ?, ?, 'staged')
        """,
        (
            raw_id,
            extraction.get("kind", "lead_event"),
            json.dumps(extraction, ensure_ascii=False),
            float(extraction.get("confidence") or 0),
        ),
    )
    return int(cur.lastrowid)


def stage_or_apply_extraction(
    conn: sqlite3.Connection,
    raw_id: int,
    extraction_id: int,
    message: dict[str, Any],
    extraction: dict[str, Any],
) -> dict[str, int]:
    kind = extraction.get("kind", "ignore")
    confidence = float(extraction.get("confidence") or 0)
    if kind == "ignore":
        conn.execute("UPDATE glm_extractions SET status = 'ignored' WHERE id = ?", (extraction_id,))
        return {"reviews": 0, "activities": 0}

    contact = extraction.get("contact") or {}
    company = extraction.get("company") or {}
    activity = extraction.get("activity") or {}
    evidence = extraction.get("evidence") or message.get("raw_text", "")
    review_required = bool(extraction.get("review_required")) or confidence < 0.85

    email = (contact.get("email") or "").strip().lower()
    company_name = company.get("name") or ""
    contact_id = lookup_contact(conn, email) if email else None
    company_id = lookup_company(conn, norm_company(company_name)) if company_name else None

    reviews = 0
    for entity_type, entity_id, field_values in [
        ("contact", contact_id, contact),
        ("company", company_id, company),
    ]:
        for field, proposed in field_values.items():
            if not proposed or field == "email":
                continue
            current = current_value(conn, entity_type, entity_id, field)
            if review_required or (current and normalize(current) != normalize(str(proposed))):
                add_review(
                    conn,
                    "glm_field_confirmation",
                    entity_type,
                    entity_id,
                    field,
                    current,
                    str(proposed),
                    evidence,
                    confidence,
                    "glm_extractions",
                    extraction_id,
                )
                reviews += 1

    if reviews:
        conn.execute("UPDATE glm_extractions SET status = 'review_pending' WHERE id = ?", (extraction_id,))
        return {"reviews": reviews, "activities": 0}

    company_id = ensure_company(conn, company_name) if company_name else company_id
    contact_id = ensure_contact(conn, email, contact, company_id) if email else contact_id
    activity_id = insert_activity(conn, contact_id, company_id, message, extraction, activity, confidence)
    conn.execute("UPDATE glm_extractions SET status = 'applied' WHERE id = ?", (extraction_id,))
    return {"reviews": 0, "activities": 1 if activity_id else 0}


def ensure_company(conn: sqlite3.Connection, company_name: str) -> int | None:
    if not company_name:
        return None
    key = norm_company(company_name)
    row = conn.execute("SELECT id FROM companies WHERE canonical_key = ?", (key,)).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute(
        """
        INSERT INTO companies(canonical_key, display_name, profile_source, profile_confidence, needs_review)
        VALUES (?, ?, 'slack_glm', 0.60, 1)
        """,
        (key, company_name),
    )
    return int(cur.lastrowid)


def ensure_contact(conn: sqlite3.Connection, email: str, contact: dict[str, Any], company_id: int | None) -> int | None:
    if not email:
        return None
    row = conn.execute("SELECT id FROM contacts WHERE email = ?", (email,)).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute(
        """
        INSERT INTO contacts(email, name, company_id, department, title, phone, status, seed_source)
        VALUES (?, ?, ?, ?, ?, ?, '정상', 'slack_glm')
        """,
        (
            email,
            contact.get("name", ""),
            company_id,
            contact.get("department", ""),
            contact.get("title", ""),
            norm_phone(contact.get("phone", "")),
        ),
    )
    return int(cur.lastrowid)


def insert_activity(
    conn: sqlite3.Connection,
    contact_id: int | None,
    company_id: int | None,
    message: dict[str, Any],
    extraction: dict[str, Any],
    activity: dict[str, Any],
    confidence: float,
) -> int:
    contact = extraction.get("contact") or {}
    company = extraction.get("company") or {}
    cur = conn.execute(
        """
        INSERT INTO activities(occurred_at, source_type, contact_id, company_id, email_snapshot, name_snapshot,
          company_snapshot, solution_name, inquiry_text, raw_payload, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            activity.get("occurred_at") or message.get("collected_at") or "",
            activity.get("source_type") or "slack_glm",
            contact_id,
            company_id,
            contact.get("email", ""),
            contact.get("name", ""),
            company.get("name", ""),
            activity.get("solution_name", ""),
            activity.get("inquiry_text", ""),
            json.dumps({"message": message, "extraction": extraction}, ensure_ascii=False),
            confidence,
        ),
    )
    return int(cur.lastrowid)


def add_review(
    conn: sqlite3.Connection,
    review_type: str,
    entity_type: str,
    entity_id: int | None,
    field_name: str,
    current_value_: str,
    proposed_value: str,
    evidence: str,
    confidence: float,
    source_table: str,
    source_id: int,
) -> None:
    conn.execute(
        """
        INSERT INTO consistency_reviews(review_type, entity_type, entity_id, field_name, current_value,
          proposed_value, evidence, source_table, source_id, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (review_type, entity_type, entity_id, field_name, current_value_, proposed_value, evidence, source_table, source_id, confidence),
    )


def lookup_contact(conn: sqlite3.Connection, email: str) -> int | None:
    row = conn.execute("SELECT id FROM contacts WHERE email = ?", (email,)).fetchone()
    return int(row["id"]) if row else None


def lookup_company(conn: sqlite3.Connection, key: str) -> int | None:
    row = conn.execute("SELECT id FROM companies WHERE canonical_key = ?", (key,)).fetchone()
    return int(row["id"]) if row else None


def current_value(conn: sqlite3.Connection, entity_type: str, entity_id: int | None, field: str) -> str:
    if entity_id is None:
        return ""
    table = {"contact": "contacts", "company": "companies"}.get(entity_type)
    field_map = {
        "name": "name" if entity_type == "contact" else "display_name",
        "phone": "phone",
        "department": "department",
        "title": "title",
        "industry": "industry",
        "sub_industry": "sub_industry",
        "description": "description",
    }
    column = field_map.get(field)
    if not table or not column:
        return ""
    row = conn.execute(f"SELECT {column} AS value FROM {table} WHERE id = ?", (entity_id,)).fetchone()
    return str(row["value"] or "") if row else ""


def norm_company(name: str) -> str:
    value = (name or "").lower()
    value = re.sub(r"\(주\)|㈜|주식회사", "", value)
    value = re.sub(r"[\s()]", "", value)
    value = re.sub(r"\.(?=.)", "", value)
    aliases = {"sea": "에스이에이", "에스이에이이": "에스이에이", "s.e.a": "에스이에이", "rtm": "알티엠", "유라": "yura"}
    return aliases.get(value.strip(), value.strip())


def norm_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 11 and digits.startswith("010"):
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    return digits


def normalize(value: str) -> str:
    return re.sub(r"\s+", "", (value or "").lower())


if __name__ == "__main__":
    raise SystemExit(main())
