from __future__ import annotations

import json
from pathlib import Path


ALLOWED_SUFFIXES = {".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv", ".html", ".htm"}
EXCLUDED_PARTS = {
    ".git",
    "node_modules",
    ".obsidian",
    "__pycache__",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    "dist",
    "build",
    ".next",
    ".vite",
}
EXCLUDED_NAMES = {".DS_Store", "Thumbs.db"}


def _is_excluded_path(file_path: Path, root: Path) -> bool:
    try:
        relative_parts = file_path.relative_to(root).parts
    except ValueError:
        relative_parts = file_path.parts
    if any(part in EXCLUDED_PARTS for part in relative_parts):
        return True
    if file_path.name in EXCLUDED_NAMES:
        return True
    normalized = file_path.as_posix()
    if normalized.endswith(("~", ".tmp", ".temp", ".cache")):
        return True
    return any(
        marker in normalized
        for marker in (
            "/automation/wiki_frontend/assistant-ui/assets/",
            "/automation/wiki_frontend/assistant_ui_app/node_modules/",
            "/automation/wiki_api/runtime/",
            "/automation/drive_wikify/runtime/wiki_sparse_index.json",
            "/automation/drive_wikify/runtime/wiki_graph_snapshot.json",
        )
    )


def build_manifest(root: Path, drive_name: str, output_path: Path, allowed_file_types: list[str] | None = None) -> int:
    allowed_suffixes = (
        {f".{item.lower().lstrip('.')}" for item in allowed_file_types}
        if allowed_file_types
        else ALLOWED_SUFFIXES
    )
    documents = []
    for file_path in sorted(root.rglob("*")):
        if not file_path.is_file():
            continue
        if _is_excluded_path(file_path, root):
            continue
        if file_path.suffix.lower() not in allowed_suffixes:
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
