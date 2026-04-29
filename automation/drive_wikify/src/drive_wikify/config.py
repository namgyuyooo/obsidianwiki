from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


def _parse_scalar(raw: str):
    value = raw.strip()
    if value in {"true", "True"}:
        return True
    if value in {"false", "False"}:
        return False
    if value.isdigit():
        return int(value)
    try:
        if "." in value:
            return float(value)
    except ValueError:
        pass
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1]
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1]
    return value


def _load_simple_yaml(path: Path):
    root: dict = {}
    stack: list[tuple[int, object]] = [(-1, root)]

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        line = raw_line.strip()

        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]

        if line.startswith("- "):
            value = _parse_scalar(line[2:])
            if not isinstance(parent, list):
                raise ValueError(f"Invalid YAML structure near: {raw_line}")
            parent.append(value)
            continue

        if ":" not in line:
            raise ValueError(f"Unsupported YAML line: {raw_line}")
        key, remainder = line.split(":", 1)
        key = key.strip()
        remainder = remainder.strip()

        if remainder:
            value = _parse_scalar(remainder)
            if isinstance(parent, dict):
                parent[key] = value
            else:
                raise ValueError(f"Invalid YAML mapping near: {raw_line}")
            continue

        next_container: object
        next_container = {}

        if isinstance(parent, dict):
            parent[key] = next_container
        else:
            raise ValueError(f"Invalid YAML nesting near: {raw_line}")

        stack.append((indent, next_container))

        # Detect list container by looking ahead is intentionally omitted.
        # This parser repairs list-typed keys after initial load.

    return root


def _repair_yaml_lists(obj):
    if isinstance(obj, dict):
        fixed = {}
        for key, value in obj.items():
            repaired = _repair_yaml_lists(value)
            if repaired == {} and key in {
                "allowed_file_types",
                "require_full_text_for",
                "create_new_project_if",
            }:
                repaired = []
            fixed[key] = repaired
        return fixed
    return obj


def _load_yaml_with_lists(path: Path):
    lines = path.read_text(encoding="utf-8").splitlines()
    root: dict = {}
    stack: list[tuple[int, object, str | None]] = [(-1, root, None)]

    for raw_line in lines:
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        line = raw_line.strip()

        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent, parent_key = stack[-1][1], stack[-1][2]

        if line.startswith("- "):
            if not isinstance(parent, list):
                raise ValueError(f"Invalid list entry near: {raw_line}")
            parent.append(_parse_scalar(line[2:]))
            continue

        key, remainder = line.split(":", 1)
        key = key.strip()
        remainder = remainder.strip()

        if remainder:
            if not isinstance(parent, dict):
                raise ValueError(f"Invalid mapping near: {raw_line}")
            parent[key] = _parse_scalar(remainder)
            continue

        next_non_empty = ""
        for candidate in lines[lines.index(raw_line) + 1 :]:
            if candidate.strip() and not candidate.lstrip().startswith("#"):
                next_non_empty = candidate
                break
        next_container: object = []
        if next_non_empty:
            next_indent = len(next_non_empty) - len(next_non_empty.lstrip(" "))
            next_container = [] if next_non_empty.strip().startswith("- ") and next_indent > indent else {}

        if not isinstance(parent, dict):
            raise ValueError(f"Invalid nesting near: {raw_line}")
        parent[key] = next_container
        stack.append((indent, next_container, key))

    return root


@dataclass
class RuntimeConfig:
    wiki_root: Path
    l1_memory_root: Path
    coverage_tracker: Path
    log_page: Path
    allowed_file_types: list[str] = field(default_factory=list)
    max_folders_per_run: int = 3
    max_files_per_folder: int = 20
    max_fetch_docs: int = 3
    state_dir: Path | None = None
    lock_file: Path | None = None
    auto_create_project_space: bool = True
    cleanup_processed_files: bool = False
    deletion_log: Path | None = None

    @classmethod
    def from_file(cls, path: Path) -> "RuntimeConfig":
        if path.suffix == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
        else:
            data = _load_yaml_with_lists(path)
        payload = data["drive_wikify"]
        base = path.parent.parent.parent.parent
        runtime = payload.get("runtime", {})
        batch = payload.get("batch", {})
        project_decision = payload.get("project_decision", {})
        return cls(
            wiki_root=(base / payload["wiki_root"]).resolve(),
            l1_memory_root=(base / payload.get("l1_memory_root", "obsidian/L1_memory")).resolve(),
            coverage_tracker=(base / payload["coverage_tracker"]).resolve(),
            log_page=(base / payload["log_page"]).resolve(),
            allowed_file_types=payload.get("allowed_file_types", []),
            max_folders_per_run=batch.get("max_folders_per_run", 3),
            max_files_per_folder=batch.get("max_files_per_folder", 20),
            max_fetch_docs=batch.get("max_fetch_docs", 3),
            state_dir=(base / runtime["state_dir"]).resolve() if runtime.get("state_dir") else None,
            lock_file=(base / runtime["lock_file"]).resolve() if runtime.get("lock_file") else None,
            auto_create_project_space=project_decision.get("auto_create_project_space", True),
            cleanup_processed_files=runtime.get("cleanup_processed_files", False),
            deletion_log=(base / runtime["deletion_log"]).resolve() if runtime.get("deletion_log") else None,
        )
