"""FastAPI application for the RTM Customer DB dashboard.

Replaces the stdlib ``serve_api.py`` and the browser-embedded data in
``RTM_고객DB_대시보드.html``. See webapp/README.md for run instructions.
"""
from __future__ import annotations

import json
import os
import threading
import time

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth, glm, queries, semantic, slack_sync, vision, secret_store
from .config import get_settings
from .db import get_conn

_production = os.environ.get("RTM_ENV", "").strip().lower() == "production"
app = FastAPI(
    title="RTM Customer DB API", version="1.0.0",
    docs_url=None if _production else "/docs",
    redoc_url=None if _production else "/redoc",
    openapi_url=None if _production else "/openapi.json",
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def authenticate_api_requests(request: Request, call_next):
    """Backend-enforced auth; the React login gate is not a security boundary."""
    public = {"/api/health", "/api/auth/login"}
    if (
        request.method != "OPTIONS"
        and request.url.path.startswith("/api/")
        and request.url.path not in public
    ):
        try:
            with get_conn() as conn:
                auth.current_actor(conn, request)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


def _guard_change(conn, request: Request, permission: str, label: str, *, source: str = "manual"):
    actor = auth.require_permission(conn, request, permission)
    queries.begin_change(conn, label, actor=actor, source=source)
    return actor


# ── request models ───────────────────────────────────────────────────────────
class CompanyProfileIn(BaseModel):
    display_name: str | None = None
    industry: str | None = None
    sub_industry: str | None = None
    description: str | None = None
    owner: str | None = None
    memo: str | None = None


class ReviewResolveIn(BaseModel):
    action: str = Field(
        "approve", pattern="^(approve|edit|reject|link_existing|register_new|apply_fields)$"
    )
    value: str | None = None
    fields: dict | None = None  # for apply_fields
    company_key: str | None = None  # for link_existing
    company_name: str | None = None  # for register_new
    company_fields: dict | None = None  # optional industry/sub_industry/description


class SyncSettingsIn(BaseModel):
    channels: list[dict] | None = None
    lookback_hours: int | None = None
    sync_limit: int | None = None
    include_relate: bool | None = None
    include_featpaper: bool | None = None
    require_review_for_new_company: bool | None = None
    glm_parse_cross_team: bool | None = None
    slack_callback_enabled: bool | None = None
    slack_callback_mode: str | None = None
    slack_callback_reaction: str | None = None
    auto_sync_enabled: bool | None = None
    auto_sync_interval_minutes: int | None = None
    business_card_batch_size: int | None = Field(None, ge=1, le=100)


class SyncIn(BaseModel):
    export_file: str | None = None
    limit: int | None = None  # collect only the most recent N messages
    backfill: bool = False  # force full history backfill for all channels
    only_channel: str | None = None  # sync a single channel id (e.g. 명함)


class LeadIn(BaseModel):
    email: str
    name: str = ""
    company: str = ""
    department: str = ""
    title: str = ""
    phone: str = ""
    interest: str = ""
    tag: str = ""
    memo: str = ""
    occurred_at: str = ""


class TagsIn(BaseModel):
    tags: list[str] = []


class ActivityIn(BaseModel):
    email: str | None = None
    company_key: str | None = None
    activity_type: str = ""
    solution_name: str = ""
    note: str = ""
    next_action: str = ""
    occurred_at: str = ""


class GlmSearchIn(BaseModel):
    query: str


class SemanticSearchIn(BaseModel):
    query: str
    limit: int = 30


class InferIn(BaseModel):
    context: str = ""


class BatchInferIn(BaseModel):
    limit: int = 30
    min_confidence: float = 0.45


class EmbeddingRebuildIn(BaseModel):
    limit: int = 0


class LoginIn(BaseModel):
    email: str = ""
    password: str = ""
    api_key: str = ""


class AuthUserIn(BaseModel):
    email: str
    name: str = ""
    role: str = "viewer"
    password: str = ""


class AuthUserPatchIn(BaseModel):
    name: str | None = None
    role: str | None = None
    status: str | None = None
    password: str | None = None


class GlmSettingsIn(BaseModel):
    provider: str = Field("glm", pattern="^(glm|ollama|internal)$")
    api_url: str
    model: str
    api_key: str = ""
    clear_api_key: bool = False


class SlackTokenSettingsIn(BaseModel):
    bot_token: str = ""
    clear_bot_token: bool = False


# ── read endpoints ─────────────────────────────────────────────────────────
@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request) -> dict:
    with get_conn() as conn:
        if body.api_key.strip():
            actor = auth.actor_from_token(conn, body.api_key.strip())
            return {"ok": True, "token": body.api_key.strip(), "user": auth.actor_payload(actor)}
        actor, token = auth.login_password(conn, body.email, body.password)
    return {"ok": True, "token": token, "user": auth.actor_payload(actor)}


@app.get("/api/auth/me")
def me(request: Request) -> dict:
    with get_conn() as conn:
        actor = auth.current_actor(conn, request)
        return {"ok": True, "user": auth.actor_payload(actor)}


@app.get("/api/admin/users")
def admin_users(request: Request) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "settings.update")
        return {"items": auth.list_users(conn), "roles": auth.role_permissions(conn)}


@app.post("/api/admin/users")
def admin_create_user(request: Request, body: AuthUserIn) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "settings.update")
        return {"ok": True, "user": auth.create_user(conn, **body.model_dump())}


@app.patch("/api/admin/users/{user_id}")
def admin_update_user(request: Request, user_id: int, body: AuthUserPatchIn) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "settings.update")
        return {"ok": True, "user": auth.update_user(conn, user_id, body.model_dump(exclude_none=True))}


def _glm_admin_payload() -> dict:
    cfg = glm.config()
    key = cfg.get("key", "")
    return {
        "provider": cfg.get("provider", "glm"),
        "api_url": cfg.get("url", ""),
        "model": cfg.get("model", ""),
        "api_key_configured": bool(key),
        "api_key_hint": f"••••{key[-4:]}" if len(key) >= 4 else ("••••" if key else ""),
    }


@app.get("/api/admin/glm-settings")
def admin_glm_settings(request: Request) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "settings.update")
    return _glm_admin_payload()


