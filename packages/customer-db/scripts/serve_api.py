from __future__ import annotations

import json
import re
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "rtm_customer.db"


class CustomerDbApi(BaseHTTPRequestHandler):
    db_path = DEFAULT_DB

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler method name.
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/api/health":
            return self.send_json({"ok": True, "db": str(self.db_path)})
        if parsed.path == "/api/summary":
            return self.send_json(summary(self.db_path))
        if parsed.path == "/api/customers":
            limit = int(query.get("limit", ["200"])[0])
            offset = int(query.get("offset", ["0"])[0])
            return self.send_json({"items": customers(self.db_path, limit, offset)})
        if parsed.path == "/api/reviews":
            status = query.get("status", ["pending"])[0]
            return self.send_json({"items": reviews(self.db_path, status)})
        self.send_error(404, "not found")

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler method name.
        parsed = urlparse(self.path)
        match = re.fullmatch(r"/api/reviews/(\d+)/resolve", parsed.path)
        if match:
            body = self.read_json()
            review_id = int(match.group(1))
            action = body.get("action", "approve")
            value = body.get("value")
            resolve_review(self.db_path, review_id, action, value)
            return self.send_json({"ok": True, "review_id": review_id, "action": action})
        self.send_error(404, "not found")

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature.
        return


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def summary(db_path: Path) -> dict:
    with connect(db_path) as conn:
        return {
            "companies": scalar(conn, "SELECT COUNT(*) FROM companies"),
            "contacts": scalar(conn, "SELECT COUNT(*) FROM contacts"),
            "activities": scalar(conn, "SELECT COUNT(*) FROM activities"),
            "pending_reviews": scalar(conn, "SELECT COUNT(*) FROM consistency_reviews WHERE status='pending'"),
        }


def customers(db_path: Path, limit: int, offset: int) -> list[dict]:
    with connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT * FROM v_customer_dashboard
            ORDER BY last_seen DESC, company ASC, name ASC
            LIMIT ? OFFSET ?
            """,
            (max(1, min(limit, 1000)), max(0, offset)),
        ).fetchall()
        return [dict(row) for row in rows]


def reviews(db_path: Path, status: str) -> list[dict]:
    with connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT * FROM consistency_reviews
            WHERE status = ?
            ORDER BY confidence ASC, requested_at ASC
            LIMIT 500
            """,
            (status,),
        ).fetchall()
        return [dict(row) for row in rows]


def resolve_review(db_path: Path, review_id: int, action: str, value: str | None) -> None:
    with connect(db_path) as conn:
        review = conn.execute("SELECT * FROM consistency_reviews WHERE id = ?", (review_id,)).fetchone()
        if not review:
            raise ValueError(f"review not found: {review_id}")
        if action == "reject":
            conn.execute("UPDATE consistency_reviews SET status='rejected', resolved_at=CURRENT_TIMESTAMP WHERE id=?", (review_id,))
            return
        if action not in {"approve", "edit"}:
            raise ValueError("action must be approve, reject, or edit")
        proposed = value if action == "edit" and value is not None else review["proposed_value"]
        apply_value(conn, review, proposed)
        conn.execute(
            """
            UPDATE consistency_reviews
            SET status='approved', proposed_value=?, resolved_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (proposed, review_id),
        )


def apply_value(conn: sqlite3.Connection, review: sqlite3.Row, value: str) -> None:
    if review["entity_id"] is None:
        return
    table = ""
    column = ""
    if review["entity_type"] == "contact":
        table = "contacts"
        column = {"name": "name", "phone": "phone", "department": "department", "title": "title"}.get(review["field_name"], "")
    elif review["entity_type"] == "company":
        table = "companies"
        column = {"name": "display_name", "industry": "industry", "sub_industry": "sub_industry", "description": "description"}.get(review["field_name"], "")
    if table and column:
        conn.execute(f"UPDATE {table} SET {column}=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (value, review["entity_id"]))


def scalar(conn: sqlite3.Connection, sql: str) -> int:
    return int(conn.execute(sql).fetchone()[0])


def main() -> int:
    db_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_DB
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
    CustomerDbApi.db_path = db_path
    server = ThreadingHTTPServer(("127.0.0.1", port), CustomerDbApi)
    print(f"Customer DB API: http://127.0.0.1:{port} db={db_path}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
