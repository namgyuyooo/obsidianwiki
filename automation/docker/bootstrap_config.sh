#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config_dir="${repo_root}/docker/config"
rclone_dir="${config_dir}/rclone"

mkdir -p "${rclone_dir}"

if [[ -f "${repo_root}/automation/drive_wikify/config/.env" ]]; then
  cp "${repo_root}/automation/drive_wikify/config/.env" "${config_dir}/drive_wikify.env"
  echo "Copied local Drive Wikify env to docker/config/drive_wikify.env"
else
  cp "${repo_root}/automation/drive_wikify/config/drive_wikify.docker.example.env" "${config_dir}/drive_wikify.env"
  echo "Created docker/config/drive_wikify.env from Docker example"
fi

python3 - "${config_dir}/drive_wikify.env" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
overrides = {
    "DRIVE_DELETE_SOURCE": "false",
    "STATE_DIR": "/data/drive_wikify/runtime",
    "LOCK_FILE": "/data/drive_wikify/runtime/drive_wikify.lock",
    "DELETION_LOG": "/data/drive_wikify/runtime/deletion_log.jsonl",
    "RCLONE_MIRROR_ROOT": "/data/drive_wikify/runtime/mirror",
    "MANIFEST_PATH": "/data/drive_wikify/runtime/manifest.json",
    "RUN_OUTPUT_PATH": "/data/drive_wikify/runtime/run_output.json",
}
lines = path.read_text(encoding="utf-8").splitlines()
seen = set()
next_lines = []
for line in lines:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in line:
        next_lines.append(line)
        continue
    key = line.split("=", 1)[0].strip()
    if key in overrides:
        next_lines.append(f"{key}={overrides[key]}")
        seen.add(key)
    else:
        next_lines.append(line)
for key, value in overrides.items():
    if key not in seen and not any(item.split("=", 1)[0].strip() == key for item in next_lines if "=" in item and not item.strip().startswith("#")):
        next_lines.append(f"{key}={value}")
path.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")
PY
echo "Normalized Docker runtime paths in docker/config/drive_wikify.env"

if [[ -f "${HOME}/.config/rclone/rclone.conf" ]]; then
  cp "${HOME}/.config/rclone/rclone.conf" "${rclone_dir}/rclone.conf"
  echo "Copied rclone config to docker/config/rclone/rclone.conf"
else
  touch "${rclone_dir}/rclone.conf"
  echo "Created empty docker/config/rclone/rclone.conf"
  echo "Run: rclone config --config docker/config/rclone/rclone.conf"
fi

echo "Config files under docker/config are intentionally ignored by git."
