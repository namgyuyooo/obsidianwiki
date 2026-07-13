#!/usr/bin/env python3
"""Build the lightweight SQLite semantic-search index."""
from __future__ import annotations

import os
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = BACKEND_ROOT.parents[1]


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


def main() -> int:
    load_dotenv(BACKEND_ROOT / ".env")
    load_dotenv(PACKAGE_ROOT / ".env")
    sys.path.insert(0, str(BACKEND_ROOT))
    from app import semantic  # type: ignore
    from app.db import get_conn  # type: ignore

    limit = int(os.environ.get("RTM_EMBEDDING_REBUILD_LIMIT", "0") or "0")
    with get_conn() as conn:
        print(semantic.rebuild(conn, limit=limit))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
