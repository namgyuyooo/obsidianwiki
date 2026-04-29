from __future__ import annotations

import json
from pathlib import Path


ALLOWED_SUFFIXES = {".hwp", ".hwpx", ".pdf", ".docx", ".pptx"}


def build_manifest(root: Path, drive_name: str, output_path: Path) -> int:
    documents = []
    for file_path in sorted(root.rglob("*")):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in ALLOWED_SUFFIXES:
            continue
        relative_parent = file_path.parent.relative_to(root)
        folder_path = "/" if str(relative_parent) == "." else f"/{relative_parent}".replace("//", "/")
        stat = file_path.stat()
        documents.append(
            {
                "drive_name": drive_name,
                "folder_path": folder_path,
                "file_path": str(file_path),
                "title": file_path.name,
                "modified_time": str(int(stat.st_mtime)),
            }
        )

    output_path.write_text(
        json.dumps({"documents": documents}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return len(documents)
