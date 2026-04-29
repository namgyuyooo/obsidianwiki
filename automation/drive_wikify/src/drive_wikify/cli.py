from __future__ import annotations

import argparse
from pathlib import Path

from .config import RuntimeConfig
from .manifest_builder import build_manifest
from .rclone_sync import run_rclone_copy
from .runner import DriveWikifyRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run Drive-to-wiki local automation batch.")
    parser.add_argument(
        "--env-file",
        default=str(RuntimeConfig.default_env_path()),
        help="Path to the .env settings file. Defaults to automation/drive_wikify/config/.env.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Process a local manifest into wiki updates.")
    run_parser.add_argument("--config", help="Deprecated legacy YAML/JSON config file.")
    run_parser.add_argument("--manifest", help="Path to local manifest JSON file.")
    run_parser.add_argument("--output", help="Optional output JSON report path.")

    manifest_parser = subparsers.add_parser("build-manifest", help="Build a manifest from a local mirror path.")
    manifest_parser.add_argument("--root", help="Mirror root to scan.")
    manifest_parser.add_argument("--drive-name", help="Logical drive name for manifest entries.")
    manifest_parser.add_argument("--output", help="Output manifest JSON path.")

    sync_parser = subparsers.add_parser("rclone-copy", help="Run conservative rclone copy into a local mirror.")
    sync_parser.add_argument("--remote", help="Configured rclone remote name.")
    sync_parser.add_argument("--remote-path", help="Source path inside the remote.")
    sync_parser.add_argument("--mirror-root", help="Local destination root.")
    sync_parser.add_argument("--bwlimit", help="Bandwidth limit, e.g. 1M.")
    sync_parser.add_argument("--tpslimit", type=float, help="HTTP transactions per second.")
    sync_parser.add_argument("--checkers", type=int, help="Parallel checkers.")
    sync_parser.add_argument("--transfers", type=int, help="Parallel transfers.")
    sync_parser.add_argument("--dry-run", action="store_true", help="Print command without changing files.")
    return parser


def _required_path(value: str | None, config_value: Path | None, label: str) -> Path:
    if value:
        return Path(value).resolve()
    if config_value:
        return config_value.resolve()
    raise ValueError(f"Missing required path: {label}")


def _required_string(value: str | None, config_value: str | None, label: str) -> str:
    if value is not None:
        return value
    if config_value is not None:
        return config_value
    raise ValueError(f"Missing required setting: {label}")


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        config_path = Path(args.config).resolve() if getattr(args, "config", None) else Path(args.env_file).resolve()
        config = RuntimeConfig.load(config_path)
    except ValueError as exc:
        parser.exit(2, f"error: {exc}\n")
    if args.command == "run":
        runner = DriveWikifyRunner(config)
        try:
            manifest_path = _required_path(args.manifest, config.manifest_path, "MANIFEST_PATH or --manifest")
            output_path = Path(args.output).resolve() if args.output else config.run_output_path
        except ValueError as exc:
            parser.exit(2, f"error: {exc}\n")
        results = runner.run(manifest_path, output_path.resolve() if output_path else None)
        passed = sum(1 for result in results if result.validation.passed)
        print(f"Processed {len(results)} documents; validation passed for {passed}.")
        for result in results:
            print(f"- {result.record.file_path.name}: {result.decision.action} -> {result.decision.project_name}")
            if result.validation.issues:
                for issue in result.validation.issues:
                    print(f"  validation issue: {issue}")
        return 0

    if args.command == "build-manifest":
        try:
            root = _required_path(args.root, config.rclone_mirror_root, "RCLONE_MIRROR_ROOT or --root")
            drive_name = _required_string(args.drive_name, config.drive_name or config.rclone_remote_path, "DRIVE_NAME or --drive-name")
            output = _required_path(args.output, config.manifest_path, "MANIFEST_PATH or --output")
        except ValueError as exc:
            parser.exit(2, f"error: {exc}\n")
        count = build_manifest(root, drive_name, output, config.allowed_file_types)
        print(f"Manifest written with {count} documents.")
        return 0

    if args.command == "rclone-copy":
        try:
            run_rclone_copy(
                remote=_required_string(args.remote, config.rclone_remote, "RCLONE_REMOTE or --remote"),
                remote_path=_required_string(args.remote_path, config.rclone_remote_path, "RCLONE_REMOTE_PATH or --remote-path"),
                mirror_root=_required_path(args.mirror_root, config.rclone_mirror_root, "RCLONE_MIRROR_ROOT or --mirror-root"),
                bwlimit=args.bwlimit or config.rclone_bwlimit,
                tpslimit=args.tpslimit if args.tpslimit is not None else config.rclone_tpslimit,
                checkers=args.checkers if args.checkers is not None else config.rclone_checkers,
                transfers=args.transfers if args.transfers is not None else config.rclone_transfers,
                exclude_patterns=config.rclone_exclude_patterns,
                dry_run=args.dry_run,
            )
        except ValueError as exc:
            parser.exit(2, f"error: {exc}\n")
        return 0

    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
