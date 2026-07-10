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


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type)"
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
