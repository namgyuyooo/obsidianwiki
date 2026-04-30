from __future__ import annotations

import json
import os
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


def _load_yaml_with_lists(path: Path):
    lines = path.read_text(encoding="utf-8").splitlines()
    root: dict = {}
    stack: list[tuple[int, object]] = [(-1, root)]

    for index, raw_line in enumerate(lines):
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        line = raw_line.strip()

        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]

        if line.startswith("- "):
            if not isinstance(parent, list):
                raise ValueError(f"Invalid list entry near: {raw_line}")
            parent.append(_parse_scalar(line[2:]))
            continue

        if ":" not in line:
            raise ValueError(f"Unsupported YAML line: {raw_line}")
        key, remainder = line.split(":", 1)
        key = key.strip()
        remainder = remainder.strip()

        if remainder:
            if not isinstance(parent, dict):
                raise ValueError(f"Invalid mapping near: {raw_line}")
            parent[key] = _parse_scalar(remainder)
            continue

        next_non_empty = ""
        for candidate in lines[index + 1 :]:
            if candidate.strip() and not candidate.lstrip().startswith("#"):
                next_non_empty = candidate
                break
        next_container: object = {}
        if next_non_empty:
            next_indent = len(next_non_empty) - len(next_non_empty.lstrip(" "))
            if next_non_empty.strip().startswith("- ") and next_indent > indent:
                next_container = []

        if not isinstance(parent, dict):
            raise ValueError(f"Invalid nesting near: {raw_line}")
        parent[key] = next_container
        stack.append((indent, next_container))

    return root


def _load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        values[key] = value
    return values


def _as_bool(raw: str | bool | None, default: bool = False) -> bool:
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _as_int(raw: str | int | None, default: int) -> int:
    if raw is None or raw == "":
        return default
    if isinstance(raw, int):
        return raw
    return int(raw)


def _as_float(raw: str | float | int | None, default: float) -> float:
    if raw is None or raw == "":
        return default
    if isinstance(raw, (int, float)):
        return float(raw)
    return float(raw)


def _as_list(raw: str | list[str] | None, default: list[str]) -> list[str]:
    if raw is None:
        return list(default)
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    return [item.strip() for item in raw.split(",") if item.strip()]


def _require_string(payload: dict[str, str], key: str) -> str:
    value = payload.get(key, "").strip()
    if not value:
        raise ValueError(f"Missing required setting: {key}")
    return value


