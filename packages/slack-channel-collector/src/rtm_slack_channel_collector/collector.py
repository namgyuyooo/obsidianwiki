from __future__ import annotations

import json
import os
import ssl
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

try:  # Python 3.11+
    from datetime import UTC
except ImportError:  # Python 3.10 compatibility
    UTC = timezone.utc
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from .env import load_packaged_defaults


DEFAULT_CHANNEL = "tf_cross_team_sales"
DEFAULT_CHANNEL_ID = "C01L5SA4Y4C"
DEFAULT_WORKSPACE = "RTM Slack"
KST = ZoneInfo("Asia/Seoul")


class SlackApiError(RuntimeError):
    def __init__(self, method: str, error_code: str):
        super().__init__(f"Slack API error at {method}: {error_code}")
        self.method = method
        self.error_code = error_code


@dataclass(frozen=True)
class CollectionConfig:
    token: str
    output_root: Path
    state_path: Path
    channel: str = DEFAULT_CHANNEL
    channel_id: str = ""
    workspace: str = DEFAULT_WORKSPACE
    lookback_hours: int = 24
    limit: int = 5000
    include_threads: bool = True
    include_files: bool = True
    schedule_time: str = "00:00"
    timezone: str = "Asia/Seoul"
    api_min_interval_seconds: float = 1.2
    page_pause_seconds: float = 1.0
    thread_pause_seconds: float = 1.0
    glm_api_url: str = ""
    glm_api_key: str = ""
    glm_model: str = ""
    glm_slack_filter_model: str = ""
    glm_slack_filter_max_tokens: int = 1200

    @classmethod
    def from_env(cls, require_token: bool = True) -> "CollectionConfig":
        load_packaged_defaults()
        token = os.environ.get("SLACK_BOT_TOKEN") or os.environ.get("SLACK_USER_TOKEN") or os.environ.get("SLACK_TOKEN") or ""
        if require_token and not token.strip():
            raise ValueError("Missing SLACK_BOT_TOKEN, SLACK_USER_TOKEN, or SLACK_TOKEN")
        channel = _first_env("SLACK_COLLECT_CHANNEL", "SLACK_CHANNELS", default=DEFAULT_CHANNEL).split(",", 1)[0]
        return cls(
            token=token.strip(),
            output_root=Path(_first_env("SLACK_COLLECT_OUTPUT_ROOT", "SLACK_EXPORT_ROOT", default="data/slack")).expanduser().resolve(),
            state_path=Path(_first_env("SLACK_COLLECT_STATE_PATH", "SLACK_STATE_PATH", default="data/slack_state.json")).expanduser().resolve(),
            channel=channel.strip().lstrip("#") or DEFAULT_CHANNEL,
            channel_id=os.environ.get("SLACK_COLLECT_CHANNEL_ID", DEFAULT_CHANNEL_ID).strip(),
            workspace=os.environ.get("SLACK_WORKSPACE_NAME", DEFAULT_WORKSPACE).strip() or DEFAULT_WORKSPACE,
            lookback_hours=int(_first_env("SLACK_COLLECT_LOOKBACK_HOURS", default=str(int(os.environ.get("SLACK_OLDEST_DAYS", "1")) * 24))),
            limit=int(_first_env("SLACK_COLLECT_LIMIT", "SLACK_HISTORY_LIMIT", default="5000")),
            include_threads=_env_bool("SLACK_COLLECT_INCLUDE_THREADS", _env_bool("SLACK_INCLUDE_THREADS", True)),
            include_files=_env_bool("SLACK_COLLECT_INCLUDE_FILES", _env_bool("SLACK_INCLUDE_FILES", True)),
            schedule_time=os.environ.get("SLACK_COLLECT_SCHEDULE_TIME", "00:00").strip() or "00:00",
            timezone=os.environ.get("SLACK_COLLECT_TIMEZONE", "Asia/Seoul").strip() or "Asia/Seoul",
            api_min_interval_seconds=float(_first_env("SLACK_COLLECT_API_MIN_INTERVAL_SECONDS", "SLACK_API_MIN_INTERVAL_SECONDS", default="1.2")),
            page_pause_seconds=float(_first_env("SLACK_COLLECT_PAGE_PAUSE_SECONDS", "SLACK_HISTORY_PAGE_PAUSE_SECONDS", default="1.0")),
            thread_pause_seconds=float(_first_env("SLACK_COLLECT_THREAD_PAUSE_SECONDS", "SLACK_THREAD_PAUSE_SECONDS", default="1.0")),
            glm_api_url=os.environ.get("GLM_API_URL", "").strip(),
            glm_api_key=os.environ.get("GLM_API_KEY", "").strip(),
            glm_model=os.environ.get("GLM_MODEL", "").strip(),
            glm_slack_filter_model=os.environ.get("GLM_SLACK_FILTER_MODEL", "").strip(),
            glm_slack_filter_max_tokens=int(os.environ.get("GLM_SLACK_FILTER_MAX_TOKENS", "1200") or "1200"),
        )


