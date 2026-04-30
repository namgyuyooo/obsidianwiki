from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import RuntimeConfig


def _require_slack_token(config: RuntimeConfig) -> str:
    token = (config.slack_token or "").strip()
    if not token:
        raise ValueError("Missing required setting: SLACK_BOT_TOKEN or SLACK_USER_TOKEN")
    return token


def _slack_request(token: str, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    query = urlencode({key: value for key, value in (params or {}).items() if value not in (None, "")})
    url = f"https://slack.com/api/{method}"
    if query:
        url = f"{url}?{query}"
    request = Request(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Slack API HTTP {exc.code} at {method}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"Slack API connection failed at {method}: {exc.reason}") from exc
    if not payload.get("ok"):
        raise RuntimeError(f"Slack API error at {method}: {payload.get('error', 'unknown_error')}")
    return payload


def _paginate(token: str, method: str, params: dict[str, Any] | None = None, items_key: str = "channels") -> list[dict[str, Any]]:
    cursor = ""
    items: list[dict[str, Any]] = []
    while True:
        request_params = dict(params or {})
        if cursor:
            request_params["cursor"] = cursor
        payload = _slack_request(token, method, request_params)
        items.extend(payload.get(items_key, []))
        cursor = payload.get("response_metadata", {}).get("next_cursor", "")
        if not cursor:
            return items


def _channel_type_filter(channel: dict[str, Any]) -> str:
    if channel.get("is_private"):
        return "private_channel"
    return "public_channel"


def _normalize_channel(channel: dict[str, Any]) -> dict[str, Any]:
    created = channel.get("created")
    created_iso = ""
    if created:
        created_iso = datetime.fromtimestamp(int(created), tz=UTC).isoformat()
    return {
        "id": channel.get("id"),
        "name": channel.get("name"),
        "type": _channel_type_filter(channel),
        "is_archived": bool(channel.get("is_archived")),
        "is_private": bool(channel.get("is_private")),
        "created": created_iso,
        "topic": (channel.get("topic") or {}).get("value", ""),
        "purpose": (channel.get("purpose") or {}).get("value", ""),
        "member_count": channel.get("num_members"),
    }


def list_channels(
    config: RuntimeConfig,
    query: str = "",
    include_archived: bool = False,
    limit: int = 200,
    channel_types: list[str] | None = None,
) -> dict[str, Any]:
    token = _require_slack_token(config)
    channels = _paginate(
        token,
        "conversations.list",
        {
            "types": ",".join(channel_types or config.slack_channel_types or ["public_channel", "private_channel"]),
            "exclude_archived": "false" if include_archived else "true",
            "limit": min(max(int(limit), 1), 999),
        },
    )
    normalized = [_normalize_channel(channel) for channel in channels]
    query_text = query.strip().lower()
    if query_text:
        normalized = [
            channel
            for channel in normalized
            if query_text in (channel.get("name") or "").lower()
            or query_text in (channel.get("topic") or "").lower()
            or query_text in (channel.get("purpose") or "").lower()
        ]
    normalized.sort(key=lambda item: ((item.get("name") or "").lower(), item.get("id") or ""))
    return {
        "workspace": config.slack_workspace_name or "",
        "query": query,
        "count": len(normalized[:limit]),
        "channels": normalized[:limit],
    }


def _normalize_file(file_item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": file_item.get("id"),
        "name": file_item.get("name"),
        "title": file_item.get("title"),
        "mimetype": file_item.get("mimetype"),
        "filetype": file_item.get("filetype"),
        "pretty_type": file_item.get("pretty_type"),
        "size": file_item.get("size"),
        "url_private": file_item.get("url_private"),
        "permalink": file_item.get("permalink"),
    }


def _normalize_message(message: dict[str, Any], include_files: bool = True) -> dict[str, Any]:
    normalized = {
        "ts": message.get("ts"),
        "type": message.get("type"),
        "subtype": message.get("subtype"),
        "user": message.get("user") or message.get("bot_id") or "",
        "text": message.get("text", ""),
        "thread_ts": message.get("thread_ts", ""),
        "reply_count": message.get("reply_count", 0),
        "reply_users": message.get("reply_users", []),
        "latest_reply": message.get("latest_reply", ""),
        "reactions": message.get("reactions", []),
        "edited": message.get("edited"),
    }
    if include_files:
        normalized["files"] = [_normalize_file(file_item) for file_item in message.get("files", [])]
    return normalized


def _resolve_channel_selection(config: RuntimeConfig, channel_selectors: list[str] | None) -> list[dict[str, Any]]:
    available = list_channels(config, limit=1000).get("channels", [])
    selector_values = [item.strip() for item in (channel_selectors or config.slack_channels) if item and item.strip()]
    if not selector_values:
        return available
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for selector in selector_values:
        target = selector.lstrip("#")
        match = next(
            (
                channel
                for channel in available
                if channel.get("id") == target or (channel.get("name") or "").lower() == target.lower()
            ),
            None,
        )
        if match and match["id"] not in seen:
            selected.append(match)
            seen.add(match["id"])
    return selected


def _load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"channels": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"channels": {}}
    if not isinstance(payload, dict):
        return {"channels": {}}
    if not isinstance(payload.get("channels"), dict):
        payload["channels"] = {}
    return payload


