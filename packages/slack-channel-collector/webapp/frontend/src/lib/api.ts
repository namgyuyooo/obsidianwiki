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
  sync: (exportFile?: string) =>
    req<{ ok: boolean; configured: boolean; message: string; new_leads?: number }>(
      "/api/sync",
      { method: "POST", body: JSON.stringify({ export_file: exportFile ?? null }) }
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
  duplicates: () =>
    req<{ groups: DuplicateGroup[] }>("/api/companies/duplicates"),
  mergeCompanies: (keep_key: string, merge_keys: string[]) =>
    req<{ ok: boolean; moved_contacts: number; moved_activities: number }>(
      "/api/companies/merge",
      { method: "POST", body: JSON.stringify({ keep_key, merge_keys }) }
    ),
};

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
