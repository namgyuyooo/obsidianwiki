"""Rotate the packaged database administrator credential on first install."""
from __future__ import annotations

import os
import secrets
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.auth import hash_password


db = Path(os.environ.get("RTM_CUSTOMER_DB", "/data/rtm_customer.db"))
password = secrets.token_urlsafe(20)
conn = sqlite3.connect(db)
row = conn.execute(
    "SELECT id,email FROM auth_users WHERE role='admin' ORDER BY id LIMIT 1"
).fetchone()
if row:
    user_id, email = int(row[0]), str(row[1])
    conn.execute(
        "UPDATE auth_users SET password_hash=?, status='active' WHERE id=?",
        (hash_password(password), user_id),
    )
else:
    email = "admin@rtm.local"
    cur = conn.execute(
        "INSERT INTO auth_users(email,name,password_hash,role,status) VALUES(?,?,?,?,?)",
        (email, "RTM 관리자", hash_password(password), "admin", "active"),
    )
    user_id = int(cur.lastrowid)
conn.execute("UPDATE auth_api_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE revoked_at='' AND user_id=?", (user_id,))
conn.commit()
conn.close()
print(f"아이디: {email}")
print(f"초기 비밀번호: {password}")
print("첫 로그인 후 사용자·권한 관리에서 비밀번호를 변경하세요.")
