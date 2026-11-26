-- Instance-scoped account service grants. The canonical identity is
-- (account_id, app_id, service_id); the resource and normalized declaration
-- snapshot are part of the cryptographic binding.
--
-- This ledger is the single grant record consumed by the V1 catalog and
-- credential issuer. The OAuth login transaction owned by OPS-051 (#211)
-- writes it through ApplicationServiceRepository.establishLoginGrants; no
-- second OAuth grant ledger or bare-serviceId alias is introduced here.
CREATE TABLE application_service_grants (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES application_instances(app_id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  manifest_revision INTEGER NOT NULL CHECK (manifest_revision > 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  granted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (account_id, app_id, service_id)
);

CREATE INDEX idx_application_service_grants_application
  ON application_service_grants(app_id, service_id);