class SlackClient:
    def __init__(self, token: str, min_interval_seconds: float = 1.2):
        self.token = token
        self.min_interval_seconds = max(0.0, min_interval_seconds)
        self._last_request_at = 0.0

    def request(self, method: str, params: dict[str, Any] | None = None, max_retries: int = 6) -> dict[str, Any]:
        query = urlencode({key: value for key, value in (params or {}).items() if value not in (None, "")})
        url = f"https://slack.com/api/{method}"
        if query:
            url = f"{url}?{query}"
        request = Request(url, headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/x-www-form-urlencoded"})
        attempt = 0
        while True:
            self._pause_before_request()
            try:
                with _open_url(request, timeout=30) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                self._last_request_at = time.monotonic()
            except HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")
                if exc.code == 429 and attempt < max_retries:
                    wait_seconds = max(1, int(exc.headers.get("Retry-After", "5") if exc.headers else "5"))
                    time.sleep(wait_seconds)
                    attempt += 1
                    continue
                raise RuntimeError(f"Slack API HTTP {exc.code} at {method}: {body}") from exc
            except URLError as exc:
                raise RuntimeError(f"Slack API connection failed at {method}: {exc.reason}") from exc

            if payload.get("ok"):
                return payload
            if payload.get("error") == "ratelimited" and attempt < max_retries:
                time.sleep(min(30, 2**attempt))
                attempt += 1
                continue
            raise SlackApiError(method, str(payload.get("error", "unknown_error")))

    def _pause_before_request(self) -> None:
        if self.min_interval_seconds <= 0:
            return
        elapsed = time.monotonic() - self._last_request_at
        if 0 < elapsed < self.min_interval_seconds:
            time.sleep(self.min_interval_seconds - elapsed)


def collect_once(
    config: CollectionConfig,
    dry_run: bool = False,
    on_progress: "Callable[[str], None] | None" = None,
) -> dict[str, Any]:
    def _p(msg: str) -> None:
        if on_progress:
            try:
                on_progress(msg)
            except Exception:  # noqa: BLE001 - progress must never break collection
                pass

    client = SlackClient(config.token, config.api_min_interval_seconds)
    state = _load_state(config.state_path)
    channel = _resolve_channel(client, config)
    _p(f"채널 확인 완료: #{channel.get('name', '?')} ({channel['id']})")
    oldest_ts, latest_ts, window_mode = _history_window(config, state, channel["id"])
    _p(f"히스토리 조회 시작 (mode={window_mode}, limit={config.limit or '무제한'})")
    messages, fetch_stats = _fetch_history(
        client, channel["id"], oldest_ts, latest_ts, config.limit,
        config.page_pause_seconds, on_progress=_p,
    )
    _p(f"히스토리 {len(messages)}건 수집 · {fetch_stats.get('pages', 0)}페이지 → 정규화/스레드 시작")
    normalized_messages = []
    thread_fetches = 0
    total = len(messages)
    for idx, message in enumerate(messages, 1):
        normalized = _normalize_message(message, include_files=config.include_files)
        if config.include_threads and normalized.get("reply_count"):
            try:
                replies = _fetch_thread_replies(client, channel["id"], normalized["ts"])
            except SlackApiError:
                replies = []
            normalized["thread_replies"] = [_normalize_message(reply, include_files=config.include_files) for reply in replies]
            thread_fetches += 1
            if thread_fetches % 10 == 0:
                _p(f"스레드 댓글 수집 중… {thread_fetches}건 (메시지 {idx}/{total})")
            if config.thread_pause_seconds > 0:
                time.sleep(config.thread_pause_seconds)
        normalized_messages.append(normalized)
    _p(f"정규화 완료 · 총 {len(normalized_messages)}건 (스레드 {thread_fetches}개)")

    now = datetime.now(tz=UTC)
    export_relpath = f"{now.astimezone(KST).strftime('%Y-%m-%d')}/{channel['name']}_{channel['id']}_{now.strftime('%Y-%m-%dT%H-%M-%SZ')}.json"
    export_path = config.output_root / export_relpath
    payload = {
        "type": "slack_channel_json_export",
        "workspace": config.workspace,
        "collected_at": now.isoformat(),
        "channel": channel,
        "history_window": {
            "mode": window_mode,
            "oldest_ts": oldest_ts,
            "latest_ts": latest_ts,
            "lookback_hours": config.lookback_hours,
            "message_order": "newest_first",
            "limit": config.limit,
            "include_threads": config.include_threads,
            "include_files": config.include_files,
            "fetch_stats": fetch_stats,
        },
        "messages": normalized_messages,
        "runtime_config": _public_runtime_config(config),
    }

    result = {
        "status": "previewed" if dry_run else "completed",
        "workspace": config.workspace,
        "channel_id": channel["id"],
        "channel_name": channel["name"],
        "message_count": len(normalized_messages),
        "export_path": str(export_path),
        "state_path": str(config.state_path),
        "latest_message_ts": normalized_messages[0]["ts"] if normalized_messages else state.get("channels", {}).get(channel["id"], {}).get("latest_message_ts", ""),
        "dry_run": dry_run,
    }
    if dry_run:
        return {**result, "sample_payload": payload}

    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    state_channels = state.setdefault("channels", {})
    previous_latest = state_channels.get(channel["id"], {}).get("latest_message_ts", "")
    latest_message_ts = result["latest_message_ts"]
    state_channels[channel["id"]] = {
        "channel_id": channel["id"],
        "name": channel["name"],
        "last_collected_at": now.isoformat(),
        "latest_message_ts": _newer_ts(str(latest_message_ts), str(previous_latest)),
        "last_export_path": str(export_path),
        "message_count": len(normalized_messages),
    }
    state["last_run_at"] = now.isoformat()
    state["workspace"] = config.workspace
    _write_state(config.state_path, state)
    return result


def seconds_until_next_run(schedule_time: str = "00:00", timezone_name: str = "Asia/Seoul", now: datetime | None = None) -> float:
    tz = ZoneInfo(timezone_name)
    current = now.astimezone(tz) if now else datetime.now(tz=tz)
    hour_text, minute_text = schedule_time.split(":", 1)
    hour = int(hour_text)
    minute = int(minute_text)
    if hour == 24 and minute == 0:
        hour = 0
    if hour not in range(0, 24) or minute not in range(0, 60):
        raise ValueError("schedule_time must be HH:MM, using 00:00 through 23:59; 24:00 is accepted as 00:00")
    target = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= current:
        target += timedelta(days=1)
    return max(0.0, (target - current).total_seconds())


def run_forever(config: CollectionConfig, dry_run: bool = False) -> None:
    while True:
        wait_seconds = seconds_until_next_run(config.schedule_time, config.timezone)
        print(f"Next Slack collection in {int(wait_seconds)} seconds at {config.schedule_time} {config.timezone}", flush=True)
        time.sleep(wait_seconds)
        result = collect_once(config, dry_run=dry_run)
        print(json.dumps(result, ensure_ascii=False), flush=True)


def _resolve_channel(client: SlackClient, config: CollectionConfig) -> dict[str, Any]:
    if config.channel_id:
        payload = client.request("conversations.info", {"channel": config.channel_id})
        return _normalize_channel(payload.get("channel", {}))

    cursor = ""
    while True:
        payload = client.request(
            "conversations.list",
            {
                "types": "public_channel,private_channel",
                "exclude_archived": "true",
                "limit": 999,
                "cursor": cursor,
            },
        )
        for channel in payload.get("channels", []):
            if str(channel.get("name", "")).lower() == config.channel.lower().lstrip("#"):
                return _normalize_channel(channel)
        cursor = payload.get("response_metadata", {}).get("next_cursor", "")
        if not cursor:
            break
    raise ValueError(f"Slack channel not found: {config.channel}")


def _fetch_history(
    client: SlackClient,
    channel_id: str,
    oldest_ts: str,
    latest_ts: str,
    limit: int,
    page_pause_seconds: float,
    on_progress: "Callable[[str], None] | None" = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    cursor = ""
    messages: list[dict[str, Any]] = []
    pages = 0
    final_has_more = False
    while len(messages) < limit:
        batch_limit = min(200, limit - len(messages))
        params = {
            "channel": channel_id,
            "oldest": oldest_ts,
            "limit": batch_limit,
            "inclusive": "false",
            "cursor": cursor,
        }
        if latest_ts:
            params["latest"] = latest_ts
        try:
            payload = client.request("conversations.history", params)
        except SlackApiError as exc:
            if exc.method == "conversations.history" and exc.error_code == "not_in_channel":
                client.request("conversations.join", {"channel": channel_id}, max_retries=1)
                payload = client.request("conversations.history", params)
            else:
                raise
        pages += 1
        batch = payload.get("messages", [])
        messages.extend(batch)
        final_has_more = bool(payload.get("has_more"))
        cursor = payload.get("response_metadata", {}).get("next_cursor", "")
        if on_progress:
            try:
                on_progress(f"히스토리 {pages}페이지 · 누적 {len(messages)}건 수집")
            except Exception:  # noqa: BLE001
                pass
        if not cursor or not batch:
            break
        if page_pause_seconds > 0:
            time.sleep(page_pause_seconds)
    return messages, {
        "pages": pages,
        "limit_reached": len(messages) >= limit,
        "exhausted": not cursor and not final_has_more,
        "has_more": bool(cursor or final_has_more),
        "newest_fetched_ts": messages[0].get("ts", "") if messages else "",
        "oldest_fetched_ts": messages[-1].get("ts", "") if messages else "",
        "order": "newest_first",
    }


def _fetch_thread_replies(client: SlackClient, channel_id: str, thread_ts: str) -> list[dict[str, Any]]:
    replies = client.request(
        "conversations.replies",
        {
            "channel": channel_id,
            "ts": thread_ts,
            "limit": 200,
            "inclusive": "true",
        },
    ).get("messages", [])
    return replies[1:] if len(replies) > 1 else []


def _history_window(config: CollectionConfig, state: dict[str, Any], channel_id: str) -> tuple[str, str, str]:
    channel_state = state.get("channels", {}).get(channel_id, {})
    latest_message_ts = channel_state.get("latest_message_ts", "")
    if latest_message_ts:
        try:
            return f"{float(latest_message_ts) - 0.000001:.6f}", "", "incremental"
        except ValueError:
            pass
    since = datetime.now(tz=UTC) - timedelta(hours=max(1, config.lookback_hours))
    return f"{since.timestamp():.6f}", "", "lookback_hours"


def _normalize_channel(channel: dict[str, Any]) -> dict[str, Any]:
    created = channel.get("created")
    return {
        "id": channel.get("id"),
        "name": channel.get("name"),
        "type": "private_channel" if channel.get("is_private") else "public_channel",
        "is_archived": bool(channel.get("is_archived")),
        "is_private": bool(channel.get("is_private")),
        "created": datetime.fromtimestamp(int(created), tz=UTC).isoformat() if created else "",
        "topic": (channel.get("topic") or {}).get("value", ""),
        "purpose": (channel.get("purpose") or {}).get("value", ""),
    }


_TEXT_KEYS = ("text", "value", "title", "pretext", "fallback", "alt_text", "footer", "author_name")


def _flatten_rich_text(message: dict[str, Any]) -> str:
    """봇 메시지(피트페이퍼 등)의 내용은 본문 대신 blocks/attachments/files에 들어있다.
    사람이 읽을 수 있는 문자열(text/value/title/fallback/버튼·링크 텍스트/파일명 등)을
    구조를 재귀적으로 훑어 순서대로 수집한다. URL/ID 잡음은 최소화."""
    parts: list[str] = []
    seen: set[str] = set()

    def _add(s: Any) -> None:
        if not isinstance(s, str):
            return
        v = s.strip()
        if not v or v in seen:
            return
        # 순수 URL/멘션만이면 스킵
        if v.startswith("http") and " " not in v:
            return
        seen.add(v)
        parts.append(v)

    def _walk(obj: Any) -> None:
        if isinstance(obj, dict):
            # Slack text object {type, text}
            for k in _TEXT_KEYS:
                val = obj.get(k)
                if isinstance(val, str):
                    _add(val)
                elif isinstance(val, dict):
                    _add(val.get("text"))
            # attachment fields: title/value 쌍은 라벨\n값 형태로
            for fld in obj.get("fields", []) or []:
                if isinstance(fld, dict):
                    t = (fld.get("title") or "").strip()
                    val = fld.get("text") or fld.get("value") or ""
                    if t and val:
                        _add(f"*{t}*\n{val}")
            # 파일명 (첨부 브로슈어 등)
            for f in obj.get("files", []) or []:
                if isinstance(f, dict):
                    _add(f.get("title") or f.get("name"))
            # 하위 구조 재귀
            for key in ("blocks", "elements", "attachments", "accessory"):
                if key in obj:
                    _walk(obj[key])
        elif isinstance(obj, list):
            for item in obj:
                _walk(item)

    _walk({"blocks": message.get("blocks"), "attachments": message.get("attachments"),
           "files": message.get("files")})
    return "\n".join(parts)


def _normalize_message(message: dict[str, Any], include_files: bool = True) -> dict[str, Any]:
    base_text = message.get("text", "") or ""
    rich = _flatten_rich_text(message)
    # 원문 text가 비어있거나 짧으면 rich를 합쳐 실제 내용을 보존
    if rich and rich not in base_text:
        text = (base_text + "\n" + rich).strip() if base_text.strip() else rich
    else:
        text = base_text
    normalized = {
        "ts": message.get("ts"),
        "type": message.get("type"),
        "subtype": message.get("subtype"),
        "user": message.get("user") or message.get("bot_id") or "",
        "text": text,
        "thread_ts": message.get("thread_ts", ""),
        "reply_count": message.get("reply_count", 0),
        "reply_users": message.get("reply_users", []),
        "latest_reply": message.get("latest_reply", ""),
        "reactions": message.get("reactions", []),
        "edited": message.get("edited"),
    }
    if include_files:
        normalized["files"] = [_normalize_file(item) for item in message.get("files", [])]
    return normalized


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


def _open_url(request: Request, timeout: int):
    try:
        return urlopen(request, timeout=timeout)
    except URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
            fallback_context = ssl._create_unverified_context()
            return urlopen(request, timeout=timeout, context=fallback_context)
        raise


def _newer_ts(left: str, right: str) -> str:
    try:
        return left if float(left or 0) >= float(right or 0) else right
    except ValueError:
        return left or right


def _env_bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _first_env(*keys: str, default: str) -> str:
    for key in keys:
        value = os.environ.get(key)
        if value is not None and value.strip() != "":
            return value
    return default


def _public_runtime_config(config: CollectionConfig) -> dict[str, Any]:
    return {
        "schedule_time": config.schedule_time,
        "timezone": config.timezone,
        "lookback_hours": config.lookback_hours,
        "limit": config.limit,
        "include_threads": config.include_threads,
        "include_files": config.include_files,
        "glm": {
            "api_url_configured": bool(config.glm_api_url),
            "api_key_configured": bool(config.glm_api_key),
            "model": config.glm_model,
            "slack_filter_model": config.glm_slack_filter_model,
            "slack_filter_max_tokens": config.glm_slack_filter_max_tokens,
            "used_by_collector": False,
        },
    }
