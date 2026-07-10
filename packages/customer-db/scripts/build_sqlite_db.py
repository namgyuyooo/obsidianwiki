from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SEED = ROOT / "data" / "frontend_seed.json"
DEFAULT_DB = ROOT / "data" / "rtm_customer.db"
SCHEMA = ROOT / "schema.sql"


def main() -> int:
    seed_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_SEED
    db_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else DEFAULT_DB
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    with conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        seed_sources(conn)
        seed_companies(conn, seed)
        seed_contacts(conn, seed)
        seed_events(conn, seed)
        seed_initial_reviews(conn)
    summary = summarize(conn)
    conn.close()
    print(json.dumps({"db": str(db_path), **summary}, ensure_ascii=False, indent=2))
    return 0


def seed_sources(conn: sqlite3.Connection) -> None:
    for code, label in [
        ("relate", "릴레잇(홈페이지)"),
        ("featpaper", "피트페이퍼"),
        ("mailing", "메일링리스트"),
        ("manual", "수기입력"),
        ("kosme_2026_07", "2026.07 KOSME 강의"),
    ]:
        conn.execute("INSERT OR IGNORE INTO sources(code, label) VALUES (?, ?)", (code, label))


def seed_companies(conn: sqlite3.Connection, seed: dict[str, Any]) -> None:
    for key, info in seed.get("auto_company_info", {}).items():
        conn.execute(
            """
            INSERT INTO companies(canonical_key, display_name, industry, sub_industry, description, profile_source, profile_confidence)
            VALUES (?, ?, ?, ?, ?, 'frontend_auto_cinfo', 0.70)
            ON CONFLICT(canonical_key) DO UPDATE SET
              industry=excluded.industry,
              sub_industry=excluded.sub_industry,
              description=excluded.description
            """,
            (key, key, info.get("ind", ""), info.get("sub", ""), info.get("desc", "")),
        )
    for alias, canonical in seed.get("company_aliases", {}).items():
        company_id = ensure_company(conn, canonical, canonical, "frontend_alias")
        conn.execute(
            "INSERT OR IGNORE INTO company_aliases(alias_key, company_id, source) VALUES (?, ?, 'frontend_alias')",
            (alias, company_id),
        )


def seed_contacts(conn: sqlite3.Connection, seed: dict[str, Any]) -> None:
    for record in seed.get("base_contacts", []):
        email = (record.get("e") or "").strip().lower()
        if not email:
            continue
        company_name = record.get("c") or ""
        company_id = ensure_company(conn, norm_company(company_name), company_name, "frontend_base") if company_name else None
        conn.execute(
            """
            INSERT INTO contacts(email, name, company_id, department, title, phone, status, is_subscribed,
              first_seen, last_seen, activity_count, inquiry_summary, seed_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'frontend_base')
            ON CONFLICT(email) DO UPDATE SET
              name=excluded.name,
              company_id=COALESCE(excluded.company_id, contacts.company_id),
              department=excluded.department,
              title=excluded.title,
              phone=excluded.phone,
              status=excluded.status,
              is_subscribed=excluded.is_subscribed,
              first_seen=excluded.first_seen,
              last_seen=excluded.last_seen,
              activity_count=excluded.activity_count,
              inquiry_summary=excluded.inquiry_summary
            """,
            (
                email,
                record.get("n", ""),
                company_id,
                record.get("d", ""),
                record.get("t", ""),
                norm_phone(record.get("p", "")),
                record.get("st", "정상"),
                int(record.get("sub") or 0),
                record.get("f", ""),
                record.get("l", ""),
                int(record.get("a") or 0),
                record.get("q", ""),
            ),
        )
        contact_id = lookup_id(conn, "contacts", "email", email)
        for interest in record.get("i", []):
            attach_interest(conn, contact_id, interest, "frontend_base")
        for source_label in record.get("s", []):
            attach_source(conn, contact_id, source_label)


