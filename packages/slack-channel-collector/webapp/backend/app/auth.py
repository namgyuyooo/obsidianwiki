"""Minimal account/permission guard for operations APIs."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from dataclasses import dataclass
from typing import Iterable

import sqlite3
from fastapi import HTTPException, Request

# 토큰 사용시각(last_used_at) 텔레메트리는 요청마다 쓰면 DB 쓰기 폭주 → 잠금 유발.
# 토큰별 최소 기록 간격을 두어, 폴링/병렬 요청이 많아도 쓰기는 드물게만 발생시킨다.
_TOUCH_INTERVAL_SEC = 300.0
_last_touch: dict[str, float] = {}


@dataclass(frozen=True)
class Actor:
    user_id: int | None
    email: str
    role: str
    permissions: frozenset[str]


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256$120000${salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, rounds_s, salt, digest = password_hash.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        rounds = int(rounds_s)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds
        ).hex()
        return hmac.compare_digest(candidate, digest)
    except Exception:
        return False


def issue_token(
    conn: sqlite3.Connection,
    user_id: int,
    *,
    label: str = "login",
) -> str:
    token = "rtm_" + secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO auth_api_tokens(user_id, label, token_hash) VALUES(?, ?, ?)",
        (user_id, label, _hash_token(token)),
    )
    return token


def _token_from_request(request: Request) -> str:
    auth = request.headers.get("Authorization", "").strip()
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return request.headers.get("X-RTM-API-Key", "").strip()


def _perms_for_role(conn: sqlite3.Connection, role: str) -> set[str]:
    return {
        r["permission"]
        for r in conn.execute(
            "SELECT permission FROM auth_role_permissions WHERE role = ?",
            (role,),
        )
    }


def _env_admin_actor(conn: sqlite3.Connection, token: str) -> Actor | None:
    admin_key = os.environ.get("RTM_ADMIN_API_KEY", "").strip()
    if not admin_key or token != admin_key:
        return None
    return Actor(
        user_id=None,
        email=os.environ.get("RTM_ADMIN_EMAIL", "admin@local").strip() or "admin@local",
        role="admin",
        permissions=frozenset(_perms_for_role(conn, "admin")),
    )


def actor_from_token(conn: sqlite3.Connection, token: str) -> Actor:
    if not token:
        raise HTTPException(status_code=401, detail="운영 API 키가 필요합니다")
    env_actor = _env_admin_actor(conn, token)
    if env_actor:
        return env_actor
    token_hash = _hash_token(token)
    row = conn.execute(
        """
        SELECT u.id, u.email, u.role
        FROM auth_api_tokens t
        JOIN auth_users u ON u.id = t.user_id
        WHERE t.token_hash = ?
          AND t.revoked_at = ''
          AND u.status = 'active'
        """,
        (token_hash,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="운영 API 키가 올바르지 않습니다")
    # 사용시각 기록은 스로틀링: 토큰당 최대 5분에 한 번만 DB에 쓴다(쓰기 폭주 방지).
    now = time.time()
    if now - _last_touch.get(token_hash, 0.0) > _TOUCH_INTERVAL_SEC:
        _last_touch[token_hash] = now
        conn.execute(
            "UPDATE auth_api_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE token_hash=?",
            (token_hash,),
        )
        conn.execute(
            "UPDATE auth_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?",
            (row["id"],),
        )
    return Actor(
        user_id=row["id"],
        email=row["email"],
        role=row["role"],
        permissions=frozenset(_perms_for_role(conn, row["role"])),
    )


def current_actor(conn: sqlite3.Connection, request: Request) -> Actor:
    return actor_from_token(conn, _token_from_request(request))


def login_password(conn: sqlite3.Connection, email: str, password: str) -> tuple[Actor, str]:
    email = (email or "").strip().lower()
    row = conn.execute(
        "SELECT id, email, role, password_hash FROM auth_users WHERE email=? AND status='active'",
        (email,),
    ).fetchone()
    if row is None or not row["password_hash"] or not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    token = issue_token(conn, int(row["id"]), label="web-login")
    conn.execute("UPDATE auth_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?", (row["id"],))
    actor = Actor(
        user_id=row["id"],
        email=row["email"],
        role=row["role"],
        permissions=frozenset(_perms_for_role(conn, row["role"])),
    )
    return actor, token


def actor_payload(actor: Actor) -> dict:
    return {
        "id": actor.user_id,
        "email": actor.email,
        "role": actor.role,
        "permissions": sorted(actor.permissions),
    }


def list_users(conn: sqlite3.Connection) -> list[dict]:
    return [
        {
            "id": r["id"],
            "email": r["email"],
            "name": r["name"],
            "role": r["role"],
            "status": r["status"],
            "created_at": r["created_at"],
            "last_login_at": r["last_login_at"],
        }
        for r in conn.execute(
            "SELECT id, email, name, role, status, created_at, last_login_at "
            "FROM auth_users ORDER BY id"
        )
    ]


def role_permissions(conn: sqlite3.Connection) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for r in conn.execute("SELECT role, permission FROM auth_role_permissions ORDER BY role, permission"):
        out.setdefault(r["role"], []).append(r["permission"])
    return out


def create_user(
    conn: sqlite3.Connection,
    *,
    email: str,
    name: str,
    role: str,
    password: str = "",
) -> dict:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="이메일이 필요합니다")
    if role not in role_permissions(conn):
        raise HTTPException(status_code=400, detail="알 수 없는 역할입니다")
    password_hash = hash_password(password) if password else ""
    cur = conn.execute(
        """
        INSERT INTO auth_users(email, name, role, password_hash, status)
        VALUES(?, ?, ?, ?, 'active')
        """,
        (email, name.strip(), role, password_hash),
    )
    return {"id": cur.lastrowid, "email": email, "name": name.strip(), "role": role, "status": "active"}


def update_user(conn: sqlite3.Connection, user_id: int, patch: dict) -> dict:
    allowed = {"name", "role", "status"}
    fields = {k: v for k, v in patch.items() if k in allowed and v is not None}
    if "role" in fields and fields["role"] not in role_permissions(conn):
        raise HTTPException(status_code=400, detail="알 수 없는 역할입니다")
    if fields:
        sets = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE auth_users SET {sets} WHERE id=?", [*fields.values(), user_id])
    if patch.get("password"):
        conn.execute(
            "UPDATE auth_users SET password_hash=? WHERE id=?",
            (hash_password(str(patch["password"])), user_id),
        )
    row = conn.execute(
        "SELECT id, email, name, role, status FROM auth_users WHERE id=?",
        (user_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    return dict(row)


def list_jobs(conn: sqlite3.Connection, limit: int = 80) -> list[dict]:
    return [
        {
            "id": r["id"],
            "job_type": r["job_type"],
            "status": r["status"],
            "actor_email": r["actor_email"],
            "target_scope": r["target_scope"],
            "input_summary": r["input_summary"],
            "result_summary": r["result_summary"],
            "error_message": r["error_message"],
            "started_at": r["started_at"],
            "finished_at": r["finished_at"],
        }
        for r in conn.execute(
            """
            SELECT id, job_type, status, actor_email, target_scope, input_summary,
                   result_summary, error_message, started_at, finished_at
            FROM job_runs
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
    ]


def require_permission(
    conn: sqlite3.Connection,
    request: Request,
    permission: str | Iterable[str],
) -> Actor:
    actor = current_actor(conn, request)
    required = {permission} if isinstance(permission, str) else set(permission)
    if not required.issubset(actor.permissions):
        missing = ", ".join(sorted(required - set(actor.permissions)))
        raise HTTPException(status_code=403, detail=f"권한이 없습니다: {missing}")
    return actor


def record_job_start(
    conn: sqlite3.Connection,
    job_type: str,
    actor: Actor,
    *,
    target_scope: str = "",
    input_summary: str = "",
) -> int:
    cur = conn.execute(
        """
        INSERT INTO job_runs(job_type, status, requested_by, actor_email, target_scope, input_summary)
        VALUES(?, 'started', ?, ?, ?, ?)
        """,
        (job_type, actor.user_id, actor.email, target_scope, input_summary),
    )
    return int(cur.lastrowid)


def record_job_finish(
    conn: sqlite3.Connection,
    job_id: int,
    status: str,
    *,
    result_summary: str = "",
    error_message: str = "",
) -> None:
    conn.execute(
        """
        UPDATE job_runs
        SET status=?, result_summary=?, error_message=?, finished_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (status, result_summary, error_message, job_id),
    )