def _resolve_config_path(base: Path, value: str) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (base / path).resolve()


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
    chunk_size_min_chars: int = 8000
    chunk_size_max_chars: int = 15000
    state_dir: Path | None = None
    lock_file: Path | None = None
    auto_create_project_space: bool = True
    cleanup_processed_files: bool = False
    deletion_log: Path | None = None
    drive_delete_source: bool = False
    rclone_remote: str | None = None
    rclone_remote_path: str | None = None
    rclone_mirror_root: Path | None = None
    rclone_bwlimit: str = "1M"
    rclone_tpslimit: float = 1.0
    rclone_checkers: int = 1
    rclone_transfers: int = 1
    rclone_exclude_patterns: list[str] = field(default_factory=list)
    drive_name: str | None = None
    manifest_path: Path | None = None
    run_output_path: Path | None = None
    slack_token: str | None = None
    slack_workspace_name: str | None = None
    slack_export_root: Path | None = None
    slack_state_path: Path | None = None
    slack_channel_types: list[str] = field(default_factory=list)
    slack_channels: list[str] = field(default_factory=list)
    slack_history_limit: int = 200
    slack_oldest_days: int = 30
    slack_include_threads: bool = True
    slack_include_files: bool = True

    @staticmethod
    def repo_root() -> Path:
        configured = os.environ.get("WIKI_OPS_REPO_ROOT")
        if configured:
            return Path(configured).expanduser().resolve()
        return Path(__file__).resolve().parents[4]

    @staticmethod
    def default_env_path() -> Path:
        configured = os.environ.get("DRIVE_WIKIFY_ENV") or os.environ.get("WIKI_OPS_ENV_FILE")
        if configured:
            return Path(configured).expanduser().resolve()
        return RuntimeConfig.repo_root() / "automation" / "drive_wikify" / "config" / ".env"

    @classmethod
    def load(cls, path: Path | None = None) -> "RuntimeConfig":
        env_path = path.resolve() if path else cls.default_env_path()
        if env_path.suffix == ".yaml":
            return cls.from_legacy_file(env_path)
        if env_path.suffix == ".json":
            return cls.from_legacy_file(env_path)
        return cls.from_env_file(env_path)

    @classmethod
    def from_env_file(cls, path: Path) -> "RuntimeConfig":
        base = cls.repo_root()
        payload = _load_dotenv(path)
        payload.update({key: value for key, value in os.environ.items() if key in payload or key.startswith(("RCLONE_", "WIKI_", "L1_", "COVERAGE_", "LOG_", "STATE_", "LOCK_", "DELETION_", "AUTO_", "CLEANUP_", "MAX_", "CHUNK_", "ALLOWED_", "DRIVE_", "MANIFEST_", "RUN_", "SLACK_"))})

        drive_delete_source = _as_bool(payload.get("DRIVE_DELETE_SOURCE"), default=False)
        if drive_delete_source:
            raise ValueError("Unsafe setting detected: DRIVE_DELETE_SOURCE must remain false. Source Google Drive deletion is not supported.")

        return cls(
            wiki_root=_resolve_config_path(base, _require_string(payload, "WIKI_ROOT")),
            l1_memory_root=_resolve_config_path(base, payload.get("L1_MEMORY_ROOT", "obsidian/L1_memory")),
            coverage_tracker=_resolve_config_path(base, _require_string(payload, "COVERAGE_TRACKER")),
            log_page=_resolve_config_path(base, _require_string(payload, "LOG_PAGE")),
            allowed_file_types=_as_list(
                payload.get("ALLOWED_FILE_TYPES"),
                ["hwp", "hwpx", "pdf", "docx", "pptx", "html", "htm", "gdoc", "gslides"],
            ),
            max_folders_per_run=_as_int(payload.get("MAX_FOLDERS_PER_RUN"), 3),
            max_files_per_folder=_as_int(payload.get("MAX_FILES_PER_FOLDER"), 50),
            max_fetch_docs=_as_int(payload.get("MAX_FETCH_DOCS"), 3),
            chunk_size_min_chars=_as_int(payload.get("CHUNK_SIZE_MIN_CHARS"), 8000),
            chunk_size_max_chars=_as_int(payload.get("CHUNK_SIZE_MAX_CHARS"), 15000),
            state_dir=_resolve_config_path(base, payload["STATE_DIR"]) if payload.get("STATE_DIR") else None,
            lock_file=_resolve_config_path(base, payload["LOCK_FILE"]) if payload.get("LOCK_FILE") else None,
            auto_create_project_space=_as_bool(payload.get("AUTO_CREATE_PROJECT_SPACE"), True),
            cleanup_processed_files=_as_bool(payload.get("CLEANUP_LOCAL_MIRROR"), False),
            deletion_log=_resolve_config_path(base, payload["DELETION_LOG"]) if payload.get("DELETION_LOG") else None,
            drive_delete_source=drive_delete_source,
            rclone_remote=payload.get("RCLONE_REMOTE"),
            rclone_remote_path=payload.get("RCLONE_REMOTE_PATH"),
            rclone_mirror_root=_resolve_config_path(base, payload["RCLONE_MIRROR_ROOT"]) if payload.get("RCLONE_MIRROR_ROOT") else None,
            rclone_bwlimit=payload.get("RCLONE_BWLIMIT", "1M"),
            rclone_tpslimit=_as_float(payload.get("RCLONE_TPSLIMIT"), 1.0),
            rclone_checkers=_as_int(payload.get("RCLONE_CHECKERS"), 1),
            rclone_transfers=_as_int(payload.get("RCLONE_TRANSFERS"), 1),
            rclone_exclude_patterns=_as_list(
                payload.get("RCLONE_EXCLUDE_PATTERNS"),
                ["Github/**", "GitHub/**", "github/**", "Obsidian_wiki/**", "obsidianwiki/**"],
            ),
            drive_name=payload.get("DRIVE_NAME"),
            manifest_path=_resolve_config_path(base, payload["MANIFEST_PATH"]) if payload.get("MANIFEST_PATH") else None,
            run_output_path=_resolve_config_path(base, payload["RUN_OUTPUT_PATH"]) if payload.get("RUN_OUTPUT_PATH") else None,
            slack_token=payload.get("SLACK_BOT_TOKEN") or payload.get("SLACK_USER_TOKEN"),
            slack_workspace_name=payload.get("SLACK_WORKSPACE_NAME"),
            slack_export_root=_resolve_config_path(base, payload.get("SLACK_EXPORT_ROOT", "obsidian/raw/exports/slack")),
            slack_state_path=_resolve_config_path(base, payload.get("SLACK_STATE_PATH", "automation/wiki_api/runtime/slack_collection_state.json")),
            slack_channel_types=_as_list(payload.get("SLACK_CHANNEL_TYPES"), ["public_channel", "private_channel"]),
            slack_channels=_as_list(payload.get("SLACK_CHANNELS"), []),
            slack_history_limit=_as_int(payload.get("SLACK_HISTORY_LIMIT"), 200),
            slack_oldest_days=_as_int(payload.get("SLACK_OLDEST_DAYS"), 30),
            slack_include_threads=_as_bool(payload.get("SLACK_INCLUDE_THREADS"), default=True),
            slack_include_files=_as_bool(payload.get("SLACK_INCLUDE_FILES"), default=True),
        )

    @classmethod
    def from_legacy_file(cls, path: Path) -> "RuntimeConfig":
        if path.suffix == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
        else:
            data = _load_yaml_with_lists(path)
        payload = data["drive_wikify"]
        base = path.parent.parent.parent.parent
        runtime = payload.get("runtime", {})
        batch = payload.get("batch", {})
        extraction = payload.get("extraction", {})
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
            chunk_size_min_chars=extraction.get("chunk_size_min_chars", 8000),
            chunk_size_max_chars=extraction.get("chunk_size_max_chars", 15000),
            state_dir=(base / runtime["state_dir"]).resolve() if runtime.get("state_dir") else None,
            lock_file=(base / runtime["lock_file"]).resolve() if runtime.get("lock_file") else None,
            auto_create_project_space=project_decision.get("auto_create_project_space", True),
            cleanup_processed_files=runtime.get("cleanup_processed_files", False),
            deletion_log=(base / runtime["deletion_log"]).resolve() if runtime.get("deletion_log") else None,
            drive_delete_source=False,
        )
