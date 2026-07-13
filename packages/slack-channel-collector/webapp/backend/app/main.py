"""FastAPI application for the RTM Customer DB dashboard.

Replaces the stdlib ``serve_api.py`` and the browser-embedded data in
``RTM_고객DB_대시보드.html``. See webapp/README.md for run instructions.
"""
from __future__ import annotations

import threading
import time

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth, glm, queries, semantic, slack_sync, vision
from .config import get_settings
from .db import get_conn

app = FastAPI(title="RTM Customer DB API", version="1.0.0")

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ── read endpoints ─────────────────────────────────────────────────────────
@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "db": str(_settings.db_path)}


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
def update_company(canonical_key: str, body: CompanyProfileIn) -> dict:
    fields = {
        "display_name": body.display_name,
        "industry": body.industry,
        "sub_industry": body.sub_industry,
        "description": body.description,
        "owner": body.owner,
        "memo": body.memo,
    }
    with get_conn() as conn:
        queries.begin_change(conn, f"회사 정보 수정: {canonical_key}")
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
def dismiss_duplicate(body: DismissDupIn) -> dict:
    with get_conn() as conn:
        return {"ok": True, **queries.dismiss_duplicate(conn, body.keys)}


@app.post("/api/companies/merge")
def merge_companies(body: MergeIn) -> dict:
    with get_conn() as conn:
        queries.begin_change(conn, f"회사 병합 → {body.keep_key} ({len(body.merge_keys)}곳)")
        try:
            result = queries.merge_companies(conn, body.keep_key, body.merge_keys)
        except KeyError:
            raise HTTPException(status_code=404, detail="keep company not found")
    return {"ok": True, **result}


@app.delete("/api/companies/{canonical_key}")
def delete_company(canonical_key: str) -> dict:
    with get_conn() as conn:
        queries.begin_change(conn, f"회사 삭제: {canonical_key}")
        try:
            result = queries.delete_company(conn, canonical_key)
        except KeyError:
            raise HTTPException(status_code=404, detail="company not found")
    return {"ok": True, **result}


@app.get("/api/companies/search")
def search_companies(q: str = Query(""), limit: int = Query(20)) -> dict:
    if not q.strip():
        return {"items": []}
    with get_conn() as conn:
        return {"items": queries.search_companies(conn, q, limit)}


@app.post("/api/reviews/{review_id}/resolve")
def resolve_review(review_id: int, body: ReviewResolveIn) -> dict:
    with get_conn() as conn:
        queries.begin_change(conn, f"정합성 처리 #{review_id} ({body.action})")
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
def add_lead(body: LeadIn = Body(...)) -> dict:
    with get_conn() as conn:
        queries.begin_change(conn, f"리드 추가: {body.email}")
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
def update_contact(email: str, body: ContactUpdateIn) -> dict:
    with get_conn() as conn:
        queries.begin_change(conn, f"연락처 수정: {email}")
        try:
            result = queries.update_contact(conn, email, body.model_dump())
        except KeyError:
            raise HTTPException(status_code=404, detail="contact not found")
    return {"ok": True, **result}


@app.delete("/api/contacts/{email}")
def delete_contact(email: str) -> dict:
    with get_conn() as conn:
        queries.begin_change(conn, f"연락처 삭제: {email}")
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
def reassign_one_activity(activity_id: int, body: ActivityReassignIn) -> dict:
    with get_conn() as conn:
        queries.begin_change(conn, f"활동 재분류 #{activity_id} → {body.company}")
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
        queries.begin_change(conn, f"GLM 재분류: {canonical_key}")
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
def reassign_activities(body: ReassignIn) -> dict:
    with get_conn() as conn:
        queries.begin_change(conn, f"활동 재분류: {body.from_key} → {body.to_company}")
        try:
            result = queries.reassign_activities(conn, body.from_key, body.to_company)
        except KeyError:
            raise HTTPException(status_code=404, detail="source company not found")
    return {"ok": True, **result}


@app.put("/api/contacts/{email}/tags")
def set_tags(email: str, body: TagsIn) -> dict:
    with get_conn() as conn:
        try:
            result = queries.set_contact_tags(conn, email, body.tags)
        except KeyError:
            raise HTTPException(status_code=404, detail="contact not found")
    return {"ok": True, **result}


