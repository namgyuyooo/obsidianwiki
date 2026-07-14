// Thin fetch client. In dev, Vite proxies /api -> FastAPI (see vite.config.ts).
// For a production build served elsewhere, set VITE_API_BASE.
import type {
  CustomersResponse,
  Review,
  Summary,
  Activity,
  AdminUser,
  AuthUser,
  SyncSettings,
} from "../types";

const BASE = import.meta.env.VITE_API_BASE ?? "";
const AUTH_KEY = "rtm-ops-api-key";

export const apiAuth = {
  get: () => localStorage.getItem(AUTH_KEY) || "",
  set: (value: string) => {
    const v = value.trim();
    if (v) localStorage.setItem(AUTH_KEY, v);
    else localStorage.removeItem(AUTH_KEY);
  },
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = apiAuth.get();
  const headers = {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-RTM-API-Key": apiKey } : {}),
    ...(init?.headers || {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function reqBlob(path: string): Promise<Blob> {
  const apiKey = apiAuth.get();
  const res = await fetch(`${BASE}${path}`, {
    headers: apiKey ? { "X-RTM-API-Key": apiKey } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.blob();
}

export interface CompanySearchItem {
  id: number;
  canonical_key: string;
  display_name: string;
  industry: string;
  contact_count: number;
}

export interface ResolvePayload {
  action: "approve" | "edit" | "reject" | "link_existing" | "register_new" | "apply_fields";
  value?: string;
  fields?: Record<string, string>;
  company_key?: string;
  company_name?: string;
  company_fields?: Record<string, string>;
}

export interface LeadPayload {
  email: string;
  name?: string;
  company?: string;
  department?: string;
  title?: string;
  phone?: string;
  interest?: string;
  tag?: string;
  memo?: string;
  occurred_at?: string;
}

export interface ActivityPayload {
  email?: string;
  company_key?: string;
  activity_type?: string;
  solution_name?: string;
  note?: string;
  next_action?: string;
  occurred_at?: string;
}

export interface GlmSearchResult {
  ok: boolean;
  mode: string;
  emails: string[];
  count: number;
  filters: Record<string, unknown>;
}

export interface GlmAdminSettings {
  provider: "glm" | "ollama" | "internal";
  api_url: string;
  model: string;
  api_key_configured: boolean;
  api_key_hint: string;
}

export interface SlackAdminSettings {
  bot_token_configured: boolean;
  bot_token_hint: string;
}

export interface SchedulerRun extends JobRun {
  duration_seconds: number;
}

export interface SchedulerStatus {
  enabled: boolean;
  interval_minutes: number;
  heartbeat: number;
  healthy: boolean;
  next_run: number;
  last_error: string;
  sync_running: boolean;
  business_card_batch_size: number;
  card_queue: { pending: number; processing: number; retrying: number; applied: number };
  runs: SchedulerRun[];
}

export const api = {
  login: (payload: { email?: string; password?: string; api_key?: string }) =>
    req<{ ok: boolean; token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: () => req<{ ok: boolean; user: AuthUser }>("/api/auth/me"),
  adminUsers: () =>
    req<{ items: AdminUser[]; roles: Record<string, string[]> }>("/api/admin/users"),
  createAdminUser: (payload: { email: string; name?: string; role: string; password?: string }) =>
    req<{ ok: boolean; user: AdminUser }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAdminUser: (id: number, patch: Partial<AdminUser> & { password?: string }) =>
    req<{ ok: boolean; user: AdminUser }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  summary: () => req<Summary>("/api/summary"),
  customers: () => req<CustomersResponse>("/api/customers"),
  activities: () => req<{ items: Activity[] }>("/api/activities"),
  reviews: (status = "pending") =>
    req<{ items: Review[] }>(`/api/reviews?status=${encodeURIComponent(status)}`),
  guide: () => req<{ ok: boolean; markdown: string; message?: string }>("/api/guide"),
  searchCompanies: (q: string) =>
    req<{ items: CompanySearchItem[] }>(
      `/api/companies/search?q=${encodeURIComponent(q)}`
    ),
  updateCompany: (key: string, fields: Record<string, string>) =>
    req<{ ok: boolean }>(`/api/companies/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    }),
  resolveReview: (id: number, payload: ResolvePayload) =>
    req<{ ok: boolean }>(`/api/reviews/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  addLead: (payload: LeadPayload) =>
    req<{ ok: boolean; created: boolean }>("/api/leads", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sync: (opts?: { exportFile?: string; backfill?: boolean; onlyChannel?: string }) =>
    req<{ ok: boolean; running: boolean; started: boolean; message: string }>(
      "/api/sync",
      {
        method: "POST",
        body: JSON.stringify({
          export_file: opts?.exportFile ?? null,
          backfill: opts?.backfill ?? false,
          only_channel: opts?.onlyChannel ?? null,
        }),
      }
    ),
  deleteCompany: (key: string) =>
    req<{ ok: boolean }>(`/api/companies/${encodeURIComponent(key)}`, { method: "DELETE" }),
  deleteCompanies: (keys: string[]) =>
    req<{ ok: boolean; deleted: number; not_found: string[] }>("/api/companies/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ keys }),
    }),
  recleanse: () =>
    req<{ ok: boolean; running: boolean; started: boolean; message: string }>(
      "/api/recleanse",
      { method: "POST" }
    ),
  syncStatus: () =>
    req<{
      running: boolean;
      logs: string[];
      result: (Record<string, unknown> & { message?: string }) | null;
      kind?: string;
      label?: string;
      progress?: { current: number; total: number; message: string };
    }>("/api/sync/status"),
  updateContact: (email: string, fields: Record<string, string>) =>
    req<{ ok: boolean }>(`/api/contacts/${encodeURIComponent(email)}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    }),
  deleteContact: (email: string) =>
    req<{ ok: boolean; detached_activities: number; closed_reviews: number }>(
      `/api/contacts/${encodeURIComponent(email)}`,
      { method: "DELETE" }
    ),
  reassignActivities: (from_key: string, to_company: string) =>
    req<{ ok: boolean; moved: number }>("/api/companies/reassign", {
      method: "POST",
      body: JSON.stringify({ from_key, to_company }),
    }),
  reassignActivity: (id: number, company: string) =>
    req<{ ok: boolean }>(`/api/activities/${id}/reassign`, {
      method: "POST",
      body: JSON.stringify({ company }),
    }),
  unclassified: () =>
    req<{ items: { id: number; dt: string; text: string; suggestion: string }[] }>(
      "/api/unclassified"
    ),
  reclassifyGlm: (key: string) =>
    req<{ ok: boolean; moved: number; message?: string }>(
      `/api/companies/${encodeURIComponent(key)}/reclassify-glm`,
      { method: "POST" }
    ),
  setTags: (email: string, tags: string[]) =>
    req<{ ok: boolean; tags: string[] }>(
      `/api/contacts/${encodeURIComponent(email)}/tags`,
      { method: "PUT", body: JSON.stringify({ tags }) }
    ),
  logActivity: (payload: ActivityPayload) =>
    req<{ ok: boolean }>("/api/activities", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getSettings: () => req<SyncSettings>("/api/settings"),
  saveSettings: (patch: Partial<SyncSettings>) =>
    req<SyncSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  glmStatus: () => req<{ configured: boolean }>("/api/glm/status"),
  glmAdminSettings: () => req<GlmAdminSettings>("/api/admin/glm-settings"),
  saveGlmAdminSettings: (payload: {
    provider: GlmAdminSettings["provider"];
    api_url: string;
    model: string;
    api_key?: string;
    clear_api_key?: boolean;
  }) => req<GlmAdminSettings & { ok: boolean }>("/api/admin/glm-settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  }),
  testGlmAdminSettings: () => req<{ ok: boolean; message: string; response: string }>(
    "/api/admin/glm-settings/test",
    { method: "POST" }
  ),
  slackAdminSettings: () => req<SlackAdminSettings>("/api/admin/slack-settings"),
  saveSlackAdminSettings: (payload: { bot_token?: string; clear_bot_token?: boolean }) =>
    req<SlackAdminSettings & { ok: boolean }>("/api/admin/slack-settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testSlackAdminSettings: () => req<{
    ok: boolean; team: string; team_id: string; user: string; user_id: string; url: string;
  }>("/api/admin/slack-settings/test", { method: "POST" }),
  schedulerStatus: (limit = 30) => req<SchedulerStatus>(`/api/scheduler/status?limit=${limit}`),
  runScheduledCheck: () => req<{ ok: boolean; started: boolean; message: string }>(
    "/api/scheduler/run-now", { method: "POST" }
  ),
  glmSearch: (query: string) =>
    req<GlmSearchResult>("/api/search/glm", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
  inferCompany: (key: string, context = "") =>
    req<{ ok: boolean; result: Record<string, unknown> }>(
      `/api/companies/${encodeURIComponent(key)}/infer`,
      { method: "POST", body: JSON.stringify({ context }) }
    ),
  // 백그라운드 작업으로 시작만 하고, 진행률/결과는 syncStatus 폴링으로 받는다.
  inferCompaniesBatch: (limit = 30) =>
    req<{ ok: boolean; running?: boolean; started?: boolean; message?: string }>(
      "/api/companies/infer-batch",
      { method: "POST", body: JSON.stringify({ limit }) }
    ),
  slackMessages: (q = "", limit = 300) =>
    req<{ items: SlackRawMessage[] }>(
      `/api/slack/messages?limit=${limit}&q=${encodeURIComponent(q)}`
    ),
  glmExtract: (text: string, hint = "") =>
    req<{ ok: boolean; result: Record<string, unknown> }>("/api/glm/extract", {
      method: "POST",
      body: JSON.stringify({ text, hint }),
    }),
  applyRawMessage: (payload: ApplyRawPayload) =>
    req<{ ok: boolean; created?: boolean; message_applied?: boolean; applied_cards?: number; total_cards?: number }>("/api/slack/messages/apply", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  archiveMessage: (channel_id: string, ts: string, archived = true, file_id = "") =>
    req<{ ok: boolean }>("/api/slack/messages/archive", {
      method: "POST",
      body: JSON.stringify({ channel_id, ts, archived, file_id }),
    }),
  ocrCard: (channel_id: string, ts: string, file_id = "") =>
    req<{ ok: boolean; message?: string; cards?: OcrCard[]; logs?: string[] }>(
      "/api/slack/messages/ocr-card",
      { method: "POST", body: JSON.stringify({ channel_id, ts, file_id }) }
    ),
  cardImage: (channel_id: string, ts: string, file_id: string) =>
    reqBlob(`/api/slack/messages/card-image?channel_id=${encodeURIComponent(channel_id)}&ts=${encodeURIComponent(ts)}&file_id=${encodeURIComponent(file_id)}`),
  resolveUsers: () =>
    req<{ ok: boolean; stored: number; message?: string }>("/api/slack/resolve-users", {
      method: "POST",
    }),
  listAudit: () => req<{ items: AuditBatch[] }>("/api/audit"),
  listJobs: () => req<{ items: JobRun[] }>("/api/jobs"),
  undoBatch: (batch: string) =>
    req<{ ok: boolean; undone: number }>(`/api/audit/${encodeURIComponent(batch)}/undo`, {
      method: "POST",
    }),
  duplicates: () =>
    req<{ groups: DuplicateGroup[] }>("/api/companies/duplicates"),
  dismissDuplicate: (keys: string[]) =>
    req<{ ok: boolean }>("/api/companies/dismiss-duplicate", {
      method: "POST",
      body: JSON.stringify({ keys }),
    }),
  mergeCompanies: (keep_key: string, merge_keys: string[]) =>
    req<{ ok: boolean; moved_contacts: number; moved_activities: number }>(
      "/api/companies/merge",
      { method: "POST", body: JSON.stringify({ keep_key, merge_keys }) }
    ),
};

export interface AuditBatch {
  batch: string;
  label: string;
  actor_email: string;
  source: string;
  at: string;
  changes: number;
  undone: boolean;
}

export interface JobRun {
  id: number;
  job_type: string;
  status: string;
  actor_email: string;
  target_scope: string;
  input_summary: string;
  result_summary: string;
  error_message: string;
  started_at: string;
  finished_at: string;
}

export interface ApplyRawPayload {
  channel_id: string;
  ts: string;
  file_id?: string;
  company?: string;
  email?: string;
  name?: string;
  phone?: string;
  department?: string;
  title?: string;
  solution?: string;
  activity_type?: string;
  note?: string;
  next_action?: string;
  occurred_at?: string;
}

export interface OcrCard {
  file_id: string;
  file_name: string;
  ok: boolean;
  message?: string;
  provider?: string;
  confidence?: number;
  evidence?: string;
  rotation?: number;
  fields?: {
    company?: string;
    name?: string;
    email?: string;
    department?: string;
    title?: string;
    phone?: string;
  };
}

export interface SlackComment {
  text: string;
  permalink: string;
  user: string;
}
export interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  pretty_type: string;
  size: number;
  card_status?: "pending" | "parsed" | "applied";
  card_archived?: boolean;
  card_ocr?: OcrCard | null;  // 이전에 저장된 OCR 결과 (있으면 프리필용)
}
export interface SlackRawMessage {
  channel_id: string;
  ts: string;
  when: string;
  user: string;
  text: string;
  permalink: string;
  files: SlackFile[];
  is_business_card_channel: boolean;
  comments: SlackComment[];
  applied: boolean;
  applied_kind: string;
  archived: boolean;
}

export interface DuplicateCompany {
  id: number;
  canonical_key: string;
  display_name: string;
  industry: string;
  contact_count: number;
}
export interface DuplicateGroup {
  key: string;
  companies: DuplicateCompany[];
}
