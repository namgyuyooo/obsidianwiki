from __future__ import annotations

import argparse
from pathlib import Path

from .config import RuntimeConfig
from .manifest_builder import build_manifest
from .rclone_sync import run_rclone_copy
from .runner import DriveWikifyRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run Drive-to-wiki local automation batch.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Process a local manifest into wiki updates.")
    run_parser.add_argument("--config", required=True, help="Path to pipeline config file.")
    run_parser.add_argument("--manifest", required=True, help="Path to local manifest JSON file.")
    run_parser.add_argument("--output", help="Optional output JSON report path.")

    manifest_parser = subparsers.add_parser("build-manifest", help="Build a manifest from a local mirror path.")
    manifest_parser.add_argument("--root", required=True, help="Mirror root to scan.")
    manifest_parser.add_argument("--drive-name", required=True, help="Logical drive name for manifest entries.")
    manifest_parser.add_argument("--output", required=True, help="Output manifest JSON path.")

    sync_parser = subparsers.add_parser("rclone-copy", help="Run conservative rclone copy into a local mirror.")
    sync_parser.add_argument("--remote", required=True, help="Configured rclone remote name.")
    sync_parser.add_argument("--remote-path", required=True, help="Source path inside the remote.")
    sync_parser.add_argument("--mirror-root", required=True, help="Local destination root.")
    sync_parser.add_argument("--bwlimit", default="1M", help="Bandwidth limit, e.g. 1M.")
    sync_parser.add_argument("--tpslimit", type=float, default=1.0, help="HTTP transactions per second.")
    sync_parser.add_argument("--checkers", type=int, default=1, help="Parallel checkers.")
    sync_parser.add_argument("--transfers", type=int, default=1, help="Parallel transfers.")
    sync_parser.add_argument("--dry-run", action="store_true", help="Print command without changing files.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "run":
        config = RuntimeConfig.from_file(Path(args.config).resolve())
        runner = DriveWikifyRunner(config)
        results = runner.run(Path(args.manifest).resolve(), Path(args.output).resolve() if args.output else None)
        passed = sum(1 for result in results if result.validation.passed)
        print(f"Processed {len(results)} documents; validation passed for {passed}.")
        for result in results:
            print(f"- {result.record.file_path.name}: {result.decision.action} -> {result.decision.project_name}")
            if result.validation.issues:
                for issue in result.validation.issues:
                    print(f"  validation issue: {issue}")
        return 0

    if args.command == "build-manifest":
        count = build_manifest(Path(args.root).resolve(), args.drive_name, Path(args.output).resolve())
        print(f"Manifest written with {count} documents.")
        return 0

    if args.command == "rclone-copy":
        run_rclone_copy(
            remote=args.remote,
            remote_path=args.remote_path,
            mirror_root=Path(args.mirror_root).resolve(),
            bwlimit=args.bwlimit,
            tpslimit=args.tpslimit,
            checkers=args.checkers,
            transfers=args.transfers,
            dry_run=args.dry_run,
        )
        return 0

    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
