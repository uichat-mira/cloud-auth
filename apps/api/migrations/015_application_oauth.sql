ALTER TABLE application_instances ADD COLUMN disabled_at TEXT;

CREATE TABLE application_oauth_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES application_instances(app_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  manifest_revision INTEGER NOT NULL,
  code_challenge TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX idx_application_oauth_codes_account_app ON application_oauth_codes(account_id, app_id);

CREATE TABLE application_oauth_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES application_instances(app_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  manifest_revision INTEGER NOT NULL,
  secret_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_application_oauth_sessions_account_app ON application_oauth_sessions(account_id, app_id);

-- Retire sessions obtained through the previous open-application OAuth path.
-- Native Desktop/Mobile OAuth sessions and direct account sessions are untouched.
UPDATE sessions
   SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       revoke_reason = 'open_application_oauth_retired'
 WHERE revoked_at IS NULL
   AND id IN (
     SELECT consumed_by_session_id FROM oauth_authorization_codes
      WHERE client_id NOT IN ('mira-mobile', 'mira-desktop')
        AND consumed_by_session_id IS NOT NULL
   );
UPDATE oauth_authorization_codes
   SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       consume_reason = 'open_application_oauth_retired'
 WHERE consumed_at IS NULL AND client_id NOT IN ('mira-mobile', 'mira-desktop');
