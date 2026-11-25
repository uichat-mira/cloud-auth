-- An ownerless legacy app stays under operator control until explicitly assigned.
ALTER TABLE oauth_cloud_applications ADD COLUMN owner_account_id TEXT REFERENCES accounts(id);
CREATE INDEX idx_oauth_application_owner ON oauth_cloud_applications(owner_account_id);
-- The operator grants developer eligibility and approved origins to an account
-- once. New applications on those origins are created by the owner, not CLI.
CREATE TABLE application_developer_permissions (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  endpoint_origins_json TEXT NOT NULL,
  reserved_projects_json TEXT NOT NULL
);