@app.post("/api/activities")
def log_activity(body: ActivityIn) -> dict:
    if not body.email and not body.company_key:
        raise HTTPException(status_code=400, detail="email or company_key required")
    with get_conn() as conn:
        queries.begin_change(conn, f"활동 기록: {body.email or body.company_key}")
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


@app.post("/api/slack/messages/archive")
def archive_message(request: Request, body: ArchiveIn) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "slack.raw.apply")
        queries.set_raw_archived(conn, body.channel_id, body.ts, body.archived)
    return {"ok": True}


@app.get("/api/audit")
def audit_list(limit: int = Query(50)) -> dict:
    with get_conn() as conn:
        return {"items": queries.list_audit(conn, limit)}


@app.post("/api/audit/{batch}/undo")
def audit_undo(request: Request, batch: str) -> dict:
    with get_conn() as conn:
        auth.require_permission(conn, request, "audit.rollback")
        result = queries.undo_batch(conn, batch)
    return {"ok": True, **result}


@app.get("/api/slack/messages")
def slack_messages(limit: int = Query(300), q: str = Query("")) -> dict:
    with get_conn() as conn:
        return {"items": queries.slack_messages(conn, limit=limit, q=q)}


class OcrCardIn(BaseModel):
    channel_id: str
    ts: str


@app.post("/api/slack/messages/ocr-card")
def ocr_card(request: Request, body: OcrCardIn) -> dict:
    """수집 원문의 명함 이미지를 vision OCR로 추론(미리보기, DB 반영 없음)."""
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "ai.vision.ocr")
        job_id = auth.record_job_start(
            conn, "vision_ocr", actor,
            target_scope=f"{body.channel_id}:{body.ts}",
        )
        try:
            result = slack_sync.ocr_message_cards(conn, body.channel_id, body.ts)
            auth.record_job_finish(conn, job_id, "success", result_summary=str(result.get("message", "완료")))
            return result
        except Exception as exc:
            auth.record_job_finish(conn, job_id, "failed", error_message=str(exc))
            raise


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
        auth.require_permission(conn, request, "slack.raw.apply")
        queries.begin_change(conn, f"원문 반영: {body.company or body.email}")
        result: dict = {}
        if body.email and "@" in body.email:
            result = queries.apply_contact_event(
                conn, email=body.email, name=body.name, company=body.company,
                department=body.department, title=body.title, phone=body.phone,
                interest=body.solution, inquiry=body.note, occurred_at=occurred,
                source_code="cross_team", activity_type=body.activity_type,
                next_action=body.next_action, collected_at=now,
            )
        elif body.company.strip():
            queries._upsert_company(conn, body.company.strip())
            result = queries.log_activity(conn, {
                "company_key": queries._norm_company_key(body.company),
                "activity_type": body.activity_type, "solution_name": body.solution,
                "note": body.note, "next_action": body.next_action,
                "occurred_at": occurred, "source_type": "cross_team", "collected_at": now,
            })
        else:
            raise HTTPException(status_code=400, detail="company 또는 email 중 하나는 필요합니다")
        conn.execute(
            "UPDATE slack_raw_messages SET applied=1, applied_kind='manual' "
            "WHERE channel_id=? AND message_ts=?",
            (body.channel_id, body.ts),
        )
    return {"ok": True, **result}


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
    scanned = 0
    updated = 0
    skipped = 0
    errors: list[str] = []
    with get_conn() as conn:
        actor = auth.require_permission(conn, request, "ai.infer.batch")
        job_id = auth.record_job_start(conn, "glm_batch_infer", actor, target_scope=f"limit={limit}")
        queries.begin_change(conn, f"회사 일괄 자동추정 ({limit})")
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
        for co in rows:
            scanned += 1
            ctx_rows = conn.execute(
                """
                SELECT ct.inquiry_summary FROM contacts ct
                JOIN companies c ON c.id = ct.company_id
                WHERE c.canonical_key = ? AND ct.inquiry_summary <> ''
                ORDER BY ct.updated_at DESC
                LIMIT 8
                """,
                (co["canonical_key"],),
            ).fetchall()
            context = "\n".join(r["inquiry_summary"] for r in ctx_rows)
            try:
                inferred = glm.infer_company_profile(co["display_name"], context)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{co['display_name']}: {exc}")
                continue
            if inferred.get("_mode") != "glm":
                errors.append(f"{co['display_name']}: {inferred.get('message', 'GLM error')}")
                continue
            conf = float(inferred.get("confidence") or 0)
            if conf < min_conf:
                skipped += 1
                continue
            fields = {
                "industry": co["industry"] or (inferred.get("industry") or ""),
                "sub_industry": co["sub_industry"] or (inferred.get("sub_industry") or ""),
                "description": co["description"] or (inferred.get("description") or ""),
            }
            fields = {k: str(v).strip() for k, v in fields.items() if str(v or "").strip()}
            if not fields:
                skipped += 1
                continue
            before = {
                "industry": co["industry"] or "",
                "sub_industry": co["sub_industry"] or "",
                "description": co["description"] or "",
            }
            patch = {k: v for k, v in fields.items() if not before[k] and v}
            if not patch:
                skipped += 1
                continue
            queries.update_company_profile(conn, co["canonical_key"], patch, profile_source="glm_batch")
            updated += 1
        auth.record_job_finish(conn, job_id, "success", result_summary=f"updated={updated}, skipped={skipped}")
    return {
        "ok": True,
        "scanned": scanned,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:5],
    }


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


