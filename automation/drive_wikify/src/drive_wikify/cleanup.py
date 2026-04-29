from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .models import ProcessedDocument


def cleanup_processed_file(result: ProcessedDocument, deletion_log: Path | None = None) -> str:
    file_path = result.record.file_path
    if not result.validation.passed:
        return "skipped_validation_failed"
    if not file_path.exists():
        return "already_missing"

    file_path.unlink()
    _remove_empty_parents(file_path.parent)

    if deletion_log:
        deletion_log.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "deleted_file": str(file_path),
            "project_name": result.decision.project_name,
            "source_title": result.record.title or file_path.name,
        }
        with deletion_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return "deleted_local_mirror"


def _remove_empty_parents(start: Path) -> None:
    current = start
    while current.exists():
        try:
            next(current.iterdir())
            break
        except StopIteration:
            current.rmdir()
            current = current.parent