@app.put("/api/admin/glm-settings")
def admin_save_glm_settings(request: Request, body: GlmSettingsIn) -> dict:
    if not body.api_url.strip().startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="API URL은 http:// 또는 https://로 시작해야 합니다")
    if not body.model.strip():
        raise HTTPException(status_code=400, detail="모델명이 필요합니다")
    if body.provider == "glm" and not (body.api_key.strip() or glm.config().get("key")):
        raise HTTPException(status_code=400, detail="GLM 클라우드는 API 키가 필요합니다")
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "settings.update")
        values = {
            "glm.provider": body.provider,
            "glm.api_url": body.api_url.strip().rstrip("/"),
            "glm.model": body.model.strip(),
        }
        if body.api_key.strip():
            values["glm.api_key"] = secret_store.encrypt(body.api_key.strip())
        elif body.clear_api_key:
            values["glm.api_key"] = ""
        for key, value in values.items():
            conn.execute(
                "INSERT INTO app_runtime_settings(key,value,updated_by) VALUES(?,?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, "
                "updated_at=CURRENT_TIMESTAMP, updated_by=excluded.updated_by",
                (key, value, actor.email),
            )
    return {"ok": True, **_glm_admin_payload()}


@app.post("/api/admin/glm-settings/test")
def admin_test_glm_settings(request: Request) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "settings.update")
    if not glm.is_configured():
        raise HTTPException(status_code=400, detail="연결 정보를 먼저 저장해 주세요")
    try:
        response = glm.chat("Reply with only OK.", "Connection test", max_tokens=8)
        return {"ok": True, "message": "AI 서버 연결에 성공했습니다.", "response": response[:40]}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI 서버 연결 실패: {str(exc)[:160]}")


def _slack_admin_payload() -> dict:
    token = slack_sync._slack_token()
    return {
        "bot_token_configured": bool(token),
        "bot_token_hint": f"••••{token[-4:]}" if len(token) >= 4 else ("••••" if token else ""),
    }


@app.get("/api/admin/slack-settings")
def admin_slack_settings(request: Request) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "settings.update")
    return _slack_admin_payload()


@app.put("/api/admin/slack-settings")
def admin_save_slack_settings(request: Request, body: SlackTokenSettingsIn) -> dict:
    token = body.bot_token.strip()
    if token and not token.startswith(("xoxb-", "xoxp-")):
        raise HTTPException(status_code=400, detail="Slack 토큰 형식이 올바르지 않습니다")
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "settings.update")
        if token or body.clear_bot_token:
            conn.execute(
                "INSERT INTO app_runtime_settings(key,value,updated_by) VALUES('slack.bot_token',?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, "
                "updated_at=CURRENT_TIMESTAMP, updated_by=excluded.updated_by",
                (secret_store.encrypt(token) if token else "", actor.email),
            )
    return {"ok": True, **_slack_admin_payload()}


@app.post("/api/admin/slack-settings/test")
def admin_test_slack_settings(request: Request) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "settings.update")
    # 토큰 미저장은 사용자가 설정하면 되는 문제 → 400 (실제 연결 실패만 502)
    if not slack_sync._slack_token():
        raise HTTPException(
            status_code=400,
            detail="Slack Bot Token(xoxb-…)을 먼저 저장한 뒤 테스트해 주세요",
        )
    try:
        return {"ok": True, **slack_sync.test_connection()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Slack 연결 실패: {str(exc)[:160]}")


@app.get("/api/summary")
def summary() -> dict:
    with get_conn() as conn:
        return queries.summary(conn)


@app.get("/api/customers")
def customers() -> dict:
    with get_conn() as conn:
        return queries.customers(conn)


@app.get("/api/activities")
def activities() -> dict:
    with get_conn() as conn:
        return {"items": queries.activities(conn)}


@app.get("/api/reviews")
def reviews(status: str = Query("pending")) -> dict:
    with get_conn() as conn:
        return {"items": queries.reviews(conn, status)}


# ── write endpoints ──────────────────────────────────────────────────────────
@app.put("/api/companies/{canonical_key}")
def update_company(request: Request, canonical_key: str, body: CompanyProfileIn) -> dict:
    fields = {
        "display_name": body.display_name,
        "industry": body.industry,
        "sub_industry": body.sub_industry,
        "description": body.description,
        "owner": body.owner,
        "memo": body.memo,
    }
    with get_conn() as conn:
        _guard_change(conn, request, "data.write", f"회사 정보 수정: {canonical_key}")
        try:
            result = queries.update_company_profile(conn, canonical_key, fields)
        except KeyError:
            raise HTTPException(status_code=404, detail="company not found")
    return {"ok": True, **result}


class MergeIn(BaseModel):
    keep_key: str
    merge_keys: list[str]


@app.get("/api/companies/duplicates")
def duplicate_companies() -> dict:
    with get_conn() as conn:
        return {"groups": queries.find_duplicate_companies(conn)}


class DismissDupIn(BaseModel):
    keys: list[str]


@app.post("/api/companies/dismiss-duplicate")
def dismiss_duplicate(request: Request, body: DismissDupIn) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "data.write")
        return {"ok": True, **queries.dismiss_duplicate(conn, body.keys)}


@app.post("/api/companies/merge")
def merge_companies(request: Request, body: MergeIn) -> dict:
    with get_conn() as conn:
        _guard_change(conn, request, "data.delete", f"회사 병합 → {body.keep_key} ({len(body.merge_keys)}곳)")
        try:
            result = queries.merge_companies(conn, body.keep_key, body.merge_keys)
        except KeyError:
            raise HTTPException(status_code=404, detail="keep company not found")
    return {"ok": True, **result}


@app.delete("/api/companies/{canonical_key}")
def delete_company(request: Request, canonical_key: str) -> dict:
    with get_conn() as conn:
        _guard_change(conn, request, "data.delete", f"회사 삭제: {canonical_key}")
        try:
            result = queries.delete_company(conn, canonical_key)
        except KeyError:
            raise HTTPException(status_code=404, detail="company not found")
    return {"ok": True, **result}


class BulkDeleteIn(BaseModel):
    keys: list[str]


@app.post("/api/companies/bulk-delete")
def bulk_delete_companies(request: Request, body: BulkDeleteIn) -> dict:
    keys = [k for k in dict.fromkeys(body.keys) if k]  # dedupe, keep order
    if not keys:
        raise HTTPException(status_code=400, detail="no keys provided")
    with get_conn() as conn:
        # 하나의 변경 배치로 묶어 변경 이력에서 한 번에 되돌릴 수 있게 한다.
        _guard_change(conn, request, "data.delete", f"회사 일괄 삭제: {len(keys)}곳")
        deleted: list[dict] = []
        not_found: list[str] = []
        for key in keys:
            try:
                deleted.append(queries.delete_company(conn, key))
            except KeyError:
                not_found.append(key)
    return {"ok": True, "deleted": len(deleted), "not_found": not_found, "items": deleted}