# ── background sync job (long backfills run without blocking the request) ────
_sync_state: dict = {"running": False, "logs": [], "result": None, "started": 0.0, "label": ""}
_sync_lock = threading.Lock()


def _start_sync(export_file, limit, backfill, label="", only_channel=None, job_id: int | None = None) -> bool:
    """Start a sync in a background thread. Returns False if one is already running."""
    with _sync_lock:
        if _sync_state["running"]:
            return False
        _sync_state.update({"running": True, "logs": [], "result": None,
                            "started": time.time(), "label": label})
    logs = _sync_state["logs"]

    def _job() -> None:
        try:
            _sync_state["result"] = slack_sync.run_sync(
                export_file=export_file, limit=limit, backfill=backfill,
                only_channel=only_channel, logs=logs
            )
            if job_id:
                with get_conn() as conn:
                    auth.record_job_finish(
                        conn, job_id, "success",
                        result_summary=str(_sync_state["result"].get("message", "완료")),
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
        job_id = auth.record_job_start(conn, "slack_recleanse", actor, target_scope="all_raw_messages")
    with _sync_lock:
        if _sync_state["running"]:
            with get_conn() as conn:
                auth.record_job_finish(conn, job_id, "cancelled", result_summary="already running")
            return {"ok": True, "running": True, "started": False,
                    "message": "작업이 진행 중입니다. 잠시 후 다시 시도하세요."}
        _sync_state.update({"running": True, "logs": [], "result": None,
                            "started": time.time(), "label": "recleanse"})
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
    """진행 중 동기화의 실시간 로그·결과를 폴링으로 제공."""
    return {
        "running": _sync_state["running"],
        "logs": _sync_state["logs"],
        "result": _sync_state["result"],
        "started": _sync_state["started"],
    }


# ── background scheduler (reliable periodic collection) ──────────────────────
_sched_stop = threading.Event()
_last_auto_run = 0.0


def _scheduler_loop() -> None:
    global _last_auto_run
    while not _sched_stop.wait(60):
        try:
            with get_conn() as conn:
                s = queries.get_sync_settings(conn)
            if not s.get("auto_sync_enabled"):
                continue
            interval = max(1, int(s.get("auto_sync_interval_minutes") or 30)) * 60
            now = time.time()
            if now - _last_auto_run >= interval and not _sync_state["running"]:
                _last_auto_run = now
                if _start_sync(None, None, False, label="auto"):
                    print("[auto-sync] 시작", flush=True)
        except Exception as exc:  # noqa: BLE001 - never let the loop die
            print(f"[auto-sync] error: {exc}", flush=True)


@app.on_event("startup")
def _start_scheduler() -> None:
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
