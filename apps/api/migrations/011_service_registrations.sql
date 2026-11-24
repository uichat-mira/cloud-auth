CREATE TABLE service_registrations (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  revoked_at TEXT,
  PRIMARY KEY (account_id, service_id)
);

CREATE INDEX idx_service_registrations_service_id ON service_registrations(service_id);
