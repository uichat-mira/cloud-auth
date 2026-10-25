CREATE TABLE desktop_hosts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  relay_room TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  advertised_at TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT,
  UNIQUE (device_id)
);

CREATE INDEX idx_desktop_hosts_account_active
  ON desktop_hosts(account_id, revoked_at);

CREATE INDEX idx_desktop_hosts_session
  ON desktop_hosts(session_id);

CREATE INDEX idx_oauth_authorization_codes_consumed_session
  ON oauth_authorization_codes(consumed_by_session_id);

-- Host presence cannot outlive the Cloud Session that advertised it. This
-- covers logout, password change, account deny/disable, and the session revoke
-- performed by device revocation without duplicating policy in each caller.
CREATE TRIGGER trg_desktop_hosts_session_revoked
AFTER UPDATE OF revoked_at ON sessions
WHEN NEW.revoked_at IS NOT NULL
BEGIN
  UPDATE desktop_hosts
     SET revoked_at = COALESCE(revoked_at, NEW.revoked_at),
         revoke_reason = COALESCE(revoke_reason, 'host_session_revoked'),
         updated_at = NEW.revoked_at
   WHERE session_id = NEW.id
     AND revoked_at IS NULL;
END;

-- Device revocation may revoke sessions first, so apply the device reason to
-- any Host row that is still active for the device.
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
