PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  sub_industry TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  profile_source TEXT NOT NULL DEFAULT 'frontend_seed',
  profile_confidence REAL NOT NULL DEFAULT 0.70,
  needs_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'frontend_alias'
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  department TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '정상',
  is_subscribed INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL DEFAULT '',
  last_seen TEXT NOT NULL DEFAULT '',
  activity_count INTEGER NOT NULL DEFAULT 0,
  inquiry_summary TEXT NOT NULL DEFAULT '',
  seed_source TEXT NOT NULL DEFAULT 'frontend_base',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS solutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS contact_interests (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  solution_id INTEGER NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'frontend_seed',
  PRIMARY KEY (contact_id, solution_id)
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_sources (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, source_id)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  source_type TEXT NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  email_snapshot TEXT NOT NULL DEFAULT '',
  name_snapshot TEXT NOT NULL DEFAULT '',
  company_snapshot TEXT NOT NULL DEFAULT '',
  solution_name TEXT NOT NULL DEFAULT '',
  inquiry_text TEXT NOT NULL DEFAULT '',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.80,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slack_ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  export_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slack_raw_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES slack_ingest_runs(id) ON DELETE SET NULL,
  channel_id TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, message_ts)
);

CREATE TABLE IF NOT EXISTS glm_extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_message_id INTEGER REFERENCES slack_raw_messages(id) ON DELETE SET NULL,
  extraction_type TEXT NOT NULL DEFAULT 'lead_event',
  extracted_payload TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'staged',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consistency_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  field_name TEXT NOT NULL,
  current_value TEXT NOT NULL DEFAULT '',
  proposed_value TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  source_table TEXT NOT NULL DEFAULT '',
  source_id INTEGER,
  confidence REAL NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT NOT NULL DEFAULT '',
  resolution_note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_company_id ON activities(company_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON consistency_reviews(status);
CREATE INDEX IF NOT EXISTS idx_slack_raw_messages_ts ON slack_raw_messages(channel_id, message_ts);

CREATE VIEW IF NOT EXISTS v_customer_dashboard AS
SELECT
  contacts.id AS contact_id,
  contacts.email,
  contacts.name,
  companies.display_name AS company,
  contacts.department,
  contacts.title,
  contacts.phone,
  contacts.status,
  contacts.is_subscribed,
  contacts.first_seen,
  contacts.last_seen,
  contacts.activity_count,
  contacts.inquiry_summary,
  companies.industry,
  companies.sub_industry,
  companies.owner,
  companies.memo
FROM contacts
LEFT JOIN companies ON contacts.company_id = companies.id;

CREATE VIEW IF NOT EXISTS v_pending_consistency_reviews AS
SELECT
  id,
  review_type,
  entity_type,
  entity_id,
  field_name,
  current_value,
  proposed_value,
  evidence,
  confidence,
  requested_at
FROM consistency_reviews
WHERE status = 'pending'
ORDER BY confidence ASC, requested_at ASC;
