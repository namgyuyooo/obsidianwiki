// Thin fetch client. In dev, Vite proxies /api -> FastAPI (see vite.config.ts).
// For a production build served elsewhere, set VITE_API_BASE.
import type {
  CustomersResponse,
  Review,
  Summary,
  Activity,
  SyncSettings,
} from "../types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface CompanySearchItem {
  id: number;
  canonical_key: string;
  display_name: string;
  industry: string;
  contact_count: number;
}

export interface ResolvePayload {
  action: "approve" | "edit" | "reject" | "link_existing" | "register_new";
  value?: string;
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

export const api = {
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
  sync: (opts?: { exportFile?: string; backfill?: boolean }) =>
    req<{ ok: boolean; running: boolean; started: boolean; message: string }>(
      "/api/sync",
      {
        method: "POST",
        body: JSON.stringify({
          export_file: opts?.exportFile ?? null,
          backfill: opts?.backfill ?? false,
        }),
      }
    ),
  syncStatus: () =>
    req<{
      running: boolean;
      logs: string[];
      result: (Record<string, unknown> & { message?: string }) | null;
    }>("/api/sync/status"),
  updateContact: (email: string, fields: Record<string, string>) =>
    req<{ ok: boolean }>(`/api/contacts/${encodeURIComponent(email)}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    }),
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
    req<{ ok: boolean; created?: boolean }>("/api/slack/messages/apply", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  archiveMessage: (channel_id: string, ts: string, archived = true) =>
    req<{ ok: boolean }>("/api/slack/messages/archive", {
      method: "POST",
      body: JSON.stringify({ channel_id, ts, archived }),
    }),
  resolveUsers: () =>
    req<{ ok: boolean; stored: number; message?: string }>("/api/slack/resolve-users", {
      method: "POST",
    }),
  listAudit: () => req<{ items: AuditBatch[] }>("/api/audit"),
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
  at: string;
  changes: number;
  undone: boolean;
}

export interface ApplyRawPayload {
  channel_id: string;
  ts: string;
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

export interface SlackComment {
  text: string;
  permalink: string;
  user: string;
}
export interface SlackRawMessage {
  channel_id: string;
  ts: string;
  when: string;
  user: string;
  text: string;
  permalink: string;
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
