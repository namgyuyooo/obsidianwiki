from __future__ import annotations

import json
import re
import ssl
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import RuntimeConfig


class SlackApiError(RuntimeError):
    def __init__(self, method: str, error_code: str):
        super().__init__(f"Slack API error at {method}: {error_code}")
        self.method = method
        self.error_code = error_code


class SlackThrottle:
    def __init__(self, config: RuntimeConfig):
        self.min_interval_seconds = max(0.0, float(config.slack_api_min_interval_seconds or 0.0))
        self.history_page_pause_seconds = max(0.0, float(config.slack_history_page_pause_seconds or 0.0))
        self.thread_pause_seconds = max(0.0, float(config.slack_thread_pause_seconds or 0.0))
        self.channel_pause_seconds = max(0.0, float(config.slack_channel_pause_seconds or 0.0))
        self.rate_limit_cooldown_seconds = max(0.0, float(config.slack_rate_limit_cooldown_seconds or 0.0))
        self._last_request_monotonic = 0.0

    def before_request(self) -> None:
        if self.min_interval_seconds <= 0:
            return
        now = time.monotonic()
        elapsed = now - self._last_request_monotonic
        if 0 < elapsed < self.min_interval_seconds:
            time.sleep(self.min_interval_seconds - elapsed)

    def after_request(self) -> None:
        self._last_request_monotonic = time.monotonic()

    def cool_down(self, retry_after_seconds: int | float | None = None) -> None:
        wait_seconds = max(float(retry_after_seconds or 0), self.rate_limit_cooldown_seconds)
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        self._last_request_monotonic = time.monotonic()

    def pause_between_history_pages(self) -> None:
        if self.history_page_pause_seconds > 0:
            time.sleep(self.history_page_pause_seconds)

    def pause_between_threads(self) -> None:
        if self.thread_pause_seconds > 0:
            time.sleep(self.thread_pause_seconds)

    def pause_between_channels(self) -> None:
        if self.channel_pause_seconds > 0:
            time.sleep(self.channel_pause_seconds)


def _open_url(request: Request, timeout: int):
    try:
        return urlopen(request, timeout=timeout)
    except URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
            fallback_context = ssl._create_unverified_context()
            return urlopen(request, timeout=timeout, context=fallback_context)
        raise


def _require_slack_token(config: RuntimeConfig) -> str:
    token = (config.slack_token or "").strip()
    if not token:
        raise ValueError("Missing required setting: SLACK_BOT_TOKEN or SLACK_USER_TOKEN")
    return token


