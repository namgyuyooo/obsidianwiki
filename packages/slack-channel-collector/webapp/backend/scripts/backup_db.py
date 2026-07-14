"""Consistent encrypted SQLite backups for the Windows Docker deployment."""
from __future__ import annotations

import argparse
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet


def cipher(key_file: Path) -> Fernet:
    return Fernet(key_file.read_text(encoding="utf-8").strip().encode("ascii"))


def backup(db: Path, out_dir: Path, key_file: Path, keep: int) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot = out_dir / f".rtm-{stamp}.tmp.db"
    source = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=60)
    target = sqlite3.connect(snapshot)
    source.backup(target)
    target.close()
    source.close()
    verify = sqlite3.connect(snapshot)
    check = verify.execute("PRAGMA integrity_check").fetchone()[0]
    verify.close()
    if check != "ok":
        snapshot.unlink(missing_ok=True)
        raise RuntimeError(f"SQLite integrity check failed: {check}")
    encrypted = out_dir / f"rtm-customer-{stamp}.db.fernet"
    encrypted.write_bytes(cipher(key_file).encrypt(snapshot.read_bytes()))
    snapshot.unlink(missing_ok=True)
    files = sorted(out_dir.glob("rtm-customer-*.db.fernet"), reverse=True)
    for old in files[max(1, keep):]:
        old.unlink()
    return encrypted


def restore(source: Path, db: Path, key_file: Path) -> None:
    plain = cipher(key_file).decrypt(source.read_bytes())
    temp = db.with_suffix(".restore.tmp")
    temp.write_bytes(plain)
    verify = sqlite3.connect(temp)
    check = verify.execute("PRAGMA integrity_check").fetchone()[0]
    verify.close()
    if check != "ok":
        temp.unlink(missing_ok=True)
        raise RuntimeError(f"Backup integrity check failed: {check}")
    db.parent.mkdir(parents=True, exist_ok=True)
    temp.replace(db)
    for suffix in ("-wal", "-shm"):
        Path(str(db) + suffix).unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("backup", "restore", "watch"))
    parser.add_argument("source", nargs="?")
    parser.add_argument("--db", default="/data/rtm_customer.db")
    parser.add_argument("--out", default="/backups")
    parser.add_argument("--key", default="/run/secrets/rtm_secret_key")
    parser.add_argument("--keep", type=int, default=14)
    parser.add_argument("--interval", type=int, default=86400)
    args = parser.parse_args()
    db, out, key = Path(args.db), Path(args.out), Path(args.key)
    if args.action == "restore":
        if not args.source:
            parser.error("restore requires a backup file")
        restore(Path(args.source), db, key)
        print(f"restored: {args.source}", flush=True)
        return
    if args.action == "backup":
        print(f"backup: {backup(db, out, key, args.keep)}", flush=True)
        return
    while True:
        try:
            print(f"backup: {backup(db, out, key, args.keep)}", flush=True)
        except Exception as exc:
            print(f"backup failed: {exc}", flush=True)
        time.sleep(max(300, args.interval))


if __name__ == "__main__":
    main()
