import type { DatabaseSync } from "node:sqlite";

export interface AuthorizationCodeRecord {
  id: string;
  accountId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  secretHash: string;
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
  consumedBySessionId: string | null;
  consumeReason: string | null;
}

export interface CreateAuthorizationCodeInput {
  id: string;
  accountId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  secretHash: string;
  expiresAt: string;
  now: string;
}

type AuthorizationCodeRow = {
  id: string;
  account_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  secret_hash: string;
  expires_at: string;
  created_at: string;
  consumed_at: string | null;
  consumed_by_session_id: string | null;
  consume_reason: string | null;
};

export class OAuthRepository {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * The account admission check and insert share one transaction so a disable
   * or deny that commits before issuance cannot leave a usable code behind.
   */
  createAuthorizationCodeIfAccountActive(input: CreateAuthorizationCodeInput): boolean {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = this.db
        .prepare(
          `INSERT INTO oauth_authorization_codes (
             id, account_id, client_id, redirect_uri, code_challenge,
             code_challenge_method, secret_hash, expires_at, created_at,
             consumed_at, consumed_by_session_id, consume_reason
           )
           SELECT ?, a.id, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL
             FROM accounts a
            WHERE a.id = ?
              AND a.is_allowed = 1
              AND a.disabled_at IS NULL`,
        )
        .run(
          input.id,
          input.clientId,
          input.redirectUri,
          input.codeChallenge,
          input.codeChallengeMethod,
          input.secretHash,
          input.expiresAt,
          input.now,
          input.accountId,
        );

      if (result.changes !== 1) {
        this.db.exec("ROLLBACK;");
        return false;
      }

      this.db.exec("COMMIT;");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  findAuthorizationCode(id: string): AuthorizationCodeRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, account_id, client_id, redirect_uri, code_challenge,
                code_challenge_method, secret_hash, expires_at, created_at,
                consumed_at, consumed_by_session_id, consume_reason
           FROM oauth_authorization_codes
          WHERE id = ?`,
      )
      .get(id) as AuthorizationCodeRow | undefined;
    return row ? mapAuthorizationCode(row) : null;
  }
}

function mapAuthorizationCode(row: AuthorizationCodeRow): AuthorizationCodeRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    secretHash: row.secret_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
    consumedBySessionId: row.consumed_by_session_id,
    consumeReason: row.consume_reason,
  };
}
