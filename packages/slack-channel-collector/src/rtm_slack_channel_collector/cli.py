from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .collector import CollectionConfig, collect_once, run_forever, seconds_until_next_run
from .env import load_env_file, load_packaged_defaults, packaged_default_env_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect #tf_cross_team_sales Slack messages into JSON.")
    parser.add_argument("--channel", default=None, help="Slack channel name. Defaults to tf_cross_team_sales.")
    parser.add_argument("--channel-id", default=None, help="Slack channel ID. Defaults to C01L5SA4Y4C.")
    parser.add_argument("--env-file", default=None, help="Optional dotenv file to load before reading configuration.")
    parser.add_argument("--output-root", default=None, help="Directory where JSON exports are written.")
    parser.add_argument("--state-path", default=None, help="Path for incremental collection state.")
    parser.add_argument("--lookback-hours", type=int, default=None, help="Initial lookback window when no state exists.")
    parser.add_argument("--limit", type=int, default=None, help="Maximum messages per run.")
    parser.add_argument("--schedule-time", default=None, help="Daily schedule time, HH:MM. Defaults to 00:00.")
    parser.add_argument("--timezone", default=None, help="IANA timezone. Defaults to Asia/Seoul.")
    parser.add_argument("--no-threads", action="store_true", help="Skip thread reply expansion.")
    parser.add_argument("--no-files", action="store_true", help="Skip file metadata capture.")
    parser.add_argument("--dry-run", action="store_true", help="Preview payload without writing JSON/state.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument("--print-config", action="store_true", help="Print sanitized effective configuration and exit.")
    parser.add_argument("--schedule", action="store_true", help="Run forever and collect once per day at schedule time.")
    parser.add_argument("--next-run", action="store_true", help="Print seconds until the next scheduled run and exit.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        config = _config_from_args(args, require_token=not (args.print_config or args.next_run))
        if args.print_config:
            _print(_sanitized_config(config), args.json)
            return 0
        if args.next_run:
            payload = {
                "schedule_time": config.schedule_time,
                "timezone": config.timezone,
                "seconds_until_next_run": seconds_until_next_run(config.schedule_time, config.timezone),
            }
            _print(payload, args.json)
            return 0
        if args.schedule:
            run_forever(config, dry_run=args.dry_run)
            return 0
        payload = collect_once(config, dry_run=args.dry_run)
        _print(payload, args.json)
        return 0
    except Exception as exc:  # noqa: BLE001 - CLI boundary should report concise operational errors.
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _config_from_args(args: argparse.Namespace, require_token: bool = True) -> CollectionConfig:
    load_packaged_defaults()
    if args.env_file:
        load_env_file(Path(args.env_file), override=True)
    config = CollectionConfig.from_env(require_token=require_token)
    return CollectionConfig(
        token=config.token,
        output_root=Path(args.output_root).expanduser().resolve() if args.output_root else config.output_root,
        state_path=Path(args.state_path).expanduser().resolve() if args.state_path else config.state_path,
        channel=args.channel if args.channel is not None else config.channel,
        channel_id=args.channel_id if args.channel_id is not None else config.channel_id,
        workspace=config.workspace,
        lookback_hours=args.lookback_hours if args.lookback_hours is not None else config.lookback_hours,
        limit=args.limit if args.limit is not None else config.limit,
        include_threads=False if args.no_threads else config.include_threads,
        include_files=False if args.no_files else config.include_files,
        schedule_time=args.schedule_time if args.schedule_time is not None else config.schedule_time,
        timezone=args.timezone if args.timezone is not None else config.timezone,
        api_min_interval_seconds=config.api_min_interval_seconds,
        page_pause_seconds=config.page_pause_seconds,
        thread_pause_seconds=config.thread_pause_seconds,
        glm_api_url=config.glm_api_url,
        glm_api_key=config.glm_api_key,
        glm_model=config.glm_model,
        glm_slack_filter_model=config.glm_slack_filter_model,
        glm_slack_filter_max_tokens=config.glm_slack_filter_max_tokens,
    )


def _print(payload: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    status = payload.get("status", "ok")
    channel = payload.get("channel_name") or payload.get("schedule_time", "")
    print(f"{status}: {channel}")
    for key in ["message_count", "export_path", "state_path", "seconds_until_next_run"]:
        if key in payload:
            print(f"- {key}: {payload[key]}")

def _sanitized_config(config: CollectionConfig) -> dict:
    return {
        "packaged_default_env": str(packaged_default_env_path()),
        "channel": config.channel,
        "channel_id": config.channel_id,
        "workspace": config.workspace,
        "output_root": str(config.output_root),
        "state_path": str(config.state_path),
        "lookback_hours": config.lookback_hours,
        "limit": config.limit,
        "include_threads": config.include_threads,
        "include_files": config.include_files,
        "schedule_time": config.schedule_time,
        "timezone": config.timezone,
        "api_min_interval_seconds": config.api_min_interval_seconds,
        "page_pause_seconds": config.page_pause_seconds,
        "thread_pause_seconds": config.thread_pause_seconds,
        "slack_token_configured": bool(config.token),
        "glm": {
            "api_url_configured": bool(config.glm_api_url),
            "api_key_configured": bool(config.glm_api_key),
            "model": config.glm_model,
            "slack_filter_model": config.glm_slack_filter_model,
            "slack_filter_max_tokens": config.glm_slack_filter_max_tokens,
            "used_by_collector": False,
        },
    }


if __name__ == "__main__":
    raise SystemExit(main())