@app.get("/api/companies/search")
def search_companies(q: str = Query(""), limit: int = Query(20)) -> dict:
    if not q.strip():
        return {"items": []}
    with get_conn() as conn:
        return {"items": queries.search_companies(conn, q, limit)}


@app.post("/api/reviews/{review_id}/resolve")
def resolve_review(request: Request, review_id: int, body: ReviewResolveIn) -> dict:
    with get_conn() as conn:
        _guard_change(conn, request, "review.resolve", f"정합성 처리 #{review_id} ({body.action})")
        try:
            result = queries.resolve_review(
                conn,
                review_id,
                body.action,
                value=body.value,
                fields=body.fields,
                company_key=body.company_key,
                company_name=body.company_name,
                company_fields=body.company_fields,
            )
        except KeyError:
            raise HTTPException(status_code=404, detail="review not found")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "review_id": review_id, **result}


@app.post("/api/leads")
def add_lead(request: Request, body: LeadIn = Body(...)) -> dict:
    with get_conn() as conn:
        _guard_change(conn, request, "data.write", f"리드 추가: {body.email}")
        try:
            result = queries.add_lead(conn, body.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, **result}


class ContactUpdateIn(BaseModel):
    name: str | None = None
    phone: str | None = None
    department: str | None = None
    title: str | None = None
    status: str | None = None
    company: str | None = None


@app.put("/api/contacts/{email}")
def update_contact(request: Request, email: str, body: ContactUpdateIn) -> dict:
    with get_conn() as conn:
        _guard_change(conn, request, "data.write", f"연락처 수정: {email}")
        try:
            result = queries.update_contact(conn, email, body.model_dump())
        except KeyError:
            raise HTTPException(status_code=404, detail="contact not found")
    return {"ok": True, **result}


@app.delete("/api/contacts/{email}")
def delete_contact(request: Request, email: str) -> dict:
    with get_conn() as conn:
        _guard_change(conn, request, "data.delete", f"연락처 삭제: {email}")
        try:
            result = queries.delete_contact(conn, email)
        except KeyError:
            raise HTTPException(status_code=404, detail="contact not found")
    return {"ok": True, **result}


class ReassignIn(BaseModel):
    from_key: str
    to_company: str


class ActivityReassignIn(BaseModel):
    company: str


@app.get("/api/unclassified")
def unclassified() -> dict:
    with get_conn() as conn:
        return {"items": queries.unclassified_suggestions(conn)}


@app.post("/api/activities/{activity_id}/reassign")
def reassign_one_activity(request: Request, activity_id: int, body: ActivityReassignIn) -> dict:
    with get_conn() as conn:
        _guard_change(conn, request, "data.write", f"활동 재분류 #{activity_id} → {body.company}")
        try:
            result = queries.reassign_activity(conn, activity_id, body.company)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, **result}


@app.post("/api/companies/{canonical_key}/reclassify-glm")
def reclassify_glm(request: Request, canonical_key: str) -> dict:
    """해당 회사(예: 미분류) 활동들을 GLM으로 회사 재추출해 개별 재분류."""
    if not glm.is_configured():
        return {"ok": False, "message": "GLM이 설정되지 않았습니다 (GLM_API_URL/GLM_API_KEY).", "moved": 0}
    moved = 0
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "ai.infer.one")
        job_id = auth.record_job_start(conn, "glm_reclassify", actor, target_scope=canonical_key)
        queries.begin_change(conn, f"GLM 재분류: {canonical_key}", actor=actor, source="glm_infer")
        try:
            acts = queries.company_activities(conn, canonical_key, limit=30)
            for a in acts:
                if not a["text"]:
                    continue
                res = glm.extract_lead_event(a["text"])
                comp = (res.get("companies") or [{}])[0].get("name", "") if isinstance(res.get("companies"), list) else ""
                if comp and comp.strip():
                    queries.reassign_activity(conn, a["id"], comp.strip())
                    moved += 1
            auth.record_job_finish(conn, job_id, "success", result_summary=f"moved={moved}")
        except Exception as exc:
            auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
            raise
    return {"ok": True, "moved": moved, "scanned": len(acts)}


@app.post("/api/companies/reassign")
def reassign_activities(request: Request, body: ReassignIn) -> dict:
    with get_conn() as conn:
        _guard_change(conn, request, "data.write", f"활동 재분류: {body.from_key} → {body.to_company}")
        try:
            result = queries.reassign_activities(conn, body.from_key, body.to_company)
        except KeyError:
            raise HTTPException(status_code=404, detail="source company not found")
    return {"ok": True, **result}


@app.put("/api/contacts/{email}/tags")
def set_tags(request: Request, email: str, body: TagsIn) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "data.write")
        try:
            result = queries.set_contact_tags(conn, email, body.tags)
        except KeyError:
            raise HTTPException(status_code=404, detail="contact not found")
    return {"ok": True, **result}


@app.post("/api/activities")
def log_activity(request: Request, body: ActivityIn) -> dict:
    if not body.email and not body.company_key:
        raise HTTPException(status_code=400, detail="email or company_key required")
    with get_conn() as conn:
        _guard_change(conn, request, "data.write", f"활동 기록: {body.email or body.company_key}")
        try:
            result = queries.log_activity(conn, body.model_dump())
        except KeyError:
            raise HTTPException(status_code=404, detail="contact not found")
    return {"ok": True, **result}


@app.get("/api/glm/status")
def glm_status() -> dict:
    cfg = glm.config()
    vision_ok, vision_reason = vision.available()
    return {
        "configured": glm.is_configured(),
        "embedding_model": cfg.get("embedding_model", ""),
        "vision_provider": vision.provider(),
        "vision_available": vision_ok,
        "vision_reason": vision_reason,
    }


@app.post("/api/slack/resolve-users")
def resolve_users(request: Request) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "sync.run")
        return slack_sync.resolve_users(conn)


class ArchiveIn(BaseModel):
    channel_id: str
    ts: str
    archived: bool = True
    file_id: str = ""