def _slack_request(
    token: str,
    method: str,
    params: dict[str, Any] | None = None,
    max_retries: int = 6,
    throttle: SlackThrottle | None = None,
) -> dict[str, Any]:
    query = urlencode({key: value for key, value in (params or {}).items() if value not in (None, "")})
    url = f"https://slack.com/api/{method}"
    if query:
        url = f"{url}?{query}"
    request = Request(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/x-www-form-urlencoded"})
    attempt = 0
    while True:
        if throttle:
            throttle.before_request()
        try:
            with _open_url(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if throttle:
                throttle.after_request()
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code == 429 and attempt < max_retries:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                wait_seconds = max(1, int(retry_after or "5"))
                if throttle:
                    throttle.cool_down(wait_seconds)
                else:
                    time.sleep(wait_seconds)
                attempt += 1
                continue
            raise RuntimeError(f"Slack API HTTP {exc.code} at {method}: {body}") from exc
        except URLError as exc:
            raise RuntimeError(f"Slack API connection failed at {method}: {exc.reason}") from exc
        if payload.get("ok"):
            return payload
        if payload.get("error") == "ratelimited" and attempt < max_retries:
            wait_seconds = min(30, 2 ** attempt)
            if throttle:
                throttle.cool_down(wait_seconds)
            else:
                time.sleep(wait_seconds)
            attempt += 1
            continue
        raise SlackApiError(method, payload.get("error", "unknown_error"))


def _paginate(
    token: str,
    method: str,
    params: dict[str, Any] | None = None,
    items_key: str = "channels",
    throttle: SlackThrottle | None = None,
) -> list[dict[str, Any]]:
    cursor = ""
    items: list[dict[str, Any]] = []
    while True:
        request_params = dict(params or {})
        if cursor:
            request_params["cursor"] = cursor
        payload = _slack_request(token, method, request_params, throttle=throttle)
        items.extend(payload.get(items_key, []))
        cursor = payload.get("response_metadata", {}).get("next_cursor", "")
        if not cursor:
            return items
        if throttle:
            throttle.pause_between_history_pages()


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


def _relative_repo_path(path: Path | None) -> str:
    if not path:
        return ""
    try:
        return str(path.resolve().relative_to(RuntimeConfig.repo_root()))
    except ValueError:
        return str(path.resolve())


def _channel_matches_prefix(name: str, prefixes: list[str]) -> bool:
    lowered = (name or "").strip().lower()
    return any(lowered.startswith(prefix.strip().lower()) for prefix in prefixes if prefix and prefix.strip())


def _channel_has_project_identity(name: str, topic: str, purpose: str) -> tuple[bool, str]:
    lowered_name = (name or "").strip().lower()
    channel_text = " ".join([name, topic, purpose]).lower()
    project_name_patterns = [
        r"(?:^|[-_])pjt(?:[-_]|$)",
        r"(?:^|[-_])project(?:[-_]|$)",
        r"(?:^|[-_])poc(?:[-_]|$)",
        r"(?:^|[-_])voucher(?:[-_]|$)",
        r"(?:^|[-_])과제(?:[-_]|$)",
        r"(?:^|[-_])고객(?:[-_]|$)",
    ]
    for pattern in project_name_patterns:
        if re.search(pattern, lowered_name):
            return True, "project_name_pattern"
    if any(keyword in channel_text for keyword in ["프로젝트", "고객", "poc", "voucher", "바우처", "현장", "제안", "과제", "요구사항", "납품"]):
        return True, "project_topic_keywords"
    return False, ""


def _channel_routing_profile(config: RuntimeConfig, channel: dict[str, Any]) -> dict[str, Any]:
    name = channel.get("name", "") or ""
    topic = channel.get("topic", "") or ""
    purpose = channel.get("purpose", "") or ""
    project_root = config.slack_project_wiki_root or (RuntimeConfig.repo_root() / "obsidian/Wiki/Common/Slack_Project_Intake")
    company_root = config.slack_company_wiki_root or (RuntimeConfig.repo_root() / "obsidian/Wiki/Common/Slack_Company_News")
    has_project_identity, project_rationale = _channel_has_project_identity(name, topic, purpose)

    if _channel_matches_prefix(name, config.slack_project_channel_prefixes):
        bucket = "project"
        mode = "project_updates"
        rationale = "project_channel_prefix"
        target_root = project_root
    elif has_project_identity:
        bucket = "project"
        mode = "project_updates"
        rationale = project_rationale
        target_root = project_root
    elif _channel_matches_prefix(name, config.slack_mixed_channel_prefixes):
        bucket = "mixed"
        mode = "mixed_triage"
        rationale = "mixed_channel_prefix"
        target_root = project_root
    elif _channel_matches_prefix(name, config.slack_company_channel_prefixes):
        bucket = "company_news"
        mode = "company_updates"
        rationale = "company_channel_prefix"
        target_root = company_root
    else:
        bucket = "company_news"
        mode = "company_updates"
        rationale = "default_company_updates"
        target_root = company_root

    return {
        "channel_bucket": bucket,
        "conversation_mode": mode,
        "rationale": rationale,
        "wiki_workspace": "rtm",
        "wiki_target_root": _relative_repo_path(target_root),
        "wiki_target_kind": "common" if "Common" in str(target_root) else "project",
    }


def list_channels(
    config: RuntimeConfig,
    query: str = "",
    include_archived: bool = False,
    limit: int = 200,
    channel_types: list[str] | None = None,
) -> dict[str, Any]:
    token = _require_slack_token(config)
    throttle = SlackThrottle(config)
    channels = _paginate(
        token,
        "conversations.list",
        {
            "types": ",".join(channel_types or config.slack_channel_types or ["public_channel", "private_channel"]),
            "exclude_archived": "false" if include_archived else "true",
            "limit": min(max(int(limit), 1), 999),
        },
        throttle=throttle,
    )
    normalized = []
    for channel in channels:
        item = _normalize_channel(channel)
        item["routing"] = _channel_routing_profile(config, item)
        normalized.append(item)
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


def _message_text(message: dict[str, Any]) -> str:
    return " ".join(
        part.strip()
        for part in [
            str(message.get("text", "") or ""),
            " ".join(file_item.get("title", "") or "" for file_item in message.get("files", []) if isinstance(file_item, dict)),
        ]
        if part and part.strip()
    ).strip()


def _default_wiki_target(channel_profile: dict[str, Any], bucket: str) -> str:
    if bucket == "project":
        project_root = channel_profile.get("project_wiki_target_root")
        if project_root:
            return str(project_root)
    if bucket == "company_news":
        company_root = channel_profile.get("company_wiki_target_root")
        if company_root:
            return str(company_root)
    return str(channel_profile.get("wiki_target_root", ""))


def _local_message_routing(channel_profile: dict[str, Any], message: dict[str, Any]) -> dict[str, Any]:
    subtype = str(message.get("subtype", "") or "")
    text = _message_text(message)
    if subtype in {"channel_join", "channel_leave"}:
        return {"keep": False, "bucket": "casual", "reason": "system_membership_event", "wiki_target": ""}
    if not text:
        return {"keep": False, "bucket": "casual", "reason": "empty_text", "wiki_target": ""}
    lowered = text.lower()
    casual_markers = [
        "ㅋㅋ", "ㅎㅎ", "맛집", "점심", "저녁", "테니스", "joined the channel", "has joined the channel",
    ]
    if len(text) < 12 and not message.get("files"):
        return {"keep": False, "bucket": "casual", "reason": "too_short_without_evidence", "wiki_target": ""}
    if any(marker in lowered for marker in casual_markers):
        return {"keep": False, "bucket": "casual", "reason": "casual_or_social", "wiki_target": ""}

    project_markers = [
        "프로젝트", "고객", "미팅", "회의", "poc", "poc", "제안", "견적", "납품", "현장", "바우처", "voucher",
        "일정", "요구사항", "이슈", "검토", "모델", "배포", "개발", "테스트", "성과", "계약",
    ]
    company_markers = [
        "공지", "보도", "홍보", "전시", "행사", "채용", "회사", "리브랜딩", "전사", "인증", "ir", "수상",
        "파트너십", "뉴스레터", "마케팅", "교육", "공지사항",
    ]
    if any(marker in lowered for marker in project_markers):
        return {"keep": True, "bucket": "project", "reason": "project_keywords", "wiki_target": _default_wiki_target(channel_profile, "project")}
    if any(marker in lowered for marker in company_markers):
        return {"keep": True, "bucket": "company_news", "reason": "company_keywords", "wiki_target": _default_wiki_target(channel_profile, "company_news")}

    channel_bucket = channel_profile.get("channel_bucket", "company_news")
    if channel_bucket == "project":
        return {"keep": True, "bucket": "project", "reason": "channel_project_default", "wiki_target": _default_wiki_target(channel_profile, "project")}
    if channel_bucket == "company_news":
        return {"keep": True, "bucket": "company_news", "reason": "channel_company_default", "wiki_target": _default_wiki_target(channel_profile, "company_news")}
    return {"keep": True, "bucket": "company_news", "reason": "mixed_channel_default", "wiki_target": _default_wiki_target(channel_profile, "company_news")}


def _glm_request(config: RuntimeConfig, system_prompt: str, user_payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    if not config.glm_api_url or not config.glm_api_key:
        return None, "missing_glm_credentials"
    body = {
        "model": config.glm_slack_filter_model or config.glm_model or "glm-4.5-air",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        "temperature": 0.1,
        "max_tokens": config.glm_slack_filter_max_tokens or 1200,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
    }
    request = Request(
        config.glm_api_url.rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config.glm_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with _open_url(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return None, f"http_{exc.code}:{detail[:240]}"
    except URLError as exc:
        return None, f"url_error:{exc.reason}"
    except TimeoutError:
        return None, "timeout"
    except json.JSONDecodeError:
        return None, "invalid_json_response"
    try:
        content = payload["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        return json.loads(content), None
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None, "invalid_message_content"


def _glm_filter_channel_messages(config: RuntimeConfig, channel: dict[str, Any], messages: list[dict[str, Any]]) -> dict[str, Any]:
    channel_profile = {
        **_channel_routing_profile(config, channel),
        "project_wiki_target_root": _relative_repo_path(config.slack_project_wiki_root or (RuntimeConfig.repo_root() / "obsidian/Wiki/Common/Slack_Project_Intake")),
        "company_wiki_target_root": _relative_repo_path(config.slack_company_wiki_root or (RuntimeConfig.repo_root() / "obsidian/Wiki/Common/Slack_Company_News")),
    }
    prepared = [
        {
            "id": index,
            "ts": message.get("ts"),
            "subtype": message.get("subtype", ""),
            "text": _message_text(message),
            "has_files": bool(message.get("files")),
            "reply_count": message.get("reply_count", 0),
        }
        for index, message in enumerate(messages)
    ]
    system_prompt = (
        "당신은 Slack 업무 증적 필터다. "
        "채널 대화 중 실제 업무와 관련된 메시지만 남기고, 단순 수다, 친목, 잡담, 출퇴근/식사/취미 대화, "
        "채널 입장/퇴장 같은 시스템 메시지는 제외한다. "
        "업무 메시지는 반드시 project 또는 company_news 로 분류한다. "
        "메시지마다 keep true/false, bucket(project|company_news|casual), 짧은 reason을 판단하고 JSON만 반환한다. "
        "반환 형식은 {\"items\":[{\"id\":0,\"keep\":true,\"bucket\":\"project\",\"reason\":\"...\"}],\"summary\":\"...\"} 이다."
    )
    response, glm_error = _glm_request(
        config,
        system_prompt,
        {
            "channel": {
                "name": channel.get("name"),
                "topic": channel.get("topic", ""),
                "purpose": channel.get("purpose", ""),
                "routing": channel_profile,
            },
            "messages": prepared,
        },
    )
    if not response or not isinstance(response.get("items"), list):
        kept: list[dict[str, Any]] = []
        excluded: list[dict[str, Any]] = []
        for index, message in enumerate(messages):
            decision = _local_message_routing(channel_profile, message)
            record = {
                "id": index,
                "ts": message.get("ts"),
                "reason": decision["reason"],
                "bucket": decision["bucket"],
                "wiki_target": decision["wiki_target"],
                "message": message,
            }
            if decision["keep"]:
                kept.append(record)
            else:
                excluded.append(record)
        return {
            "provider": "local_rule",
            "summary": f"GLM unavailable; local rule filter applied ({glm_error or 'unknown_error'})",
            "error": glm_error or "unknown_error",
            "channel_profile": channel_profile,
            "kept": kept,
            "excluded": excluded,
        }

    decisions = {int(item["id"]): item for item in response["items"] if isinstance(item, dict) and str(item.get("id", "")).isdigit()}
    kept = []
    excluded = []
    for index, message in enumerate(messages):
        decision = decisions.get(index)
        if not decision:
            local = _local_message_routing(channel_profile, message)
            decision = {
                "keep": local["keep"],
                "bucket": local["bucket"],
                "reason": f"fallback:{local['reason']}",
                "wiki_target": local["wiki_target"],
            }
        bucket = str(decision.get("bucket") or "").strip() or ("project" if channel_profile.get("channel_bucket") == "project" else "company_news")
        if bucket not in {"project", "company_news", "casual"}:
            bucket = "company_news"
        record = {
            "id": index,
            "ts": message.get("ts"),
            "reason": decision.get("reason", ""),
            "bucket": bucket,
            "wiki_target": decision.get("wiki_target") or _default_wiki_target(channel_profile, bucket),
            "message": message,
        }
        if decision.get("keep") is True:
            kept.append(record)
        else:
            excluded.append(record)
    return {
        "provider": "glm",
        "summary": response.get("summary", ""),
        "error": "",
        "channel_profile": channel_profile,
        "kept": kept,
        "excluded": excluded,
    }


def _routing_summary(channel_profile: dict[str, Any], filter_result: dict[str, Any]) -> dict[str, Any]:
    bucket_counts = {"project": 0, "company_news": 0, "casual": 0}
    wiki_targets: dict[str, int] = {}
    for item in filter_result.get("kept", []):
        bucket = item.get("bucket", "company_news")
        bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
        target = str(item.get("wiki_target", "") or "").strip()
        if target:
            wiki_targets[target] = wiki_targets.get(target, 0) + 1
    bucket_counts["casual"] = len(filter_result.get("excluded", []))
    if bucket_counts.get("project", 0) == 0 and bucket_counts.get("company_news", 0) == 0:
        primary_bucket = str(channel_profile.get("channel_bucket", "company_news"))
    else:
        primary_bucket = "project" if bucket_counts.get("project", 0) >= bucket_counts.get("company_news", 0) else "company_news"
    if primary_bucket not in {"project", "company_news"}:
        primary_bucket = "company_news"
    if channel_profile.get("channel_bucket") == "mixed" and bucket_counts.get("project", 0) == bucket_counts.get("company_news", 0):
        primary_bucket = "mixed"
    return {
        "channel_profile": channel_profile,
        "primary_bucket": primary_bucket,
        "bucket_counts": bucket_counts,
        "wiki_targets": [{"path": path, "count": count} for path, count in sorted(wiki_targets.items(), key=lambda item: (-item[1], item[0]))],
    }


def _write_filtered_export(
    config: RuntimeConfig,
    channel: dict[str, Any],
    export_relpath: str,
    history_window: dict[str, Any],
    filter_result: dict[str, Any],
    collected_at: str,
) -> Path:
    filter_root = (config.slack_filter_export_root or (RuntimeConfig.repo_root() / "obsidian/raw/exports/slack_filtered")).resolve()
    filtered_path = filter_root / export_relpath
    filtered_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "type": "slack_channel_filtered_export",
        "workspace": config.slack_workspace_name or "",
        "collected_at": collected_at,
        "channel": channel,
        "routing": _routing_summary(filter_result.get("channel_profile", {}), filter_result),
        "history_window": history_window,
        "filter": {
            "provider": filter_result.get("provider"),
            "summary": filter_result.get("summary", ""),
            "error": filter_result.get("error", ""),
            "kept_count": len(filter_result.get("kept", [])),
            "excluded_count": len(filter_result.get("excluded", [])),
        },
        "messages": [item["message"] for item in filter_result.get("kept", [])],
        "routed_messages": [
            {
                "ts": item.get("ts"),
                "bucket": item.get("bucket", ""),
                "reason": item.get("reason", ""),
                "wiki_target": item.get("wiki_target", ""),
                "text": _message_text(item.get("message", {})),
            }
            for item in filter_result.get("kept", [])
        ],
        "excluded_messages": [
            {
                "ts": item.get("ts"),
                "reason": item.get("reason", ""),
                "bucket": item.get("bucket", "casual"),
                "text": _message_text(item.get("message", {})),
                "subtype": item.get("message", {}).get("subtype", ""),
            }
            for item in filter_result.get("excluded", [])
        ],
    }
    filtered_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return filtered_path


def _ensure_markdown_page(path: Path, title: str) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {title}\n", encoding="utf-8")


def _append_unique_block(path: Path, marker: str, heading: str, lines: list[str]) -> bool:
    current = path.read_text(encoding="utf-8") if path.exists() else ""
    if marker in current:
        return False
    block = "\n".join([f"<!-- {marker} -->", f"## {heading}", "", *lines]).rstrip() + "\n"
    path.write_text(current.rstrip() + "\n\n" + block, encoding="utf-8")
    return True


def _message_excerpt(message: dict[str, Any], limit: int = 220) -> str:
    text = " ".join(_message_text(message).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _promote_filtered_export_to_wiki(
    config: RuntimeConfig,
    channel: dict[str, Any],
    export_relpath: str,
    export_path: Path,
    filtered_path: Path,
    history_window: dict[str, Any],
    filter_result: dict[str, Any],
    collected_at: str,
) -> list[str]:
    repo_root = RuntimeConfig.repo_root()
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in filter_result.get("kept", []):
        target = str(item.get("wiki_target", "") or "").strip()
        if not target:
            continue
        grouped.setdefault(target, []).append(item)
    if not grouped:
        return []

    written_paths: list[str] = []
    date_label = collected_at[:10]
    channel_name = channel.get("name", "")
    channel_id = channel.get("id", "")
    provider = filter_result.get("provider", "")
    filter_error = filter_result.get("error", "")
    for rel_target, items in grouped.items():
        target_root = (repo_root / rel_target).resolve()
        _ensure_markdown_page(target_root / "Reference_Register.md", "Reference Register")
        _ensure_markdown_page(target_root / "Sources.md", "Sources")
        _ensure_markdown_page(target_root / "Evidence_Log.md", "Evidence Log")
        _ensure_markdown_page(target_root / "Conflict_Register.md", "Conflict Register")
        _ensure_markdown_page(target_root / "Change_Log.md", "Change Log")
        target_bucket = items[0].get("bucket", "company_news")
        marker = f"slack-promotion:{channel_id}:{export_relpath}:{target_bucket}"
        heading = f"Slack Collect - {date_label} - #{channel_name}"
        reference_lines = [
            "### Reference 01",
            f"- 제목: Slack collect #{channel_name}",
            "- 참조 유형: Slack",
            "- URL: -",
            f"- fallback 파일명: {export_path.name}",
            f"- fallback 경로: Slack 채널 `#{channel_name}` / channel id `{channel_id}`",
            (
                "- 재수집 식별자: "
                f"collection state `automation/wiki_api/runtime/slack_collection_state.json` / "
                f"last_export_path `{_relative_repo_path(export_path)}` / "
                f"last_filtered_export_path `{_relative_repo_path(filtered_path)}` / "
                f"oldest_ts `{history_window.get('oldest_ts', '')}`"
            ),
            "- 설명 위치: [[Evidence_Log]], [[Change_Log]], [[Conflict_Register]]",
            "- 관련 위키 문서: [[Evidence_Log]], [[Change_Log]], [[Conflict_Register]]",
            "- 읽기 상태: system collect promoted",
            (
                f"- 비고: 필터 제공자 `{provider}` / 필터 오류 `{filter_error or 'none'}` / "
                f"대상 버킷 `{target_bucket}` / 반영 메시지 수 `{len(items)}`"
            ),
        ]
        if _append_unique_block(target_root / "Reference_Register.md", marker, heading, reference_lines):
            written_paths.append(_relative_repo_path(target_root / "Reference_Register.md"))

        source_lines = [
            "- 운영 메모: 링크 우선 참조는 [[Reference_Register]]에서 관리",
            f"- 채널: `#{channel_name}` (`{channel_id}`)",
            f"- 수집 시각: `{collected_at}`",
            f"- 수집 기간 시작 ts: `{history_window.get('oldest_ts', '')}`",
            f"- 필터 제공자: `{provider}`",
            f"- 필터 오류: `{filter_error or 'none'}`",
            f"- raw export: `{_relative_repo_path(export_path)}`",
            f"- filtered export: `{_relative_repo_path(filtered_path)}`",
            f"- 대상 버킷: `{target_bucket}`",
            f"- 반영 메시지 수: `{len(items)}`",
        ]
        if _append_unique_block(target_root / "Sources.md", marker, heading, source_lines):
            written_paths.append(_relative_repo_path(target_root / "Sources.md"))

        evidence_lines = []
        for item in items[:12]:
            text = _message_excerpt(item.get("message", {}))
            if not text:
                continue
            evidence_lines.extend(
                [
                    f"- ts: `{item.get('ts', '')}`",
                    f"  - reason: `{item.get('reason', '')}`",
                    f"  - text: {text}",
                ]
            )
        if evidence_lines and _append_unique_block(target_root / "Evidence_Log.md", marker, heading, evidence_lines):
            written_paths.append(_relative_repo_path(target_root / "Evidence_Log.md"))

        conflict_lines = []
        for item in items:
            text = _message_text(item.get("message", {}))
            if re.search(r"충돌|불일치|상충|지연|리스크|보류|미확정", text):
                conflict_lines.append(f"- `{item.get('ts', '')}` { _message_excerpt(item.get('message', {}), 180) }")
        if conflict_lines and _append_unique_block(target_root / "Conflict_Register.md", marker, heading, conflict_lines[:10]):
            written_paths.append(_relative_repo_path(target_root / "Conflict_Register.md"))

        change_lines = [
            f"- Slack filtered export 자동 승격",
            f"- 채널: `#{channel_name}`",
            f"- 버킷: `{target_bucket}`",
            f"- export relpath: `{export_relpath}`",
        ]
        if _append_unique_block(target_root / "Change_Log.md", marker, heading, change_lines):
            written_paths.append(_relative_repo_path(target_root / "Change_Log.md"))
    return written_paths


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
    throttle: SlackThrottle | None = None,
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
            throttle=throttle,
        )
        batch = payload.get("messages", [])
        messages.extend(batch)
        cursor = payload.get("response_metadata", {}).get("next_cursor", "")
        if not cursor or not batch:
            break
        if throttle:
            throttle.pause_between_history_pages()
    return list(reversed(messages))


def _fetch_thread_replies(token: str, channel_id: str, thread_ts: str, throttle: SlackThrottle | None = None) -> list[dict[str, Any]]:
    replies = _slack_request(
        token,
        "conversations.replies",
        {
            "channel": channel_id,
            "ts": thread_ts,
            "limit": 200,
            "inclusive": "true",
        },
        throttle=throttle,
    ).get("messages", [])
    if len(replies) <= 1:
        return []
    return replies[1:]


def _join_channel(token: str, channel_id: str, throttle: SlackThrottle | None = None) -> dict[str, Any]:
    return _slack_request(
        token,
        "conversations.join",
        {
            "channel": channel_id,
        },
        throttle=throttle,
    )


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
    throttle = SlackThrottle(config)
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
    skipped: list[dict[str, Any]] = []
    channel_states = state.setdefault("channels", {})

    for channel in selected_channels:
        channel_id = channel["id"]
        channel_name = channel["name"]
        channel_profile = {
            **_channel_routing_profile(config, channel),
            "project_wiki_target_root": _relative_repo_path(config.slack_project_wiki_root or (RuntimeConfig.repo_root() / "obsidian/Wiki/Common/Slack_Project_Intake")),
            "company_wiki_target_root": _relative_repo_path(config.slack_company_wiki_root or (RuntimeConfig.repo_root() / "obsidian/Wiki/Common/Slack_Company_News")),
        }
        oldest_ts = _history_oldest_ts(config, channel_id, state, oldest_days)
        auto_joined = False
        try:
            messages = _fetch_channel_messages(token, channel_id, oldest_ts, max_messages, throttle=throttle)
        except SlackApiError as exc:
            if exc.error_code == "not_in_channel" and channel.get("type") == "public_channel":
                try:
                    _join_channel(token, channel_id, throttle=throttle)
                    auto_joined = True
                    throttle.pause_between_channels()
                    messages = _fetch_channel_messages(token, channel_id, oldest_ts, max_messages, throttle=throttle)
                except SlackApiError as join_exc:
                    skipped.append(
                        {
                            "channel_id": channel_id,
                            "channel_name": channel_name,
                            "type": channel.get("type"),
                            "reason": join_exc.error_code,
                            "auto_join_attempted": True,
                        }
                    )
                    continue
            else:
                skipped.append(
                    {
                        "channel_id": channel_id,
                        "channel_name": channel_name,
                        "type": channel.get("type"),
                        "reason": exc.error_code,
                    }
                )
                continue
        normalized_messages: list[dict[str, Any]] = []
        for message in messages:
            normalized = _normalize_message(message, include_files=use_files)
            if use_threads and normalized.get("reply_count", 0):
                try:
                    replies = _fetch_thread_replies(token, channel_id, normalized["ts"], throttle=throttle)
                except SlackApiError:
                    replies = []
                normalized["thread_replies"] = [_normalize_message(reply, include_files=use_files) for reply in replies]
                throttle.pause_between_threads()
            normalized_messages.append(normalized)

        export_relpath = f"{run_started_at.strftime('%Y-%m-%d')}/{channel_name}_{channel_id}_{run_stamp}.json"
        export_path = export_root / export_relpath
        latest_ts = normalized_messages[-1]["ts"] if normalized_messages else channel_states.get(channel_id, {}).get("latest_message_ts", "")
        export_payload = {
            "type": "slack_channel_export",
            "workspace": config.slack_workspace_name or "",
            "collected_at": run_started_at.isoformat(),
            "channel": channel,
            "routing": channel_profile,
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
            default_bucket = channel_profile.get("channel_bucket", "company_news")
            if default_bucket == "mixed":
                default_bucket = "company_news"
            filter_result = _glm_filter_channel_messages(config, channel, normalized_messages) if config.slack_filter_with_glm else {
                "provider": "disabled",
                "summary": "GLM filter disabled",
                "channel_profile": channel_profile,
                "kept": [
                    {
                        "id": idx,
                        "ts": msg.get("ts"),
                        "reason": "disabled",
                        "bucket": default_bucket,
                        "wiki_target": _default_wiki_target(channel_profile, default_bucket),
                        "message": msg,
                    }
                    for idx, msg in enumerate(normalized_messages)
                ],
                "excluded": [],
            }
            routing = _routing_summary(channel_profile, filter_result)
            filtered_path = _write_filtered_export(
                config,
                channel,
                export_relpath,
                export_payload["history_window"],
                filter_result,
                run_started_at.isoformat(),
            )
            promoted_paths = _promote_filtered_export_to_wiki(
                config,
                channel,
                export_relpath,
                export_path,
                filtered_path,
                export_payload["history_window"],
                filter_result,
                run_started_at.isoformat(),
            )
            channel_states[channel_id] = {
                "channel_id": channel_id,
                "name": channel_name,
                "type": channel.get("type"),
                "last_collected_at": run_started_at.isoformat(),
                "latest_message_ts": latest_ts,
                "last_export_path": str(export_path),
                "last_filtered_export_path": str(filtered_path),
                "message_count": len(normalized_messages),
                "filtered_message_count": len(filter_result.get("kept", [])),
                "filter_provider": filter_result.get("provider", ""),
                "filter_error": filter_result.get("error", ""),
                "routing": routing,
                "promoted_paths": promoted_paths,
            }
        exports.append(
            {
                "channel_id": channel_id,
                "channel_name": channel_name,
                "type": channel.get("type"),
                "routing": channel_profile,
                "messages": len(normalized_messages),
                "latest_message_ts": latest_ts,
                "export_path": str(export_path),
                "dry_run": dry_run,
                "auto_joined": auto_joined,
                "filtered_export_path": str((config.slack_filter_export_root or (RuntimeConfig.repo_root() / "obsidian/raw/exports/slack_filtered")).resolve() / export_relpath) if not dry_run else "",
                "routing_summary": channel_states.get(channel_id, {}).get("routing", {}),
                "filter_error": channel_states.get(channel_id, {}).get("filter_error", ""),
                "promoted_paths": channel_states.get(channel_id, {}).get("promoted_paths", []),
            }
        )
        throttle.pause_between_channels()

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
        "skipped_count": len(skipped),
        "skipped": skipped,
        "started_at": run_started_at.isoformat(),
    }
