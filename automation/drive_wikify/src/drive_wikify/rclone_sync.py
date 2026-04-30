from __future__ import annotations

import shlex
import subprocess
from pathlib import Path


def build_rclone_copy_command(
    remote: str,
    remote_path: str,
    mirror_root: Path,
    bwlimit: str = "1M",
    tpslimit: float = 1.0,
    checkers: int = 1,
    transfers: int = 1,
    exclude_patterns: list[str] | None = None,
    allowed_file_types: list[str] | None = None,
) -> list[str]:
    source = f"{remote}:" if not remote_path else f"{remote}:{remote_path}"
    cmd = [
        "rclone",
        "copy",
        source,
        str(mirror_root),
        "--checkers",
        str(checkers),
        "--transfers",
        str(transfers),
        "--tpslimit",
        str(tpslimit),
        "--tpslimit-burst",
        "1",
        "--bwlimit",
        bwlimit,
        "--max-backlog",
        "100",
        "--drive-pacer-min-sleep",
        "1s",
        # Native hwp/hwpx files are copied as-is by rclone copy.
        # This option only controls Google Docs/Sheets/Slides export formats.
        "--drive-export-formats",
        "docx,xlsx,pptx,pdf,svg",
        "--metadata",
        "--create-empty-src-dirs",
        "--use-server-modtime",
        "--log-level",
        "INFO",
        "--progress",
        "--stats",
        "10s",
        "--stats-one-line",
        "--stats-file-name-length",
        "80",
    ]
    for pattern in exclude_patterns or []:
        if pattern.strip():
            cmd.extend(["--filter", f"- {pattern.strip()}"])
    if allowed_file_types:
        cmd.extend(["--filter", "+ */"])
    for suffix in allowed_file_types or []:
        normalized = suffix.strip().lower().lstrip(".")
        if not normalized or normalized in {"gdoc", "gsheet", "gslides"}:
            continue
        cmd.extend(["--filter", f"+ *.{normalized}"])
        cmd.extend(["--filter", f"+ **/*.{normalized}"])
        upper = normalized.upper()
        if upper != normalized:
            cmd.extend(["--filter", f"+ *.{upper}"])
            cmd.extend(["--filter", f"+ **/*.{upper}"])
    if allowed_file_types:
        cmd.extend(["--filter", "- *"])
    return cmd


def run_rclone_copy(
    remote: str,
    remote_path: str,
    mirror_root: Path,
    bwlimit: str = "1M",
    tpslimit: float = 1.0,
    checkers: int = 1,
    transfers: int = 1,
    exclude_patterns: list[str] | None = None,
    allowed_file_types: list[str] | None = None,
    dry_run: bool = False,
) -> None:
    mirror_root.mkdir(parents=True, exist_ok=True)
    cmd = build_rclone_copy_command(
        remote=remote,
        remote_path=remote_path,
        mirror_root=mirror_root,
        bwlimit=bwlimit,
        tpslimit=tpslimit,
        checkers=checkers,
        transfers=transfers,
        exclude_patterns=exclude_patterns,
        allowed_file_types=allowed_file_types,
    )
    if dry_run:
        print(" ".join(shlex.quote(part) for part in cmd), flush=True)
        return
    subprocess.run(cmd, check=True)
