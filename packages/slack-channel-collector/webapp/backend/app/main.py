"""FastAPI application for the RTM Customer DB dashboard.

Replaces the stdlib ``serve_api.py`` and the browser-embedded data in
``RTM_고객DB_대시보드.html``. See webapp/README.md for run instructions.
"""
from __future__ import annotations

import threading
import time

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import glm, queries, slack_sync
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
    industry: str | None = None
    sub_industry: str | None = None
    description: str | None = None
    owner: str | None = None
    memo: str | None = None


class ReviewResolveIn(BaseModel):
    action: str = Field(
        "approve", pattern="^(approve|edit|reject|link_existing|register_new)$"
    )
    value: str | None = None
    company_key: str | None = None  # for link_existing
    company_name: str | None = None  # for register_new
    company_fields: dict | None = None  # optional industry/sub_industry/description


class SyncSettingsIn(BaseModel):
    channel_id: str | None = None
    lookback_hours: int | None = None
    include_relate: bool | None = None
    include_featpaper: bool | None = None
    require_review_for_new_company: bool | None = None
    auto_sync_enabled: bool | None = None
    auto_sync_interval_minutes: int | None = None


class SyncIn(BaseModel):
    export_file: str | None = None
    limit: int | None = None  # collect only the most recent N messages


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


class InferIn(BaseModel):
    context: str = ""


# ── read endpoints ─────────────────────────────────────────────────────────
@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "db": str(_settings.db_path)}


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
        "industry": body.industry,
        "sub_industry": body.sub_industry,
        "description": body.description,
        "owner": body.owner,
        "memo": body.memo,
    }
    with get_conn() as conn:
        try:
            result = queries.update_company_profile(conn, canonical_key, fields)
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
        try:
            result = queries.resolve_review(
                conn,
                review_id,
                body.action,
                value=body.value,
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
        try:
            result = queries.add_lead(conn, body.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
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
        try:
            result = queries.log_activity(conn, body.model_dump())
        except KeyError:
            raise HTTPException(status_code=404, detail="contact not found")
    return {"ok": True, **result}


@app.get("/api/glm/status")
def glm_status() -> dict:
    return {"configured": glm.is_configured()}


@app.post("/api/search/glm")
def glm_search(body: GlmSearchIn) -> dict:
    filters = glm.extract_search_filters(body.query)
    with get_conn() as conn:
        result = queries.search_by_filters(conn, filters)
    return {"ok": True, "filters": filters, "mode": filters.get("_mode", "fallback"), **result}


@app.post("/api/companies/{canonical_key}/infer")
def infer_company(canonical_key: str, body: InferIn) -> dict:
    context = body.context
    with get_conn() as conn:
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
    return {"ok": True, "result": glm.infer_company_profile(co["display_name"], context)}


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
def put_settings(body: SyncSettingsIn) -> dict:
    with get_conn() as conn:
        return queries.save_sync_settings(
            conn, body.model_dump(exclude_none=True)
        )


@app.post("/api/sync")
def sync(body: SyncIn | None = None) -> dict:
    return slack_sync.run_sync(
        export_file=body.export_file if body else None,
        limit=body.limit if body else None,
    )


# ── background scheduler (reliable periodic collection) ──────────────────────
# Runs independently of any open dashboard tab. Checks every minute and syncs
# when auto_sync_enabled and the configured interval has elapsed. For 24/7
# reliability across restarts, also consider the collector's OS scheduler
# (cron / launchd) documented in packages/slack-channel-collector/USAGE.md.
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
            if now - _last_auto_run >= interval:
                _last_auto_run = now
                result = slack_sync.run_sync()
                print(f"[auto-sync] {result.get('message')}", flush=True)
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
    app.mount(
        "/",
        StaticFiles(directory=str(_settings.frontend_dist), html=True),
        name="frontend",
    )