def _require_business_card_channel(channel_id: str) -> None:
    if not queries.is_business_card_channel(channel_id):
        raise HTTPException(
            status_code=403,
            detail="명함 수집/파싱은 지정된 명함수집 채널에서만 허용됩니다",
        )


@app.post("/api/slack/messages/archive")
def archive_message(request: Request, body: ArchiveIn) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "slack.raw.apply")
        if body.file_id:
            _require_business_card_channel(body.channel_id)
            raw = conn.execute(
                "SELECT raw_payload FROM slack_raw_messages WHERE channel_id=? AND message_ts=?",
                (body.channel_id, body.ts),
            ).fetchone()
            try:
                payload = json.loads(raw["raw_payload"] or "{}") if raw else {}
            except (ValueError, TypeError):
                payload = {}
            valid_ids = {
                str(f.get("id") or "") for f in payload.get("files", []) or []
                if isinstance(f, dict) and slack_sync._is_image_file(f)
            }
            if body.file_id not in valid_ids:
                raise HTTPException(status_code=404, detail="해당 메시지의 명함 이미지를 찾을 수 없습니다")
            conn.execute(
                """
                INSERT INTO slack_card_items(channel_id, message_ts, file_id, status, archived)
                VALUES(?, ?, ?, 'pending', ?)
                ON CONFLICT(channel_id, message_ts, file_id) DO UPDATE SET
                  archived=excluded.archived, updated_at=CURRENT_TIMESTAMP
                """,
                (body.channel_id, body.ts, body.file_id, 1 if body.archived else 0),
            )
        else:
            queries.set_raw_archived(conn, body.channel_id, body.ts, body.archived)
    return {"ok": True}


@app.get("/api/audit")
def audit_list(request: Request, limit: int = Query(50)) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "audit.read")
        return {"items": queries.list_audit(conn, limit)}


@app.get("/api/jobs")
def job_list(request: Request, limit: int = Query(80)) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "audit.read")
        return {"items": auth.list_jobs(conn, limit)}


@app.post("/api/audit/{batch}/undo")
def audit_undo(request: Request, batch: str) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "audit.rollback")
        result = queries.undo_batch(conn, batch)
    return {"ok": True, **result}


@app.get("/api/slack/messages")
def slack_messages(request: Request, limit: int = Query(300), q: str = Query("")) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "slack.raw.read")
        return {"items": queries.slack_messages(conn, limit=limit, q=q)}


class OcrCardIn(BaseModel):
    channel_id: str
    ts: str
    file_id: str = ""


@app.post("/api/slack/messages/ocr-card")
def ocr_card(request: Request, body: OcrCardIn) -> dict:
    """수집 원문의 명함 이미지를 vision OCR로 추론(미리보기, DB 반영 없음)."""
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "ai.vision.ocr")
        _require_business_card_channel(body.channel_id)
        job_id = auth.record_job_start(
            conn, "vision_ocr", actor,
            target_scope=f"{body.channel_id}:{body.ts}",
        )
        try:
            logs: list[str] = []
            result = slack_sync.ocr_message_cards(
                conn, body.channel_id, body.ts, logs=logs, file_id=body.file_id
            )
            result["logs"] = logs
            auth.record_job_finish(conn, job_id, "success", result_summary=str(result.get("message", "완료")))
            return result
        except Exception as exc:
            auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
            raise


@app.get("/api/slack/messages/card-image")
def card_image(request: Request, channel_id: str = Query(...), ts: str = Query(...), file_id: str = Query(...)):
    """명함 검수 화면용 Slack 비공개 이미지 프록시."""
    with get_conn() as conn:
        auth.require_permission(conn, request, "slack.raw.read")
        _require_business_card_channel(channel_id)
        try:
            image, mime, name = slack_sync.get_message_image(conn, channel_id, ts, file_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Slack 이미지 다운로드 실패: {str(exc)[:160]}")
    safe_name = name.replace('"', "")
    return Response(image, media_type=mime, headers={"Content-Disposition": f'inline; filename="{safe_name}"'})


class GlmExtractIn(BaseModel):
    text: str
    hint: str = ""


@app.post("/api/glm/extract")
def glm_extract(request: Request, body: GlmExtractIn) -> dict:
    """Slack 원문을 DB 스키마에 맞춰 GLM으로 구조화(미리보기/검수용)."""
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "ai.infer.one")
        job_id = auth.record_job_start(conn, "glm_extract", actor, input_summary=body.hint[:120])
        try:
            result = glm.extract_lead_event(body.text, body.hint)
            auth.record_job_finish(conn, job_id, "success")
        except Exception as exc:
            auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
            raise
    return {"ok": True, "result": result}


class ApplyRawIn(BaseModel):
    channel_id: str
    ts: str
    file_id: str = ""
    company: str = ""
    email: str = ""
    name: str = ""
    phone: str = ""
    department: str = ""
    title: str = ""
    solution: str = ""
    activity_type: str = "고객 활동"
    note: str = ""
    next_action: str = ""
    occurred_at: str = ""


