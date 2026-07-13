"""Lightweight semantic search over the customer SQLite DB.

This intentionally avoids Elasticsearch/OpenSearch. Documents are embedded via
the configured GLM-compatible /embeddings endpoint and stored as JSON vectors in
SQLite, which is enough for the current customer DB size.
"""
from __future__ import annotations

import hashlib
import json
import math
import sqlite3
from typing import Any

from . import glm


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS semantic_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_key TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL DEFAULT '',
          text_hash TEXT NOT NULL DEFAULT '',
          embedding_json TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(entity_type, entity_key)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_semantic_documents_entity "
        "ON semantic_documents(entity_type, entity_key)"
    )


def _hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _company_documents(conn: sqlite3.Connection) -> list[dict[str, str]]:
    rows = conn.execute(
        """
        SELECT co.id, co.canonical_key, co.display_name, co.industry, co.sub_industry,
               co.description, co.owner, co.memo,
               GROUP_CONCAT(DISTINCT ct.name || ' ' || ct.department || ' ' || ct.title || ' ' || ct.email) AS contacts,
               GROUP_CONCAT(DISTINCT a.activity_type || ' ' || a.solution_name || ' ' || a.inquiry_text || ' ' || a.next_action) AS activities
        FROM companies co
        LEFT JOIN contacts ct ON ct.company_id = co.id
        LEFT JOIN activities a ON a.company_id = co.id
        WHERE COALESCE(co.display_name, '') <> ''
        GROUP BY co.id
        """
    ).fetchall()
    docs: list[dict[str, str]] = []
    for r in rows:
        title = r["display_name"] or r["canonical_key"]
        text = "\n".join(
            str(x or "")
            for x in [
                f"회사: {title}",
                f"업종: {r['industry']} {r['sub_industry']}",
                f"설명: {r['description']}",
                f"담당/메모: {r['owner']} {r['memo']}",
                f"연락처: {r['contacts']}",
                f"활동/문의: {r['activities']}",
            ]
            if str(x or "").strip()
        )[:6000]
        docs.append({
            "entity_type": "company",
            "entity_key": str(r["canonical_key"]),
            "title": title,
            "text": text,
        })
    return docs


def rebuild(conn: sqlite3.Connection, *, batch_size: int = 32, limit: int = 0) -> dict[str, Any]:
    if not glm.is_configured():
        return {"ok": False, "message": "GLM이 설정되지 않았습니다.", "updated": 0}
    ensure_tables(conn)
    docs = _company_documents(conn)
    if limit and limit > 0:
        docs = docs[:limit]
    cfg = glm.config()
    model = cfg.get("embedding_model", "")
    updated = skipped = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        todo = []
        for doc in batch:
            h = _hash(doc["text"])
            old = conn.execute(
                """
                SELECT text_hash, model FROM semantic_documents
                WHERE entity_type=? AND entity_key=?
                """,
                (doc["entity_type"], doc["entity_key"]),
            ).fetchone()
            if old and old["text_hash"] == h and old["model"] == model:
                skipped += 1
                continue
            doc["text_hash"] = h
            todo.append(doc)
        if not todo:
            continue
        vectors = glm.embed_texts([d["text"] for d in todo])
        for doc, vec in zip(todo, vectors):
            conn.execute(
                """
                INSERT INTO semantic_documents
                  (entity_type, entity_key, title, text, text_hash, embedding_json, model, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(entity_type, entity_key) DO UPDATE SET
                  title=excluded.title,
                  text=excluded.text,
                  text_hash=excluded.text_hash,
                  embedding_json=excluded.embedding_json,
                  model=excluded.model,
                  updated_at=CURRENT_TIMESTAMP
                """,
                (
                    doc["entity_type"],
                    doc["entity_key"],
                    doc["title"],
                    doc["text"],
                    doc["text_hash"],
                    json.dumps(vec, separators=(",", ":")),
                    model,
                ),
            )
            updated += 1
        conn.commit()
    return {"ok": True, "updated": updated, "skipped": skipped, "total": len(docs), "model": model}


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if not na or not nb:
        return 0.0
    return dot / (na * nb)


def search(conn: sqlite3.Connection, query: str, *, limit: int = 30) -> dict[str, Any]:
    ensure_tables(conn)
    q = (query or "").strip()
    if not q:
        return {"ok": True, "items": [], "emails": [], "count": 0}
    row_count = conn.execute("SELECT COUNT(*) FROM semantic_documents WHERE embedding_json<>''").fetchone()[0]
    if not row_count:
        return {"ok": False, "message": "임베딩 인덱스가 비어 있습니다. /api/embeddings/rebuild를 먼저 실행하세요.", "items": [], "emails": [], "count": 0}
    qvec = glm.embed_texts([q])[0]
    rows = conn.execute(
        """
        SELECT entity_type, entity_key, title, text, embedding_json
        FROM semantic_documents
        WHERE embedding_json <> ''
        """
    ).fetchall()
    scored = []
    for r in rows:
        try:
            vec = json.loads(r["embedding_json"])
        except (ValueError, TypeError):
            continue
        score = _cosine(qvec, vec)
        scored.append({
            "entity_type": r["entity_type"],
            "entity_key": r["entity_key"],
            "title": r["title"],
            "score": round(score, 4),
            "snippet": (r["text"] or "")[:240],
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    items = scored[:limit]
    company_keys = [x["entity_key"] for x in items if x["entity_type"] == "company"]
    emails: list[str] = []
    if company_keys:
        placeholders = ",".join("?" for _ in company_keys)
        emails = [
            r["email"]
            for r in conn.execute(
                f"""
                SELECT DISTINCT ct.email
                FROM contacts ct
                JOIN companies co ON co.id = ct.company_id
                WHERE co.canonical_key IN ({placeholders})
                """,
                company_keys,
            ).fetchall()
            if r["email"]
        ]
    return {"ok": True, "items": items, "emails": emails, "count": len(emails)}
