"""Encrypt administrator-managed integration secrets before SQLite storage."""
from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


PREFIX = "enc:v1:"


def _key() -> bytes | None:
    key_file = Path(os.environ.get("RTM_SECRET_KEY_FILE", "/run/secrets/rtm_secret_key"))
    if key_file.is_file():
        value = key_file.read_text(encoding="utf-8").strip()
        return value.encode("ascii") if value else None
    value = os.environ.get("RTM_SECRET_KEY", "").strip()
    return value.encode("ascii") if value else None


def available() -> bool:
    try:
        key = _key()
        if not key:
            return False
        Fernet(key)
        return True
    except (ValueError, OSError):
        return False


def encrypt(value: str) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    key = _key()
    if not key:
        raise RuntimeError("서버 암호화 키가 설정되지 않았습니다")
    return PREFIX + Fernet(key).encrypt(value.encode("utf-8")).decode("ascii")


def decrypt(value: str) -> str:
    value = str(value or "").strip()
    if not value or not value.startswith(PREFIX):
        return value  # legacy plaintext is accepted until the next admin save
    key = _key()
    if not key:
        return ""
    try:
        return Fernet(key).decrypt(value[len(PREFIX):].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""
