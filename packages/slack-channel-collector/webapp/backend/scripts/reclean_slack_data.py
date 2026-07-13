#!/usr/bin/env python3
"""Rebuild the customer DB from seed and replay all preserved Slack raw messages.

This is a controlled "full cleanse" path:
1. backup the current SQLite DB,
2. preserve Slack raw messages / settings / user mapping,
3. rebuild the DB from the frontend seed,
4. run webapp migrations,
5. replay all raw Slack messages through the current parsers and GLM fallback.

It intentionally avoids printing secrets from backend/.env.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_ROOT = BACKEND_ROOT.parent
PACKAGE_ROOT = WEBAPP_ROOT.parent
REPO_PACKAGES = PACKAGE_ROOT.parent
REPO_ROOT = REPO_PACKAGES.parent
CUSTOMER_DB_ROOT = REPO_PACKAGES / "customer-db"
DB_PATH = CUSTOMER_DB_ROOT / "data" / "rtm_customer.db"
SEED_PATH = CUSTOMER_DB_ROOT / "data" / "frontend_seed.json"
BUILD_SCRIPT = CUSTOMER_DB_ROOT / "scripts" / "build_sqlite_db.py"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def rows(conn: sqlite3.Connection, sql: str) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql).fetchall()]


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def summarize(conn: sqlite3.Connection) -> dict[str, Any]:
    def scalar(sql: str) -> int:
        return int(conn.execute(sql).fetchone()[0])

    source_counts = {
        r["source_type"]: r["n"]
        for r in rows(
            conn,
            "SELECT source_type, COUNT(*) AS n FROM activities GROUP BY source_type",
        )
    }
    channel_counts = {
        r["channel_id"]: r["n"]
        for r in rows(
            conn,
            "SELECT channel_id, COUNT(*) AS n FROM slack_raw_messages GROUP BY channel_id",
        )
    }
    return {
        "companies": scalar("SELECT COUNT(*) FROM companies"),
        "contacts": scalar("SELECT COUNT(*) FROM contacts"),
        "activities": scalar("SELECT COUNT(*) FROM activities"),
        "pending_reviews": scalar(
            "SELECT COUNT(*) FROM consistency_reviews WHERE status='pending'"
        ),
        "source_counts": source_counts,
        "raw_channels": channel_counts,
    }


def preserve_current(db_path: Path) -> dict[str, Any]:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        preserved = {
            "slack_raw_messages": rows(conn, "SELECT * FROM slack_raw_messages")
            if table_exists(conn, "slack_raw_messages")
            else [],
            "slack_users": rows(conn, "SELECT * FROM slack_users")
            if table_exists(conn, "slack_users")
            else [],
            "app_settings": rows(conn, "SELECT * FROM app_settings")
            if table_exists(conn, "app_settings")
            else [],
            "dup_dismissed": rows(conn, "SELECT * FROM dup_dismissed")
            if table_exists(conn, "dup_dismissed")
            else [],
            "before": summarize(conn),
        }
    return preserved


def restore_preserved(conn: sqlite3.Connection, preserved: dict[str, Any]) -> None:
    # app_settings is created by queries.get_sync_settings after migrations; keep
    # only sync_rules and reset channel_state so every preserved raw message replays.
    for row in preserved["app_settings"]:
        if row.get("key") != "sync_rules":
            continue
        try:
            value = json.loads(row.get("value") or "{}")
        except ValueError:
            value = {}
        value["channel_state"] = {}
        value["glm_parse_cross_team"] = True
        value["slack_callback_enabled"] = False
        conn.execute(
            "INSERT OR REPLACE INTO app_settings(key, value) VALUES (?, ?)",
            ("sync_rules", json.dumps(value, ensure_ascii=False)),
        )

    for row in preserved["slack_users"]:
        conn.execute(
            """
            INSERT OR REPLACE INTO slack_users(
              user_id, name, real_name, updated_at, display_name, title, email, phone,
              status_text, status_emoji, image_72, profile_json
            )
            VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row.get("user_id"),
                row.get("name", ""),
                row.get("real_name", ""),
                row.get("updated_at"),
                row.get("display_name", ""),
                row.get("title", ""),
                row.get("email", ""),
                row.get("phone", ""),
                row.get("status_text", ""),
                row.get("status_emoji", ""),
                row.get("image_72", ""),
                row.get("profile_json", "{}"),
            ),
        )

    for row in preserved["dup_dismissed"]:
        conn.execute(
            "INSERT OR IGNORE INTO dup_dismissed(signature, created_at) VALUES (?, COALESCE(?, CURRENT_TIMESTAMP))",
            (row.get("signature"), row.get("created_at")),
        )

    for row in preserved["slack_raw_messages"]:
        conn.execute(
            """
            INSERT OR IGNORE INTO slack_raw_messages
              (channel_id, message_ts, user_id, text, raw_payload, thread_ts, archived)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row.get("channel_id", ""),
                row.get("message_ts", ""),
                row.get("user_id", ""),
                row.get("text", ""),
                row.get("raw_payload", "{}"),
                row.get("thread_ts", ""),
                int(row.get("archived") or 0),
            ),
        )


def payload_from_raw(row: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(row.get("raw_payload") or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except ValueError:
        payload = {}
    payload.setdefault("ts", row.get("message_ts", ""))
    payload.setdefault("user", row.get("user_id", ""))
    payload.setdefault("text", row.get("text", ""))
    if row.get("thread_ts"):
        payload.setdefault("thread_ts", row.get("thread_ts"))
    return payload


def replay_raw_messages() -> dict[str, Any]:
    sys.path.insert(0, str(BACKEND_ROOT))
    from app import queries, slack_sync  # type: ignore
    from app.db import get_conn  # type: ignore

    logs: list[str] = []
    with get_conn() as conn:
        settings = queries.get_sync_settings(conn)
        channel_strategy = {
            c.get("id"): c.get("strategy", "inbound")
            for c in settings.get("channels", [])
            if c.get("id")
        }
        state: dict[str, float] = {}
        all_rows = rows(
            conn,
            """
            SELECT channel_id, message_ts, user_id, text, raw_payload, thread_ts, archived
            FROM slack_raw_messages
            WHERE archived = 0
            ORDER BY CAST(message_ts AS REAL) ASC
            """,
        )
        messages_by_channel: dict[str, list[dict[str, Any]]] = {}
        for row in all_rows:
            thread_ts = row.get("thread_ts") or ""
            is_reply = bool(thread_ts and thread_ts != row.get("message_ts"))
            payload = payload_from_raw(row)
            if payload.get("is_reply") or is_reply:
                continue
            messages_by_channel.setdefault(row["channel_id"], []).append(payload)

    result = {"channels": [], "totals": {"collected": 0, "parsed": 0, "new_leads": 0, "new_activities": 0, "queued": 0}}
    for channel_id, messages in sorted(messages_by_channel.items()):
        strategy = channel_strategy.get(channel_id, "cross_team" if channel_id == "C01L5SA4Y4C" else "inbound")
        # Keep write locks short so the running backend/auto-sync does not get
        # stuck behind one long SQLite transaction during a full cleanse.
        with get_conn() as conn:
            settings = queries.get_sync_settings(conn)
            settings["slack_callback_enabled"] = False
            r = slack_sync._process_channel(  # intentional internal replay helper
                conn, channel_id, strategy, messages, settings, state, None, logs
            )
        for key in result["totals"]:
            result["totals"][key] += r[key]
        result["channels"].append({"channel_id": channel_id, "strategy": strategy, **r})

    with get_conn() as conn:
        settings = queries.get_sync_settings(conn)
        settings["channel_state"] = state
        settings["slack_callback_enabled"] = True
        queries.save_sync_settings(conn, settings)
        result["settings"] = queries.get_sync_settings(conn)
    result["logs"] = logs
    return result


def main() -> int:
    load_dotenv(BACKEND_ROOT / ".env")
    if not DB_PATH.exists():
        raise SystemExit(f"DB not found: {DB_PATH}")
    if not SEED_PATH.exists():
        raise SystemExit(f"seed not found: {SEED_PATH}")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = DB_PATH.with_suffix(f".db.reclean-bak-{stamp}")
    shutil.copy2(DB_PATH, backup)

    preserved = preserve_current(DB_PATH)
    subprocess.run(
        [sys.executable, str(BUILD_SCRIPT), str(SEED_PATH), str(DB_PATH)],
        check=True,
        cwd=str(REPO_ROOT),
    )

    sys.path.insert(0, str(BACKEND_ROOT))
    from app import queries  # type: ignore
    from app.db import get_conn  # type: ignore

    with get_conn() as conn:
        queries.get_sync_settings(conn)  # creates app_settings and runs migrations.
        restore_preserved(conn, preserved)

    replay = replay_raw_messages()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        after = summarize(conn)
        garbage = rows(
            conn,
            """
            SELECT display_name, profile_source,
                   (SELECT COUNT(*) FROM activities a WHERE a.company_id=companies.id) AS activities,
                   (SELECT COUNT(*) FROM contacts c WHERE c.company_id=companies.id) AS contacts
            FROM companies
            WHERE display_name IN ('반도체','허','강지훈','박진우','성기석','심충도','종료된','DJK:','(서울반도체)')
               OR display_name GLOB '[0-9]*'
               OR display_name IN ('a','ss','ㅁ','ㅁㅁ','aaa','asdf','ggg')
            ORDER BY display_name
            """,
        )

    print(json.dumps({
        "ok": True,
        "backup": str(backup),
        "before": preserved["before"],
        "after": after,
        "replay": replay,
        "garbage_candidates": garbage,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