@app.post("/api/slack/messages/apply")
def apply_raw_message(request: Request, body: ApplyRawIn) -> dict:
    """미반영 원문을 사용자가 수정한 값으로 DB에 반영(활동/리드 생성)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    now = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d %H:%M:%S")
    occurred = body.occurred_at or now
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "slack.raw.apply")
        payload: dict = {}
        image_files: list[dict] = []
        if body.file_id:
            _require_business_card_channel(body.channel_id)
            raw = conn.execute(
                "SELECT raw_payload FROM slack_raw_messages WHERE channel_id=? AND message_ts=?",
                (body.channel_id, body.ts),
            ).fetchone()
            try:
                payload = json.loads(raw["raw_payload"] or "{}") if raw else {}
            except (ValueError, TypeError):
                payload = {}
            image_files = [
                f for f in payload.get("files", []) or []
                if isinstance(f, dict) and slack_sync._is_image_file(f)
            ]
            if body.file_id not in {str(f.get("id") or "") for f in image_files}:
                raise HTTPException(status_code=404, detail="해당 메시지의 명함 이미지를 찾을 수 없습니다")
            state = conn.execute(
                "SELECT status, archived FROM slack_card_items "
                "WHERE channel_id=? AND message_ts=? AND file_id=?",
                (body.channel_id, body.ts, body.file_id),
            ).fetchone()
            if state and state["archived"]:
                raise HTTPException(status_code=409, detail="아카이브를 해제한 뒤 반영해 주세요")
            if state and state["status"] == "applied":
                raise HTTPException(status_code=409, detail="이미 반영된 명함입니다")
        queries.begin_change(conn, f"원문 반영: {body.company or body.email}", actor=actor, source="slack_raw_apply")
        result: dict = {}
        if body.email and "@" in body.email:
            result = queries.apply_contact_event(
                conn, email=body.email, name=body.name, company=body.company,
                department=body.department, title=body.title, phone=body.phone,
                interest=body.solution, inquiry=body.note, occurred_at=occurred,
                source_code="business_card" if body.file_id else "cross_team", activity_type=body.activity_type,
                next_action=body.next_action, collected_at=now,
            )
        elif body.company.strip():
            queries._upsert_company(conn, body.company.strip())
            result = queries.log_activity(conn, {
                "company_key": queries._norm_company_key(body.company),
                "activity_type": body.activity_type, "solution_name": body.solution,
                "note": body.note, "next_action": body.next_action,
                "occurred_at": occurred,
                "source_type": "business_card" if body.file_id else "cross_team",
                "collected_at": now,
            })
        else:
            raise HTTPException(status_code=400, detail="company 또는 email 중 하나는 필요합니다")
        message_applied = True
        applied_cards = total_cards = 0
        if body.file_id:
            archived_ids = {
                str(r["file_id"]) for r in conn.execute(
                    "SELECT file_id FROM slack_card_items WHERE channel_id=? AND message_ts=? AND archived=1",
                    (body.channel_id, body.ts),
                ).fetchall()
            }
            ids = [
                str(f.get("id") or "") for f in image_files
                if str(f.get("id") or "") and str(f.get("id") or "") not in archived_ids
            ]
            current_file = next((f for f in image_files if str(f.get("id") or "") == body.file_id), {})
            conn.execute(
                """
                INSERT INTO slack_card_items(channel_id, message_ts, file_id, file_name, status, applied_at)
                VALUES(?, ?, ?, ?, 'applied', ?)
                ON CONFLICT(channel_id, message_ts, file_id) DO UPDATE SET
                  file_name=excluded.file_name, status='applied', applied_at=excluded.applied_at,
                  updated_at=CURRENT_TIMESTAMP
                """,
                (body.channel_id, body.ts, body.file_id,
                 current_file.get("name") or current_file.get("title") or body.file_id, now),
            )
            total_cards = len(ids)
            if ids:
                placeholders = ",".join("?" for _ in ids)
                applied_cards = int(conn.execute(
                    f"SELECT COUNT(*) FROM slack_card_items WHERE channel_id=? AND message_ts=? "
                    f"AND status='applied' AND file_id IN ({placeholders})",
                    [body.channel_id, body.ts, *ids],
                ).fetchone()[0])
            message_applied = total_cards > 0 and applied_cards >= total_cards
            conn.execute(
                "UPDATE slack_raw_messages SET applied=?, applied_kind=? WHERE channel_id=? AND message_ts=?",
                (1 if message_applied else 0,
                 "business_card_manual" if message_applied else "business_card_partial",
                 body.channel_id, body.ts),
            )
            if message_applied:
                # 마지막 이미지 수동 반영 직후에도 자동 수집과 동일한 완료 이모지 적용.
                callback_settings = queries.get_sync_settings(conn)
                conn.commit()
                slack_sync._post_sync_callback(
                    conn, body.channel_id,
                    {"ts": body.ts, "kind": "business_card"},
                    "business_card_manual", callback_settings, [],
                )
        else:
            conn.execute(
                "UPDATE slack_raw_messages SET applied=1, applied_kind='manual' "
                "WHERE channel_id=? AND message_ts=?",
                (body.channel_id, body.ts),
            )
    return {
        "ok": True, **result, "message_applied": message_applied,
        "applied_cards": applied_cards, "total_cards": total_cards,
    }


@app.post("/api/search/glm")
def glm_search(request: Request, body: GlmSearchIn) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "ai.infer.one")
    filters = glm.extract_search_filters(body.query)
    with get_conn() as conn:
        result = queries.search_by_filters(conn, filters)
        semantic_result = (
            semantic.search(conn, body.query, limit=30)
            if glm.is_configured()
            else {"ok": False, "items": [], "emails": []}
        )
    if semantic_result.get("ok") and semantic_result.get("emails"):
        merged = sorted(set(result.get("emails", [])) | set(semantic_result.get("emails", [])))
        result = {**result, "emails": merged, "count": len(merged)}
    return {
        "ok": True,
        "filters": filters,
        "mode": "hybrid" if semantic_result.get("ok") else filters.get("_mode", "fallback"),
        "semantic": semantic_result,
        **result,
    }


@app.post("/api/search/semantic")
def semantic_search(body: SemanticSearchIn) -> dict:
    with get_conn() as conn:
        return semantic.search(conn, body.query, limit=body.limit)


@app.post("/api/embeddings/rebuild")
def rebuild_embeddings(request: Request, body: EmbeddingRebuildIn = Body(default=EmbeddingRebuildIn())) -> dict:
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "ai.embedding.rebuild")
        job_id = auth.record_job_start(conn, "embedding_rebuild", actor, target_scope=f"limit={body.limit}")
        try:
            result = semantic.rebuild(conn, limit=body.limit)
            auth.record_job_finish(conn, job_id, "success", result_summary=str(result.get("message", "완료")))
            return result
        except Exception as exc:
            auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
            raise


@app.post("/api/companies/{canonical_key}/infer")
def infer_company(request: Request, canonical_key: str, body: InferIn) -> dict:
    context = body.context
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "ai.infer.one")
        job_id = auth.record_job_start(conn, "glm_company_infer", actor, target_scope=canonical_key)
        # gather light context from the company's contacts/inquiries if none given
        if not context:
            rows = conn.execute(
                """
                SELECT ct.inquiry_summary FROM contacts ct
                JOIN companies co ON ct.company_id = co.id
                WHERE co.canonical_key = ? AND ct.inquiry_summary <> '' LIMIT 10
                """,
                (canonical_key,),
            ).fetchall()
            context = "\n".join(r["inquiry_summary"] for r in rows)
        co = conn.execute(
            "SELECT display_name FROM companies WHERE canonical_key = ?", (canonical_key,)
        ).fetchone()
    if co is None:
        raise HTTPException(status_code=404, detail="company not found")
    try:
        result = glm.infer_company_profile(co["display_name"], context)
        with get_conn() as conn:
            auth.record_job_finish(conn, job_id, "success")
    except Exception as exc:
        with get_conn() as conn:
            auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
        raise
    return {"ok": True, "result": result}


@app.post("/api/companies/infer-batch")
def infer_companies_batch(request: Request, body: BatchInferIn) -> dict:
    """Fill blank company profile fields in bulk using GLM.

    Existing human-entered fields are preserved. Personal placeholder companies
    are skipped to avoid inventing account profiles for individual-only records.
    """
    if not glm.is_configured():
        return {"ok": False, "message": "GLM이 설정되지 않았습니다 (GLM_API_URL/GLM_API_KEY).", "updated": 0}
    limit = max(1, min(int(body.limit or 30), 100))
    min_conf = max(0.0, min(float(body.min_confidence or 0.45), 1.0))
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "ai.infer.batch")
    # 단일 슬롯 선점: 이미 다른 작업(동기화/재클렌징/다른 일괄추정)이 돌면 중복 실행 거부.
    if not _bg_try_start("glm_batch_infer", f"회사 일괄 자동추정 (최대 {limit}곳)"):
        return {"ok": True, "running": True, "started": False,
                "message": "이미 다른 작업이 진행 중입니다. 진행 상황은 상태 폴링으로 확인하세요."}
    logs = _sync_state["logs"]

    def _job() -> None:
        job_id = None
        updated = skipped = 0
        errors: list[str] = []
        try:
            # 1) 대상 회사 목록 읽기 + 감사 배치 시작 후 즉시 커밋 → 쓰기 잠금 해제.
            #    (아래 GLM 호출은 네트워크 대기가 길다. 잠금을 쥔 채 대기하면 다른 요청이
            #     database is locked로 실패하므로, 회사별 쓰기만 짧은 트랜잭션으로 처리한다.)
            with get_conn() as conn:
                job_id = auth.record_job_start(conn, "glm_batch_infer", actor, target_scope=f"limit={limit}")
                queries.begin_change(conn, f"회사 일괄 자동추정 ({limit})", actor=actor, source="glm_batch")
                rows = conn.execute(
                    """
                    SELECT canonical_key, display_name, industry, sub_industry, description
                    FROM companies
                    WHERE display_name NOT LIKE '개인:%'
                      AND display_name NOT IN ('(미분류)', '(회사 미상)', '미분류')
                      AND (
                        COALESCE(industry,'') = ''
                        OR COALESCE(sub_industry,'') = ''
                        OR COALESCE(description,'') = ''
                      )
                    ORDER BY
                      CASE WHEN COALESCE(industry,'') = '' THEN 0 ELSE 1 END,
                      display_name ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                candidates = [dict(r) for r in rows]
            total = len(candidates)
            _bg_progress(current=0, total=total, message="시작")
            _log(logs, f"[batch-infer] 대상 {total}곳 GLM 자동추정 시작 (신뢰도 ≥ {min_conf:.2f})")
            for i, co in enumerate(candidates, 1):
                name = co["display_name"]
                _bg_progress(current=i, message=name)
                _log(logs, f"[batch-infer] ({i}/{total}) {name} 추정 중…")
                with get_conn() as conn:  # 읽기 전용 컨텍스트 조회 (짧음)
                    ctx_rows = conn.execute(
                        """
                        SELECT ct.inquiry_summary FROM contacts ct
                        JOIN companies c ON c.id = ct.company_id
                        WHERE c.canonical_key = ? AND ct.inquiry_summary <> ''
                        ORDER BY ct.updated_at DESC LIMIT 8
                        """,
                        (co["canonical_key"],),
                    ).fetchall()
                context = "\n".join(r["inquiry_summary"] for r in ctx_rows)
                try:
                    inferred = glm.infer_company_profile(name, context)  # 네트워크 (잠금 미보유)
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{name}: {exc}")
                    _log(logs, f"[batch-infer] ⚠ {name} 실패: {str(exc)[:80]}")
                    continue
                if inferred.get("_mode") != "glm":
                    errors.append(f"{name}: {inferred.get('message', 'GLM error')}")
                    skipped += 1
                    continue
                if float(inferred.get("confidence") or 0) < min_conf:
                    skipped += 1
                    continue
                before = {
                    "industry": co["industry"] or "",
                    "sub_industry": co["sub_industry"] or "",
                    "description": co["description"] or "",
                }
                cand = {
                    "industry": inferred.get("industry") or "",
                    "sub_industry": inferred.get("sub_industry") or "",
                    "description": inferred.get("description") or "",
                }
                patch = {k: str(v).strip() for k, v in cand.items() if not before[k] and str(v or "").strip()}
                if not patch:
                    skipped += 1
                    continue
                with get_conn() as conn:  # 회사별 짧은 쓰기 트랜잭션
                    queries.update_company_profile(conn, co["canonical_key"], patch, profile_source="glm_batch")
                updated += 1
                _log(logs, f"[batch-infer] ✅ {name} 업데이트: {', '.join(patch.keys())}")
            msg = f"일괄 자동추정 완료 — 스캔 {total} · 업데이트 {updated} · 건너뜀 {skipped}"
            if errors:
                msg += f" · 오류 {len(errors)}건"
            _log(logs, f"[batch-infer] {msg}")
            _sync_state["result"] = {
                "ok": True, "scanned": total, "updated": updated,
                "skipped": skipped, "errors": errors[:5], "message": msg,
            }
            if job_id:
                with get_conn() as conn:
                    auth.record_job_finish(conn, job_id, "success", result_summary=f"updated={updated}, skipped={skipped}")
        except Exception as exc:  # noqa: BLE001
            _log(logs, f"[batch-infer] 오류: {exc}")
            _sync_state["result"] = {"ok": False, "message": str(exc)}
            if job_id:
                with get_conn() as conn:
                    auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
        finally:
            _sync_state["running"] = False

    threading.Thread(target=_job, name="rtm-batch-infer", daemon=True).start()
    return {"ok": True, "running": True, "started": True, "message": "회사 일괄 자동추정을 시작했습니다"}