def _write_state(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _history_oldest_ts(config: RuntimeConfig, channel_id: str, state: dict[str, Any], oldest_days: int | None) -> str:
    channel_state = (state.get("channels") or {}).get(channel_id, {})
    latest_ts = channel_state.get("latest_message_ts", "")
    if latest_ts:
        try:
            return f"{float(latest_ts) - 0.000001:.6f}"
        except ValueError:
            pass
    days = oldest_days if oldest_days is not None else config.slack_oldest_days
    since = datetime.now(tz=UTC) - timedelta(days=max(1, int(days)))
    return f"{since.timestamp():.6f}"


def _fetch_channel_messages(
    token: str,
    channel_id: str,
    oldest_ts: str,
    limit_per_channel: int,
) -> list[dict[str, Any]]:
    cursor = ""
    messages: list[dict[str, Any]] = []
    while len(messages) < limit_per_channel:
        batch_limit = min(200, limit_per_channel - len(messages))
        payload = _slack_request(
            token,
            "conversations.history",
            {
                "channel": channel_id,
                "oldest": oldest_ts,
                "limit": batch_limit,
                "inclusive": "false",
                "cursor": cursor,
            },
        )
        batch = payload.get("messages", [])
        messages.extend(batch)
        cursor = payload.get("response_metadata", {}).get("next_cursor", "")
        if not cursor or not batch:
            break
        time.sleep(0.1)
    return list(reversed(messages))


def _fetch_thread_replies(token: str, channel_id: str, thread_ts: str) -> list[dict[str, Any]]:
    replies = _slack_request(
        token,
        "conversations.replies",
        {
            "channel": channel_id,
            "ts": thread_ts,
            "limit": 200,
            "inclusive": "true",
        },
    ).get("messages", [])
    if len(replies) <= 1:
        return []
    return replies[1:]


def collect_channels(
    config: RuntimeConfig,
    channel_selectors: list[str] | None = None,
    oldest_days: int | None = None,
    limit_per_channel: int | None = None,
    include_threads: bool | None = None,
    include_files: bool | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    token = _require_slack_token(config)
    export_root = (config.slack_export_root or (RuntimeConfig.repo_root() / "obsidian/raw/exports/slack")).resolve()
    state_path = (config.slack_state_path or (RuntimeConfig.repo_root() / "automation/wiki_api/runtime/slack_collection_state.json")).resolve()
    state = _load_state(state_path)
    selected_channels = _resolve_channel_selection(config, channel_selectors)
    if not selected_channels:
        raise ValueError("No Slack channels matched the configured selectors")

    max_messages = max(1, int(limit_per_channel or config.slack_history_limit or 200))
    use_threads = config.slack_include_threads if include_threads is None else include_threads
    use_files = config.slack_include_files if include_files is None else include_files
    run_started_at = datetime.now(tz=UTC)
    run_stamp = run_started_at.strftime("%Y-%m-%dT%H-%M-%SZ")

    exports: list[dict[str, Any]] = []
    channel_states = state.setdefault("channels", {})

    for channel in selected_channels:
        channel_id = channel["id"]
        channel_name = channel["name"]
        oldest_ts = _history_oldest_ts(config, channel_id, state, oldest_days)
        messages = _fetch_channel_messages(token, channel_id, oldest_ts, max_messages)
        normalized_messages: list[dict[str, Any]] = []
        for message in messages:
            normalized = _normalize_message(message, include_files=use_files)
            if use_threads and normalized.get("reply_count", 0):
                replies = _fetch_thread_replies(token, channel_id, normalized["ts"])
                normalized["thread_replies"] = [_normalize_message(reply, include_files=use_files) for reply in replies]
            normalized_messages.append(normalized)
            time.sleep(0.05)

        export_relpath = f"{run_started_at.strftime('%Y-%m-%d')}/{channel_name}_{channel_id}_{run_stamp}.json"
        export_path = export_root / export_relpath
        latest_ts = normalized_messages[-1]["ts"] if normalized_messages else channel_states.get(channel_id, {}).get("latest_message_ts", "")
        export_payload = {
            "type": "slack_channel_export",
            "workspace": config.slack_workspace_name or "",
            "collected_at": run_started_at.isoformat(),
            "channel": channel,
            "history_window": {
                "oldest_ts": oldest_ts,
                "limit_per_channel": max_messages,
                "include_threads": use_threads,
                "include_files": use_files,
            },
            "messages": normalized_messages,
        }
        if not dry_run:
            export_path.parent.mkdir(parents=True, exist_ok=True)
            export_path.write_text(json.dumps(export_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            channel_states[channel_id] = {
                "channel_id": channel_id,
                "name": channel_name,
                "type": channel.get("type"),
                "last_collected_at": run_started_at.isoformat(),
                "latest_message_ts": latest_ts,
                "last_export_path": str(export_path),
                "message_count": len(normalized_messages),
            }
        exports.append(
            {
                "channel_id": channel_id,
                "channel_name": channel_name,
                "type": channel.get("type"),
                "messages": len(normalized_messages),
                "latest_message_ts": latest_ts,
                "export_path": str(export_path),
                "dry_run": dry_run,
            }
        )

    state["last_run_at"] = run_started_at.isoformat()
    state["workspace"] = config.slack_workspace_name or ""
    if not dry_run:
        _write_state(state_path, state)

    return {
        "status": "previewed" if dry_run else "completed",
        "workspace": config.slack_workspace_name or "",
        "export_root": str(export_root),
        "state_path": str(state_path),
        "channel_count": len(exports),
        "exports": exports,
        "started_at": run_started_at.isoformat(),
    }
