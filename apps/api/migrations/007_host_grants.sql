-- OPS-020 Host -> same-account Mobile capability grant ledger.
--
-- The policy row owns the Desktop owner's preselected Host ceiling. An
-- override row can only narrow or revoke one Mobile; absence of an override
-- means the Mobile inherits the current policy ceiling. Active Mobile eligibility
-- is derived from `devices`, so a Mobile linked after the policy is written
-- inherits the policy without an onsite pairing step.

CREATE TABLE host_grant_policies (
  host_id TEXT PRIMARY KEY REFERENCES desktop_hosts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  policy_scopes TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_host_grant_policies_account
  ON host_grant_policies(account_id);

CREATE TABLE host_mobile_grant_overrides (
  host_id TEXT NOT NULL REFERENCES desktop_hosts(id) ON DELETE CASCADE,
  mobile_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,
  revoked_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (host_id, mobile_device_id)
);

CREATE INDEX idx_host_mobile_grant_overrides_account
  ON host_mobile_grant_overrides(account_id);

-- A newly linked same-account Mobile is a snapshot change even though the
-- Desktop policy did not change, so every existing Host ledger revision moves.
CREATE TRIGGER trg_host_grant_policies_mobile_registered
AFTER INSERT ON devices
WHEN NEW.platform = 'mobile'
BEGIN
  UPDATE host_grant_policies
     SET revision = revision + 1,
         updated_at = NEW.created_at
   WHERE account_id = NEW.account_id;
END;

-- Device revocation withdraws future Mobile eligibility and is observable in
-- the next Host snapshot revision.
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