@app.get("/api/guide")
def guide() -> dict:
    """The Slack message-writing guide, surfaced permanently in the UI."""
    path = _settings.guide_path
    if not path.exists():
        return {"ok": False, "markdown": "", "message": f"guide not found: {path}"}
    return {"ok": True, "markdown": path.read_text(encoding="utf-8")}


@app.get("/api/settings")
def get_settings_endpoint() -> dict:
    with get_conn() as conn:
        return queries.get_sync_settings(conn)


@app.put("/api/settings")
def put_settings(request: Request, body: SyncSettingsIn) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "sync.configure")
        return queries.save_sync_settings(
            conn, body.model_dump(exclude_none=True)
        )


# ── background job slot (single-flight) ──────────────────────────────────────
# 하나의 무거운 작업(슬랙 동기화/재클렌징/AI 일괄추정)만 동시에 실행되도록 단일 슬롯으로
# 관리한다. 이 슬롯이 곧 "중복 명령 방지" 장치다 — 이미 실행 중이면 새 요청은 거부된다.
# 진행률(progress)과 종류(kind)를 함께 노출해 프런트가 블랙박스 없이 상태를 표시한다.
_sync_state: dict = {
    "running": False, "logs": [], "result": None, "started": 0.0,
    "label": "", "kind": "", "progress": {"current": 0, "total": 0, "message": ""},
}
_sync_lock = threading.Lock()


