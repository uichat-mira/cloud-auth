CREATE TABLE oauth_authorization_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL CHECK (code_challenge_method = 'S256'),
  secret_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TEXT,
  consumed_by_session_id TEXT,
  consume_reason TEXT
);

CREATE INDEX idx_oauth_authorization_codes_expiry
  ON oauth_authorization_codes(expires_at, consumed_at);

CREATE INDEX idx_oauth_authorization_codes_account
  ON oauth_authorization_codes(account_id);
