from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import RuntimeConfig
from .manifest_builder import build_manifest
from .rclone_sync import run_rclone_copy
from .runner import DriveWikifyRunner
from .slack_collector import collect_channels, list_channels
from .wiki_maintenance import refresh_global_artifacts, sparse_search


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

    refresh_parser = subparsers.add_parser("refresh-global", help="Rebuild sparse search index and global wiki graph/navigation artifacts.")
    refresh_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")

    search_parser = subparsers.add_parser("sparse-search", help="Run sparse lexical search against the generated wiki index.")
    search_parser.add_argument("query", help="Search query.")
    search_parser.add_argument("--limit", type=int, default=10, help="Maximum number of results to print.")

    sync_parser = subparsers.add_parser("rclone-copy", help="Run conservative rclone copy into a local mirror.")
    sync_parser.add_argument("--remote", help="Configured rclone remote name.")
    sync_parser.add_argument("--remote-path", help="Source path inside the remote.")
    sync_parser.add_argument("--mirror-root", help="Local destination root.")
    sync_parser.add_argument("--bwlimit", help="Bandwidth limit, e.g. 1M.")
    sync_parser.add_argument("--tpslimit", type=float, help="HTTP transactions per second.")
    sync_parser.add_argument("--checkers", type=int, help="Parallel checkers.")
    sync_parser.add_argument("--transfers", type=int, help="Parallel transfers.")
    sync_parser.add_argument("--dry-run", action="store_true", help="Print command without changing files.")

    slack_channels_parser = subparsers.add_parser("slack-channels", help="List accessible Slack channels using the configured Slack token.")
    slack_channels_parser.add_argument("--query", default="", help="Filter channels by name/topic/purpose.")
    slack_channels_parser.add_argument("--limit", type=int, default=200, help="Maximum number of channels to return.")
    slack_channels_parser.add_argument("--include-archived", action="store_true", help="Include archived channels.")
    slack_channels_parser.add_argument("--channel-types", help="Comma-separated Slack channel types, e.g. public_channel,private_channel.")
    slack_channels_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")

    slack_collect_parser = subparsers.add_parser("slack-collect", help="Collect Slack channel history into local raw exports.")
    slack_collect_parser.add_argument("--channel", action="append", dest="channels", help="Slack channel name or ID. Repeat to collect multiple channels.")
    slack_collect_parser.add_argument("--oldest-days", type=int, help="Lookback window in days when no incremental state exists.")
    slack_collect_parser.add_argument("--since-date", help="Collect messages from this KST date, formatted YYYY-MM-DD.")
    slack_collect_parser.add_argument("--until-date", help="Collect messages through this KST date, formatted YYYY-MM-DD.")
    slack_collect_parser.add_argument("--limit-per-channel", type=int, help="Maximum number of messages to fetch per channel.")
    slack_collect_parser.add_argument("--no-threads", action="store_true", help="Skip thread reply expansion.")
    slack_collect_parser.add_argument("--no-files", action="store_true", help="Skip Slack file metadata capture.")
    slack_collect_parser.add_argument("--dry-run", action="store_true", help="Preview what would be exported without writing files.")
    slack_collect_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
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
            extractor = result.extracted.extractor_name or "unknown_extractor"
            print(f"- {result.record.file_path.name}: {result.decision.action} -> {result.decision.project_name} [{extractor}]")
            for warning in result.extracted.warnings:
                print(f"  skill warning: {warning}")
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

    if args.command == "refresh-global":
        payload = refresh_global_artifacts(config)
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print("Global wiki artifacts refreshed.")
            print(f"- Sparse index docs: {payload['sparse_index']['documents']}")
            print(f"- Sparse index terms: {payload['sparse_index']['terms']}")
            print(f"- Graph pages: {payload['graph']['pages']}")
            print(f"- Graph edges: {payload['graph']['edges']}")
            print(f"- Orphan pages: {payload['graph']['orphan_pages']}")
            print(f"- Navigation page: {payload['navigation_page']}")
        return 0

    if args.command == "sparse-search":
        results = sparse_search(config, args.query, args.limit)
        print(f'Sparse search results for "{args.query}" ({len(results)} hits)')
        for index, item in enumerate(results, start=1):
            print(f"{index}. {item['title']} [{item['score']}]")
            print(f"   - path: {item['path']}")
            print(f"   - project: {item['project_key']}")
            print(f"   - terms: {', '.join(item['matched_terms'])}")
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
                allowed_file_types=config.allowed_file_types,
                dry_run=args.dry_run,
            )
        except ValueError as exc:
            parser.exit(2, f"error: {exc}\n")
        return 0

    if args.command == "slack-channels":
        payload = list_channels(
            config,
            query=args.query,
            include_archived=bool(args.include_archived),
            limit=args.limit,
            channel_types=[item.strip() for item in args.channel_types.split(",") if item.strip()] if args.channel_types else None,
        )
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"Slack channels ({payload['count']})")
            for channel in payload["channels"]:
                print(f"- #{channel['name']} ({channel['id']}) [{channel['type']}] archived={channel['is_archived']}")
        return 0

    if args.command == "slack-collect":
        payload = collect_channels(
            config,
            channel_selectors=args.channels,
            oldest_days=args.oldest_days,
            since_date=args.since_date,
            until_date=args.until_date,
            limit_per_channel=args.limit_per_channel,
            include_threads=not args.no_threads,
            include_files=not args.no_files,
            dry_run=bool(args.dry_run),
        )
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"Slack collection {payload['status']} ({payload['channel_count']} channels)")
            for export in payload["exports"]:
                stats = export.get("fetch_stats") or {}
                file_stats = export.get("file_stats") or {}
                promoted_paths = export.get("promoted_paths") or []
                promoted_projects = sorted(
                    {
                        path.split("/")[2]
                        for path in promoted_paths
                        if isinstance(path, str) and path.startswith("obsidian/Wiki/Slack_") and len(path.split("/")) > 2
                    }
                )
                print(
                    f"- #{export['channel_name']} ({export['channel_id']}): {export['messages']} messages"
                    f" · order={stats.get('order', 'newest_first')}"
                    f" · pages={stats.get('pages', '-')}"
                    f" · exhausted={stats.get('exhausted', '-')}"
                    f" · files={file_stats.get('downloaded', 0)} downloaded/{file_stats.get('analyzed', 0)} analyzed"
                    f" · promoted={len(promoted_paths)} docs/{len(promoted_projects)} projects"
                    f" · newest={stats.get('newest_fetched_ts', '')}"
                    f" · oldest={stats.get('oldest_fetched_ts', '')}"
                    f" -> {export['export_path']}"
                )
                if promoted_projects:
                    preview = ", ".join(promoted_projects[:8])
                    suffix = " ..." if len(promoted_projects) > 8 else ""
                    print(f"  projects: {preview}{suffix}")
        return 0

    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