def _bg_try_start(kind: str, label: str) -> bool:
    """작업 슬롯을 선점한다. 이미 실행 중이면 False(=중복 거부)."""
    with _sync_lock:
        if _sync_state["running"]:
            return False
        _sync_state.update({
            "running": True, "logs": [], "result": None, "started": time.time(),
            "label": label, "kind": kind,
            "progress": {"current": 0, "total": 0, "message": ""},
        })
    return True


def _bg_progress(*, current: int | None = None, total: int | None = None, message: str | None = None) -> None:
    p = _sync_state["progress"]
    if current is not None:
        p["current"] = current
    if total is not None:
        p["total"] = total
    if message is not None:
        p["message"] = message


def _bg_running() -> bool:
    return bool(_sync_state["running"])


def _log(logs: list, msg: str) -> None:
    """서버 콘솔 + 상태 폴링 로그에 함께 기록."""
    print(msg, flush=True)
    logs.append(msg)


def _start_sync(export_file, limit, backfill, label="", only_channel=None, job_id: int | None = None) -> bool:
    """Start a sync in a background thread. Returns False if one is already running."""
    kind = "slack_backfill" if backfill else "slack_sync"
    if not _bg_try_start(kind, label or kind):
        return False
    logs = _sync_state["logs"]

    def _job() -> None:
        try:
            _sync_state["result"] = slack_sync.run_sync(
                export_file=export_file, limit=limit, backfill=backfill,
                only_channel=only_channel, logs=logs
            )
            if job_id:
                with get_conn() as conn:
                    result = _sync_state["result"] or {}
                    summary = {
                        key: result.get(key) for key in (
                            "message", "source", "collected", "parsed", "new_leads",
                            "new_activities", "queued_reviews", "channels",
                        ) if result.get(key) is not None
                    }
                    auth.record_job_finish(
                        conn, job_id, "success" if result.get("ok") else "failed",
                        result_summary=json.dumps(summary, ensure_ascii=False),
                        error_message="" if result.get("ok") else str(result.get("message", "수집 실패")),
                    )
        except Exception as exc:  # noqa: BLE001
            logs.append(f"[sync] 오류: {exc}")
            _sync_state["result"] = {"ok": False, "message": str(exc), "log": logs}
            if job_id:
                with get_conn() as conn:
                    auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
        finally:
            _sync_state["running"] = False

    threading.Thread(target=_job, name="rtm-sync", daemon=True).start()
    return True


@app.post("/api/sync")
def sync(request: Request, body: SyncIn | None = None) -> dict:
    backfill = body.backfill if body else False
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "sync.backfill" if backfill else "sync.run")
        job_id = auth.record_job_start(
            conn,
            "slack_backfill" if backfill else "slack_sync",
            actor,
            target_scope=body.only_channel if body and body.only_channel else "enabled_channels",
            input_summary=f"backfill={backfill}",
        )
    started = _start_sync(
        body.export_file if body else None,
        body.limit if body else None,
        backfill,
        label="backfill" if backfill else "sync",
        only_channel=body.only_channel if body else None,
        job_id=job_id,
    )
    if not started:
        with get_conn() as conn:
            auth.record_job_finish(conn, job_id, "cancelled", result_summary="already running")
        return {"ok": True, "running": True, "started": False,
                "message": "이미 동기화가 진행 중입니다. 진행 상황은 상태 폴링으로 확인하세요."}
    return {"ok": True, "running": True, "started": True, "message": "동기화를 시작했습니다"}


@app.post("/api/recleanse")
def recleanse(request: Request) -> dict:
    """저장된 원문에서 슬랙 활동을 재파싱(재수집 없음). sync와 같은 상태 폴링 사용."""
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "sync.backfill")
    if not _bg_try_start("slack_recleanse", "전체 재클렌징"):
        return {"ok": True, "running": True, "started": False,
                "message": "이미 다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요."}
    with get_conn() as conn:
        job_id = auth.record_job_start(conn, "slack_recleanse", actor, target_scope="all_raw_messages")
    logs = _sync_state["logs"]

    def _job() -> None:
        try:
            _sync_state["result"] = slack_sync.run_recleanse(logs=logs)
            with get_conn() as conn:
                auth.record_job_finish(
                    conn, job_id, "success",
                    result_summary=str(_sync_state["result"].get("message", "완료")),
                )
        except Exception as exc:  # noqa: BLE001
            logs.append(f"[recleanse] 오류: {exc}")
            _sync_state["result"] = {"ok": False, "message": str(exc), "log": logs}
            with get_conn() as conn:
                auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
        finally:
            _sync_state["running"] = False

    threading.Thread(target=_job, name="rtm-recleanse", daemon=True).start()
    return {"ok": True, "running": True, "started": True, "message": "재클렌징을 시작했습니다"}


@app.get("/api/sync/status")
def sync_status() -> dict:
    """진행 중 백그라운드 작업(동기화/재클렌징/AI 일괄추정)의 실시간 로그·진행률·결과를
    폴링으로 제공. AI 작업도 같은 슬롯을 쓰므로 진행률이 노출되어 블랙박스가 사라진다."""
    return {
        "running": _sync_state["running"],
        "logs": _sync_state["logs"],
        "result": _sync_state["result"],
        "started": _sync_state["started"],
        "kind": _sync_state.get("kind", ""),
        "label": _sync_state.get("label", ""),
        "progress": _sync_state.get("progress", {"current": 0, "total": 0, "message": ""}),
    }


