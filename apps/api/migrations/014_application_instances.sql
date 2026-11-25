CREATE TABLE application_instances (
  app_id TEXT PRIMARY KEY,
  owner_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  origin TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  manifest_revision INTEGER NOT NULL CHECK (manifest_revision > 0),
  manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_application_instances_owner
  ON application_instances(owner_account_id);
