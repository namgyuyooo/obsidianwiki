"""Runtime configuration for the customer-db web API.

The database is the SQLite file produced by the ``customer-db`` package.
It can be overridden with the ``RTM_CUSTOMER_DB`` environment variable so the
same server can point at a staging / production copy.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


# webapp/backend/app/config.py -> parents[3] == packages/slack-channel-collector
PACKAGE_ROOT = Path(__file__).resolve().parents[3]
REPO_PACKAGES = PACKAGE_ROOT.parent

# Default: reuse the DB built by packages/customer-db.
DEFAULT_DB = REPO_PACKAGES / "customer-db" / "data" / "rtm_customer.db"
# Slack message-writing guide surfaced permanently in the UI.
DEFAULT_GUIDE = REPO_PACKAGES / "customer-db" / "docs" / "SLACK_MESSAGE_GUIDE.md"
# Built frontend (Vite `dist/`) served by the API so one process serves both.
DEFAULT_FRONTEND_DIST = PACKAGE_ROOT / "webapp" / "frontend" / "dist"


class Settings:
    def __init__(self) -> None:
        env_db = os.environ.get("RTM_CUSTOMER_DB", "").strip()
        self.db_path: Path = Path(env_db).expanduser().resolve() if env_db else DEFAULT_DB
        env_guide = os.environ.get("RTM_SLACK_GUIDE", "").strip()
        self.guide_path: Path = (
            Path(env_guide).expanduser().resolve() if env_guide else DEFAULT_GUIDE
        )
        env_dist = os.environ.get("RTM_FRONTEND_DIST", "").strip()
        self.frontend_dist: Path = (
            Path(env_dist).expanduser().resolve() if env_dist else DEFAULT_FRONTEND_DIST
        )
        # Comma separated list of allowed CORS origins for the Vite dev server.
        origins = os.environ.get(
            "RTM_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        )
        self.cors_origins = [o.strip() for o in origins.split(",") if o.strip()]
        # Slack collector wiring (optional). When unset, /api/sync returns a
        # friendly "not configured" response instead of failing.
        self.slack_channel_id = os.environ.get("RTM_SLACK_CHANNEL_ID", "").strip()
        self.slack_export_dir = os.environ.get("RTM_SLACK_EXPORT_DIR", "").strip()
        # Workspace base used to build permalinks to the original Slack message,
        # e.g. "https://rtm.slack.com". Trailing slash is trimmed.
        self.slack_workspace_url = (
            os.environ.get("RTM_SLACK_WORKSPACE_URL", "https://rtm.slack.com")
            .strip()
            .rstrip("/")
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
