CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('desktop', 'mobile')),
  client_name TEXT,
  client_version TEXT,
  public_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  revoke_reason TEXT,
  UNIQUE (account_id, installation_id)
);

CREATE INDEX idx_devices_active_lookup ON devices(account_id, revoked_at);