@app.post("/api/scheduler/run-now")
def scheduler_run_now(request: Request) -> dict:
    """예약 수집과 동일한 경로를 즉시 실행해 설정/권한/연결을 검증한다."""
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "sync.run")
        job_id = auth.record_job_start(
            conn, "slack_scheduled_test", actor,
            target_scope="enabled_channels", input_summary="예약 수집 수동 점검",
        )
    started = _start_sync(None, None, False, label="scheduled-test", job_id=job_id)
    if not started:
        with get_conn() as conn:
            auth.record_job_finish(conn, job_id, "cancelled", result_summary="이미 다른 수집 작업이 실행 중")
    return {"ok": True, "started": started, "message": "예약 수집 점검을 시작했습니다" if started else "이미 수집 작업이 실행 중입니다"}


# ── background scheduler (reliable periodic collection) ──────────────────────
_sched_stop = threading.Event()
_last_auto_run = 0.0
_scheduler_state: dict = {"heartbeat": 0.0, "next_run": 0.0, "last_error": "", "last_started": 0.0}


def _scheduler_loop() -> None:
    global _last_auto_run
    while not _sched_stop.wait(60):
        _scheduler_state["heartbeat"] = time.time()
        try:
            with get_conn() as conn:
                s = queries.get_sync_settings(conn)
            if not s.get("auto_sync_enabled"):
                _scheduler_state["next_run"] = 0.0
                continue
            interval = max(1, int(s.get("auto_sync_interval_minutes") or 30)) * 60
            now = time.time()
            _scheduler_state["next_run"] = (_last_auto_run + interval) if _last_auto_run else now
            if now - _last_auto_run >= interval and not _sync_state["running"]:
                with get_conn() as conn:
                    row = conn.execute("SELECT id FROM auth_users WHERE role='system' ORDER BY id LIMIT 1").fetchone()
                    actor = auth.Actor(
                        user_id=int(row["id"]) if row else None,
                        email="system.slack_sync@local", role="system",
                        permissions=frozenset({"sync.run"}),
                    )
                    job_id = auth.record_job_start(
                        conn, "slack_auto_sync", actor,
                        target_scope="enabled_channels",
                        input_summary=f"interval_minutes={interval // 60}",
                    )
                if _start_sync(None, None, False, label="auto", job_id=job_id):
                    _last_auto_run = now
                    _scheduler_state.update({"last_started": now, "next_run": now + interval, "last_error": ""})
                    print("[auto-sync] 시작", flush=True)
        except Exception as exc:  # noqa: BLE001 - never let the loop die
            _scheduler_state["last_error"] = str(exc)
            print(f"[auto-sync] error: {exc}", flush=True)


@app.get("/api/scheduler/status")
def scheduler_status(request: Request, limit: int = Query(30, ge=1, le=100)) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, {"audit.read"})
        settings = queries.get_sync_settings(conn)
        rows = [dict(row) for row in conn.execute(
            """
            SELECT id, job_type, status, actor_email, target_scope, input_summary,
                   result_summary, error_message, started_at, finished_at,
                   CASE WHEN finished_at <> '' THEN
                     CAST((julianday(finished_at)-julianday(started_at))*86400 AS INTEGER)
                   ELSE CAST((julianday('now')-julianday(started_at))*86400 AS INTEGER) END AS duration_seconds
            FROM job_runs
            WHERE job_type IN ('slack_auto_sync','slack_scheduled_test','slack_sync','slack_backfill')
            ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()]
        card_queue = dict(conn.execute(
            """
            SELECT
              SUM(CASE WHEN archived=0 AND status IN ('pending','parsed') THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN archived=0 AND status='processing' THEN 1 ELSE 0 END) AS processing,
              SUM(CASE WHEN archived=0 AND status='error' THEN 1 ELSE 0 END) AS retrying,
              SUM(CASE WHEN archived=0 AND status='applied' THEN 1 ELSE 0 END) AS applied
            FROM slack_card_items
            """
        ).fetchone())
    heartbeat = float(_scheduler_state.get("heartbeat") or 0)
    return {
        "enabled": bool(settings.get("auto_sync_enabled")),
        "interval_minutes": int(settings.get("auto_sync_interval_minutes") or 30),
        "heartbeat": heartbeat,
        "healthy": bool(heartbeat and time.time() - heartbeat < 150),
        "next_run": float(_scheduler_state.get("next_run") or 0),
        "last_error": str(_scheduler_state.get("last_error") or ""),
        "sync_running": bool(_sync_state.get("running")),
        "business_card_batch_size": int(settings.get("business_card_batch_size") or 10),
        "card_queue": {k: int(v or 0) for k, v in card_queue.items()},
        "runs": rows,
    }


@app.on_event("startup")
def _start_scheduler() -> None:
    global _last_auto_run
    _scheduler_state["heartbeat"] = time.time()
    with get_conn() as conn:
        conn.execute(
            "UPDATE job_runs SET status='interrupted', error_message='서버 재시작으로 작업이 중단됨', "
            "finished_at=CURRENT_TIMESTAMP WHERE status='started'"
        )
        last = conn.execute(
            "SELECT CAST(strftime('%s', started_at) AS REAL) FROM job_runs "
            "WHERE job_type='slack_auto_sync' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        _last_auto_run = float(last[0]) if last and last[0] else 0.0
    threading.Thread(target=_scheduler_loop, name="rtm-auto-sync", daemon=True).start()


@app.on_event("shutdown")
def _stop_scheduler() -> None:
    _sched_stop.set()


# ── static frontend ──────────────────────────────────────────────────────────
# Serve the built Vite app (frontend/dist) from the same process so a single
# `./run.sh` serves both the API and the UI. Mounted last so /api/* routes win.
# `html=True` serves index.html at "/" and for directory requests.
if _settings.frontend_dist.exists():
    _index_file = _settings.frontend_dist / "index.html"

    # Serve index.html with no-cache so a rebuilt UI is picked up on refresh
    # (hashed asset files under /assets can cache forever).
    @app.get("/")
    def _index() -> FileResponse:
        return FileResponse(_index_file, headers={"Cache-Control": "no-cache"})

    app.mount(
        "/",
        StaticFiles(directory=str(_settings.frontend_dist), html=True),
        name="frontend",
    )
