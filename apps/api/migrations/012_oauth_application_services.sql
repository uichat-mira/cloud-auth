-- Trusted application metadata and declarations are administrator-owned.
-- The management authentication and enrollment API are a separate boundary.
CREATE TABLE oauth_cloud_applications (
  client_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL UNIQUE,
  disabled_at TEXT
);

CREATE TABLE oauth_cloud_application_services (
  service_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_cloud_applications(client_id),
  definition_json TEXT NOT NULL,
  retired_at TEXT
);
CREATE INDEX idx_oauth_cloud_application_services_client
  ON oauth_cloud_application_services(client_id);

-- NULL preserves the native and pre-enrollment first-party code contract.
ALTER TABLE oauth_authorization_codes ADD COLUMN service_grant_fingerprint TEXT;
