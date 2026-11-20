-- WHO WEB: add a genuine browser device platform without altering existing
-- Desktop/Mobile rows or changing Host/Relay authorization.
-- The migration runner temporarily disables FK enforcement ONLY for this
-- transactional table rebuild, then verifies every FK before commit.
DROP TRIGGER IF EXISTS trg_desktop_hosts_device_revoked;
DROP TRIGGER IF EXISTS trg_host_grant_policies_mobile_registered;
DROP TRIGGER IF EXISTS trg_host_grant_policies_mobile_revoked;

CREATE TABLE devices_web_upgrade (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('desktop', 'mobile', 'web')),
  client_name TEXT,
  client_version TEXT,
  public_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  revoke_reason TEXT,
  UNIQUE (account_id, installation_id)
);
INSERT INTO devices_web_upgrade (
  id, account_id, installation_id, platform, client_name, client_version,
  public_key, created_at, last_seen_at, revoked_at, revoke_reason
)
SELECT id, account_id, installation_id, platform, client_name, client_version,
  public_key, created_at, last_seen_at, revoked_at, revoke_reason
FROM devices;

DROP TABLE devices;
ALTER TABLE devices_web_upgrade RENAME TO devices;
CREATE INDEX idx_devices_active_lookup ON devices(account_id, revoked_at);

CREATE TRIGGER trg_desktop_hosts_device_revoked
AFTER UPDATE OF revoked_at ON devices
WHEN NEW.revoked_at IS NOT NULL
BEGIN
  UPDATE desktop_hosts
     SET revoked_at = COALESCE(revoked_at, NEW.revoked_at),
         revoke_reason = COALESCE(revoke_reason, 'host_device_revoked'),
         updated_at = NEW.revoked_at
   WHERE device_id = NEW.id
     AND revoked_at IS NULL;
END;

CREATE TRIGGER trg_host_grant_policies_mobile_registered
AFTER INSERT ON devices
WHEN NEW.platform = 'mobile'
BEGIN
  UPDATE host_grant_policies
     SET revision = revision + 1,
         updated_at = NEW.created_at
   WHERE account_id = NEW.account_id;
END;

CREATE TRIGGER trg_host_grant_policies_mobile_revoked
AFTER UPDATE OF revoked_at ON devices
WHEN NEW.platform = 'mobile'
  AND NEW.revoked_at IS NOT NULL
  AND OLD.revoked_at IS NULL
BEGIN
  UPDATE host_grant_policies
     SET revision = revision + 1,
         updated_at = NEW.revoked_at
   WHERE account_id = NEW.account_id;
END;
