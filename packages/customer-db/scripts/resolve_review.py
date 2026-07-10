from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "rtm_customer.db"


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: resolve_review.py REVIEW_ID approve|reject|edit [VALUE] [DB_PATH]", file=sys.stderr)
        return 2
    review_id = int(sys.argv[1])
    action = sys.argv[2]
    value = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].endswith(".db") else None
    db_path = Path(sys.argv[-1]).resolve() if sys.argv[-1].endswith(".db") else DEFAULT_DB
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    with conn:
        review = conn.execute("SELECT * FROM consistency_reviews WHERE id = ?", (review_id,)).fetchone()
        if not review:
            raise SystemExit(f"review not found: {review_id}")
        if action == "reject":
            conn.execute("UPDATE consistency_reviews SET status='rejected', resolved_at=CURRENT_TIMESTAMP WHERE id=?", (review_id,))
        elif action in {"approve", "edit"}:
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
        else:
            raise SystemExit("action must be approve, reject, or edit")
    conn.close()
    print(f"{action}: review {review_id}")
    return 0


def apply_value(conn: sqlite3.Connection, review: sqlite3.Row, value: str) -> None:
    if review["entity_id"] is None:
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
        column = None
        table = ""
    if not column:
        return
    conn.execute(f"UPDATE {table} SET {column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (value, review["entity_id"]))


if __name__ == "__main__":
    raise SystemExit(main())
