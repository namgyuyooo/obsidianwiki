#!/usr/bin/env python3
"""Live Slack backfill for the last three years through the backend parser.

This intentionally runs the same channel strategies as the webapp sync path,
but uses a bounded three-year lookback instead of the webapp's "full history"
bootstrap mode. Slack thread callbacks are disabled during the bulk backfill to
avoid posting hundreds of historical replies, then restored to enabled.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = BACKEND_ROOT.parents[1]
THREE_YEAR_HOURS = 24 * 365 * 3
BACKFILL_LIMIT = int(os.environ.get("RTM_THREE_YEAR_BACKFILL_LIMIT", "100000") or "100000")


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


def log(logs: list[str], message: str) -> None:
    print(message, flush=True)
    logs.append(message)


def main() -> int:
    load_dotenv(BACKEND_ROOT / ".env")
    load_dotenv(PACKAGE_ROOT / ".env")
    sys.path.insert(0, str(BACKEND_ROOT))

    from app import queries, slack_sync  # type: ignore
    from app.db import get_conn  # type: ignore

    slack_sync._ensure_collector_importable()  # intentional internal helper
    from rtm_slack_channel_collector import collector  # type: ignore

    logs: list[str] = []
    totals = {"collected": 0, "parsed": 0, "new_leads": 0, "new_activities": 0, "queued": 0}
    per_channel: list[dict[str, Any]] = []

    with get_conn() as conn:
        original_settings = queries.get_sync_settings(conn)
        channels = [c for c in original_settings.get("channels", []) if c.get("enabled", True) and c.get("id")]
        bulk_settings = dict(original_settings)
        bulk_settings["lookback_hours"] = THREE_YEAR_HOURS
        bulk_settings["sync_limit"] = 0
        bulk_settings["slack_callback_enabled"] = False
        queries.save_sync_settings(conn, bulk_settings)

        state: dict[str, float] = dict(original_settings.get("channel_state") or {})
        started_at = datetime.now().isoformat(timespec="seconds")

    for ch in channels:
        channel_id = ch["id"]
        strategy = ch.get("strategy", "inbound")
        tmp_state = Path(tempfile.gettempdir()) / f"rtm_three_year_state_{channel_id}.json"
        if tmp_state.exists():
            tmp_state.unlink()
        config = collector.CollectionConfig.from_env(require_token=True)
        config = config.__class__(
            **{
                **config.__dict__,
                "channel_id": channel_id,
                "lookback_hours": THREE_YEAR_HOURS,
                "limit": BACKFILL_LIMIT,
                "state_path": tmp_state,
                "page_pause_seconds": 0.0,
                "thread_pause_seconds": 0.0,
            }
        )
        log(logs, f"[3y] #{ch.get('name') or channel_id} 수집 시작 strategy={strategy}")
        result = collector.collect_once(config, dry_run=True)
        payload = result.get("sample_payload", {})
        messages = payload.get("messages", [])
        log(logs, f"[3y] #{channel_id} Slack 메시지 {len(messages)}건")

        # Slack fetching can take a while. Only hold the SQLite write lock while
        # applying one channel's messages.
        with get_conn() as conn:
            bulk_settings = queries.get_sync_settings(conn)
            bulk_settings["slack_callback_enabled"] = False
            applied_ts = {
                str(r["message_ts"])
                for r in conn.execute(
                    """
                    SELECT message_ts FROM slack_raw_messages
                    WHERE channel_id=? AND applied=1
                    """,
                    (channel_id,),
                ).fetchall()
            }
            pending_messages = [
                m for m in messages
                if str(m.get("ts", "")) and str(m.get("ts", "")) not in applied_ts
            ]
            log(
                logs,
                f"[3y] #{channel_id} 미반영 메시지 {len(pending_messages)}건 "
                f"(기반영 {len(messages) - len(pending_messages)}건 제외)"
            )
            previous_state = float(state.get(channel_id) or 0)
            state[channel_id] = 0
            r = slack_sync._process_channel(  # intentional replay through backend parser
                conn, channel_id, strategy, pending_messages, bulk_settings, state, None, logs
            )
            state[channel_id] = max(previous_state, float(state.get(channel_id) or 0))
        for key in totals:
            totals[key] += r[key]
        per_channel.append({"channel": ch.get("name") or channel_id, "strategy": strategy, **r})

    with get_conn() as conn:
        restored = dict(original_settings)
        restored["channel_state"] = state
        restored["slack_callback_enabled"] = True
        queries.save_sync_settings(conn, restored)

    print(json.dumps({
        "ok": True,
        "started_at": started_at,
        "lookback_hours": THREE_YEAR_HOURS,
        "limit": BACKFILL_LIMIT,
        "totals": totals,
        "channels": per_channel,
        "log_tail": logs[-40:],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
