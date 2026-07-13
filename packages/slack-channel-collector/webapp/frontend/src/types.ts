// Compact customer record, matching the API shape (and the original HTML `recs`).
export interface Customer {
  e: string; // email
  n: string; // name
  c: string; // company display name
  d: string; // department
  t: string; // title
  p: string; // phone
  i: string[]; // interests (solution names)
  s: string[]; // source labels
  tags: string[]; // free-form tags
  st: string; // status (정상 / 내부 / 테스트)
  sub: number; // is_subscribed
  f: string; // first_seen
  l: string; // last_seen
  a: number; // activity_count
  q: string; // inquiry_summary
  ckey: string; // company canonical key
  isNew?: boolean; // set client-side after a sync/manual add
}

export interface CompanyProfile {
  key: string;
  name: string;
  ind: string; // industry
  sub: string; // sub_industry
  desc: string; // description
  owner: string;
  memo: string;
  auto: boolean; // auto-estimated (frontend_auto_cinfo)
  new?: boolean; // collected within last 24h
  act_count?: number; // activities attached to this company
  act_last?: string; // last activity date
  contact_count?: number;
}

export interface ActivityComment {
  ts: string;
  text: string;
  permalink: string;
}

export interface Activity {
  id?: number;
  dt: string;
  src: string; // relate | featpaper | manual
  atype: string; // sales-touch type (방문/콜/견적/데모…)
  next: string; // next action
  em: string;
  nm: string;
  co: string;
  cokey?: string; // company canonical key (robust matching across merges)
  it: string;
  iq: string;
  link: string; // Slack permalink
  comments: ActivityComment[]; // thread replies
}

export interface ChannelCfg {
  id: string;
  name: string;
  strategy: "inbound" | "cross_team" | "business_card";
  enabled: boolean;
}

export interface SyncSettings {
  channels: ChannelCfg[];
  lookback_hours: number;
  sync_limit: number;
  include_relate: boolean;
  include_featpaper: boolean;
  require_review_for_new_company: boolean;
  glm_parse_cross_team: boolean;
  slack_callback_enabled: boolean;
  slack_callback_mode: "off" | "reaction" | "thread";
  slack_callback_reaction: string;
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  channel_state: Record<string, number>;
}

export interface RawSource {
  text: string;
  channel_id: string;
  message_ts: string;
  user_id: string;
  permalink: string;
}

export interface Interpretation {
  kind: string;
  confidence: number;
  payload: Record<string, unknown>;
}

export interface EntityContext {
  email: string;
  name: string;
  company_id: number | null;
  company: string;
  domain_suggestion?: {
    domain: string;
    company_id: number | null;
    company_key: string;
    company_name: string;
    confidence: number;
    reason: string;
    derived: boolean;
    candidates: Array<{
      company_id: number;
      company_key: string;
      company_name: string;
      count: number;
    }>;
  };
}

export interface Review {
  id: number;
  review_type: string;
  entity_type: string;
  entity_id: number | null;
  field_name: string;
  current_value: string;
  proposed_value: string;
  evidence: string;
  confidence: number;
  status: string;
  requested_at: string;
  resolved_at: string | null;
  source_table: string;
  source_id: number | null;
  raw_source: RawSource | null;
  interpretation: Interpretation | null;
  entity_context?: EntityContext;
}

export interface Summary {
  companies: number;
  contacts: number;
  activities: number;
  pending_reviews: number;
}

export interface CustomersResponse {
  items: Customer[];
  companies: Record<string, CompanyProfile>;
}

export type ViewMode = "company" | "person" | "owner";

export interface UiState {
  q: string;
  src: string;
  interest: string;
  status: string;
  owner: string; // internal-owner filter
  tag: string; // tag filter
  sort: string;
  dir: number;
  page: number;
  per: number;
  view: ViewMode;
}