def seed_events(conn: sqlite3.Connection, seed: dict[str, Any]) -> None:
    for event in seed.get("base_events", []):
        insert_activity(conn, event, confidence=0.85)


def seed_initial_reviews(conn: sqlite3.Connection) -> None:
    for row in conn.execute(
        """
        SELECT contacts.id, contacts.email, contacts.name, contacts.phone, contacts.company_id, companies.display_name AS company
        FROM contacts
        LEFT JOIN companies ON contacts.company_id = companies.id
        WHERE contacts.status = '정상' AND (contacts.company_id IS NULL OR contacts.name = '' OR contacts.phone = '')
        LIMIT 200
        """
    ):
        if row["company_id"] is None:
            add_review(conn, "missing_required", "contact", row["id"], "company_id", "", "", f"{row['email']} 회사명 확인 필요", 0.30)
        if not row["name"]:
            add_review(conn, "missing_required", "contact", row["id"], "name", "", "", f"{row['email']} 이름 확인 필요", 0.30)
        if not row["phone"]:
            add_review(conn, "missing_optional", "contact", row["id"], "phone", "", "", f"{row['email']} 전화번호 확인 필요", 0.20)


def insert_activity(conn: sqlite3.Connection, event: dict[str, Any], confidence: float) -> int:
    email = (event.get("em") or "").strip().lower()
    company_name = event.get("co") or ""
    company_id = ensure_company(conn, norm_company(company_name), company_name, f"event_{event.get('src', 'unknown')}") if company_name else None
    contact_id = lookup_id(conn, "contacts", "email", email) if email else None
    if not contact_id and email:
        conn.execute(
            """
            INSERT INTO contacts(email, name, company_id, department, title, phone, status, first_seen, last_seen, activity_count, inquiry_summary, seed_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'event_seed')
            """,
            (
                email,
                event.get("nm", ""),
                company_id,
                event.get("dept", ""),
                event.get("title", ""),
                norm_phone(event.get("ph", "")),
                status_of(email, event.get("nm", "")),
                (event.get("dt") or "")[:10],
                (event.get("dt") or "")[:10],
                event.get("iq", ""),
            ),
        )
        contact_id = lookup_id(conn, "contacts", "email", email)
    if contact_id and event.get("it"):
        attach_interest(conn, contact_id, event.get("it"), f"event_{event.get('src', 'unknown')}")
    if contact_id:
        attach_source(conn, contact_id, event.get("src", ""))
    cur = conn.execute(
        """
        INSERT INTO activities(occurred_at, source_type, contact_id, company_id, email_snapshot, name_snapshot,
          company_snapshot, solution_name, inquiry_text, raw_payload, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event.get("dt", ""),
            event.get("src", "unknown"),
            contact_id,
            company_id,
            email,
            event.get("nm", ""),
            company_name,
            normalize_interest(event.get("it", "")),
            event.get("iq", ""),
            json.dumps(event, ensure_ascii=False),
            confidence,
        ),
    )
    return int(cur.lastrowid)


def ensure_company(conn: sqlite3.Connection, key: str, display_name: str, source: str) -> int:
    key = key or norm_company(display_name)
    if not key:
        key = "(회사 미상)"
    display_name = display_name or key
    conn.execute(
        """
        INSERT INTO companies(canonical_key, display_name, profile_source, profile_confidence, needs_review)
        VALUES (?, ?, ?, 0.50, ?)
        ON CONFLICT(canonical_key) DO NOTHING
        """,
        (key, display_name, source, 1 if key == "(회사 미상)" else 0),
    )
    return lookup_id(conn, "companies", "canonical_key", key)


def attach_interest(conn: sqlite3.Connection, contact_id: int, interest: str, source: str) -> None:
    interest = normalize_interest(interest)
    if not interest:
        return
    conn.execute("INSERT OR IGNORE INTO solutions(name) VALUES (?)", (interest,))
    solution_id = lookup_id(conn, "solutions", "name", interest)
    conn.execute(
        "INSERT OR IGNORE INTO contact_interests(contact_id, solution_id, source) VALUES (?, ?, ?)",
        (contact_id, solution_id, source),
    )


def attach_source(conn: sqlite3.Connection, contact_id: int, label_or_code: str) -> None:
    if not label_or_code:
        return
    code = source_code(label_or_code)
    label = source_label(label_or_code)
    conn.execute("INSERT OR IGNORE INTO sources(code, label) VALUES (?, ?)", (code, label))
    source_id = lookup_id(conn, "sources", "code", code)
    conn.execute("INSERT OR IGNORE INTO contact_sources(contact_id, source_id) VALUES (?, ?)", (contact_id, source_id))


def add_review(
    conn: sqlite3.Connection,
    review_type: str,
    entity_type: str,
    entity_id: int | None,
    field_name: str,
    current_value: str,
    proposed_value: str,
    evidence: str,
    confidence: float,
    source_table: str = "",
    source_id: int | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO consistency_reviews(review_type, entity_type, entity_id, field_name, current_value,
          proposed_value, evidence, source_table, source_id, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (review_type, entity_type, entity_id, field_name, current_value, proposed_value, evidence, source_table, source_id, confidence),
    )


def summarize(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "companies": scalar(conn, "SELECT COUNT(*) FROM companies"),
        "contacts": scalar(conn, "SELECT COUNT(*) FROM contacts"),
        "activities": scalar(conn, "SELECT COUNT(*) FROM activities"),
        "solutions": scalar(conn, "SELECT COUNT(*) FROM solutions"),
        "pending_reviews": scalar(conn, "SELECT COUNT(*) FROM consistency_reviews WHERE status='pending'"),
    }


def lookup_id(conn: sqlite3.Connection, table: str, key: str, value: str) -> int:
    row = conn.execute(f"SELECT id FROM {table} WHERE {key} = ?", (value,)).fetchone()
    if row is None:
        raise RuntimeError(f"Missing {table}.{key}={value}")
    return int(row["id"])


def scalar(conn: sqlite3.Connection, sql: str) -> int:
    return int(conn.execute(sql).fetchone()[0])


def norm_company(name: str) -> str:
    value = (name or "").lower()
    value = re.sub(r"\(주\)|㈜|주식회사", "", value)
    value = re.sub(r"[\s()]", "", value)
    value = re.sub(r"\.(?=.)", "", value)
    aliases = {"sea": "에스이에이", "에스이에이이": "에스이에이", "s.e.a": "에스이에이", "rtm": "알티엠", "유라": "yura"}
    return aliases.get(value.strip(), value.strip())


def norm_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if not digits or re.fullmatch(r"0+", digits):
        return ""
    if len(digits) == 11 and digits.startswith("010"):
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    return digits


def normalize_interest(value: str) -> str:
    return (value or "").replace(" Brochure", "").replace("2025 ", "").replace("Hubble Engine", "Hubble").strip()


def status_of(email: str, name: str) -> str:
    if email.endswith("@rtm.ai"):
        return "내부"
    if email in {"test@gmail.com", "2@naver.com", "sadsad@asdsa.com", "ㅋ@ㅋ.com"} or "테스트" in (name or ""):
        return "테스트"
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return "테스트"
    return "정상"


def source_code(value: str) -> str:
    if value == "릴레잇(홈페이지)" or value == "relate":
        return "relate"
    if value == "피트페이퍼" or value == "featpaper":
        return "featpaper"
    if value == "메일링리스트":
        return "mailing"
    if value == "manual" or value == "수기입력":
        return "manual"
    return re.sub(r"[^0-9a-zA-Z가-힣_.-]+", "_", value or "unknown").strip("_").lower()


def source_label(value: str) -> str:
    return {"relate": "릴레잇(홈페이지)", "featpaper": "피트페이퍼", "manual": "수기입력"}.get(value, value)


if __name__ == "__main__":
    raise SystemExit(main())
