from __future__ import annotations

import os
from importlib.resources import files
from pathlib import Path


def packaged_default_env_path() -> Path:
    return Path(str(files("rtm_slack_channel_collector").joinpath("config/collector.env")))


def load_env_file(path: Path, *, override: bool = False) -> None:
    if not path.exists():
        return
    for raw_line in path.expanduser().read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        key, value = line.split("=", 1)
        key = key.strip()
        value = _strip_quotes(value.strip())
        if override:
            os.environ[key] = value
        else:
            os.environ.setdefault(key, value)


def load_packaged_defaults() -> None:
    load_env_file(packaged_default_env_path(), override=False)


def _strip_quotes(value: str) -> str:
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value
