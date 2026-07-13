"""SQLite access helpers.

The web API is read-mostly; writes (review resolution, company profile edits,
manual leads) run in short transactions. We open a fresh connection per request
to stay thread-safe under uvicorn's worker model.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import get_settings


_migrated = False

# 감사/되돌리기 대상 테이블과 컬럼 (트리거가 이 컬럼들을 json으로 기록)
AUDIT_SPECS: dict[str, list[str]] = {
    "companies": [
        "id", "canonical_key", "display_name", "industry", "sub_industry",
        "description", "owner", "memo", "profile_source", "profile_confidence",
        "needs_review", "created_at", "updated_at",
    ],
    "contacts": [
        "id", "email", "name", "company_id", "department", "title", "phone",
        "status", "is_subscribed", "first_seen", "last_seen", "activity_count",
        "inquiry_summary", "seed_source", "created_at", "updated_at",
    ],
    "activities": [
        "id", "occurred_at", "source_type", "activity_type", "next_action",
        "contact_id", "company_id", "email_snapshot", "name_snapshot",
        "company_snapshot", "solution_name", "inquiry_text", "collected_at",
        "raw_payload", "confidence", "created_at",
    ],
    "consistency_reviews": [
        "id", "review_type", "entity_type", "entity_id", "field_name",
        "current_value", "proposed_value", "evidence", "source_table",
        "source_id", "confidence", "status", "requested_at", "resolved_at",
        "resolved_by", "resolution_note",
    ],
}


def _create_audit(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS change_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
          table_name TEXT NOT NULL, op TEXT NOT NULL, row_pk INTEGER,
          old_json TEXT, new_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          undone INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_change_batch ON change_log(batch)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS change_batch "
        "(id INTEGER PRIMARY KEY CHECK(id=1), batch TEXT NOT NULL DEFAULT '', "
        "label TEXT NOT NULL DEFAULT '', logging INTEGER NOT NULL DEFAULT 0)"
    )
    conn.execute("INSERT OR IGNORE INTO change_batch(id, batch, label, logging) VALUES (1,'','',0)")
    for table, cols in AUDIT_SPECS.items():
        old_obj = "json_object(" + ",".join(f"'{c}',OLD.{c}" for c in cols) + ")"
        new_obj = "json_object(" + ",".join(f"'{c}',NEW.{c}" for c in cols) + ")"
        conn.execute(
            f"CREATE TRIGGER IF NOT EXISTS trg_{table}_ins AFTER INSERT ON {table} BEGIN "
            f"INSERT INTO change_log(batch,label,table_name,op,row_pk,old_json,new_json) "
            f"SELECT batch,label,'{table}','INSERT',NEW.id,NULL,{new_obj} "
            f"FROM change_batch WHERE logging=1; END;"
        )
        conn.execute(
            f"CREATE TRIGGER IF NOT EXISTS trg_{table}_upd AFTER UPDATE ON {table} BEGIN "
            f"INSERT INTO change_log(batch,label,table_name,op,row_pk,old_json,new_json) "
            f"SELECT batch,label,'{table}','UPDATE',OLD.id,{old_obj},{new_obj} "
            f"FROM change_batch WHERE logging=1; END;"
        )
        conn.execute(
            f"CREATE TRIGGER IF NOT EXISTS trg_{table}_del AFTER DELETE ON {table} BEGIN "
            f"INSERT INTO change_log(batch,label,table_name,op,row_pk,old_json,new_json) "
            f"SELECT batch,label,'{table}','DELETE',OLD.id,{old_obj},NULL "
            f"FROM change_batch WHERE logging=1; END;"
        )


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def _run_migrations(conn: sqlite3.Connection) -> None:
    """Additive, idempotent schema upgrades for the enriched dashboard.

    Safe to run against the DB built by packages/customer-db: only adds
    columns/tables, never drops or rewrites existing data.
    """
    # sources.category — classify channel vs event vs free tag
    src_cols = [r[1] for r in conn.execute("PRAGMA table_info(sources)")]
    if "category" not in src_cols:
        conn.execute("ALTER TABLE sources ADD COLUMN category TEXT NOT NULL DEFAULT 'tag'")
        conn.execute(
            "UPDATE sources SET category='channel' "
            "WHERE code IN ('relate','featpaper','mailing','manual')"
        )
        conn.execute(
            "UPDATE sources SET category='event' "
            "WHERE category='tag' AND (label LIKE '%강의%' OR label LIKE '%세미나%' "
            "OR label LIKE '%전시%' OR label LIKE '%KOSME%')"
        )

    # activities.activity_type — sales-touch type (visit/call/quote/demo/…)
    act_cols = [r[1] for r in conn.execute("PRAGMA table_info(activities)")]
    if "activity_type" not in act_cols:
        conn.execute("ALTER TABLE activities ADD COLUMN activity_type TEXT NOT NULL DEFAULT ''")
    if "next_action" not in act_cols:
        conn.execute("ALTER TABLE activities ADD COLUMN next_action TEXT NOT NULL DEFAULT ''")
    # 수집 시각(collected_at): Slack 동기화로 새로 들어온 항목만 채움 → 'NEW' 24h 판정에 사용
    if "collected_at" not in act_cols:
        conn.execute("ALTER TABLE activities ADD COLUMN collected_at TEXT NOT NULL DEFAULT ''")

    # free-form tags per contact (distinct from canonical source channels)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS contact_tags (
          contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          tag TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (contact_id, tag)
        )
        """
    )
    # 원문 → DB 반영 표시 (파싱되어 활동/리드/리뷰로 들어갔는지)
    raw_cols = [r[1] for r in conn.execute("PRAGMA table_info(slack_raw_messages)")]
    if "applied" not in raw_cols:
        conn.execute("ALTER TABLE slack_raw_messages ADD COLUMN applied INTEGER NOT NULL DEFAULT 0")
    if "applied_kind" not in raw_cols:
        conn.execute("ALTER TABLE slack_raw_messages ADD COLUMN applied_kind TEXT NOT NULL DEFAULT ''")
    if "thread_ts" not in raw_cols:
        conn.execute("ALTER TABLE slack_raw_messages ADD COLUMN thread_ts TEXT NOT NULL DEFAULT ''")
    if "archived" not in raw_cols:
        conn.execute("ALTER TABLE slack_raw_messages ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
    if "callback_sent_at" not in raw_cols:
        conn.execute("ALTER TABLE slack_raw_messages ADD COLUMN callback_sent_at TEXT NOT NULL DEFAULT ''")

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_raw_thread ON slack_raw_messages(thread_ts)"
    )
    # Slack 유저 ID → 이름 매핑 (멘션 <@U..>을 이름으로 치환)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS slack_users (
          user_id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          real_name TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    user_cols = [r[1] for r in conn.execute("PRAGMA table_info(slack_users)")]
    for col, ddl in {
        "display_name": "TEXT NOT NULL DEFAULT ''",
        "title": "TEXT NOT NULL DEFAULT ''",
        "email": "TEXT NOT NULL DEFAULT ''",
        "phone": "TEXT NOT NULL DEFAULT ''",
        "status_text": "TEXT NOT NULL DEFAULT ''",
        "status_emoji": "TEXT NOT NULL DEFAULT ''",
        "image_72": "TEXT NOT NULL DEFAULT ''",
        "profile_json": "TEXT NOT NULL DEFAULT '{}'",
    }.items():
        if col not in user_cols:
            conn.execute(f"ALTER TABLE slack_users ADD COLUMN {col} {ddl}")
    # 유사 중복 "병합 안 함(무시)" 기록 — 다시 후보로 뜨지 않게
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dup_dismissed "
        "(signature TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    _create_audit(conn)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS semantic_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_key TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL DEFAULT '',
          text_hash TEXT NOT NULL DEFAULT '',
          embedding_json TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(entity_type, entity_key)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_semantic_documents_entity "
        "ON semantic_documents(entity_type, entity_key)"
    )


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    settings = get_settings()
    if not settings.db_path.exists():
        raise FileNotFoundError(
            f"Customer DB not found at {settings.db_path}. "
            "Build it via packages/customer-db or set RTM_CUSTOMER_DB."
        )
    conn = _connect(settings.db_path)
    global _migrated
    if not _migrated:
        _run_migrations(conn)
        conn.commit()
        _migrated = True
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def rows_to_dicts(rows) -> list[dict]:
    return [dict(row) for row in rows]
