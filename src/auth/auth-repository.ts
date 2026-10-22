import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface AccountRecord {
  id: string;
  username: string;
  usernameNormalized: string;
  passwordHash: string;
  isAllowed: boolean;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  passwordChangedAt: string;
  lastLoginAt: string | null;
}

export interface SessionRecord {
  id: string;
  accountId: string;
  deviceId: string | null;
  secretHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface SessionWithAccount {
  session: SessionRecord;
  account: AccountRecord;
}

type AccountRow = {
  id: string;
  username: string;
  username_normalized: string;
  password_hash: string;
  is_allowed: number;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
  password_changed_at: string;
  last_login_at: string | null;
};

type SessionAccountRow = AccountRow & {
  session_id: string;
  account_id: string;
  device_id: string | null;
  secret_hash: string;
  expires_at: string;
  session_created_at: string;
  last_seen_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export class AuthRepository {
  constructor(private readonly db: DatabaseSync) {}

  findAccountByUsername(usernameNormalized: string): AccountRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, username, username_normalized, password_hash, is_allowed, disabled_at,
                created_at, updated_at, password_changed_at, last_login_at
           FROM accounts
          WHERE username_normalized = ?`,
      )
      .get(usernameNormalized) as AccountRow | undefined;
    return row ? mapAccount(row) : null;
  }

  findAccountById(accountId: string): AccountRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, username, username_normalized, password_hash, is_allowed, disabled_at,
                created_at, updated_at, password_changed_at, last_login_at
           FROM accounts
          WHERE id = ?`,
      )
      .get(accountId) as AccountRow | undefined;
    return row ? mapAccount(row) : null;
  }

  createAccount(username: string, usernameNormalized: string, passwordHash: string, now: string): AccountRecord {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO accounts (
           id, username, username_normalized, password_hash, is_allowed, disabled_at,
           created_at, updated_at, password_changed_at
         ) VALUES (?, ?, ?, ?, 1, NULL, ?, ?, ?)`,
      )
      .run(id, username, usernameNormalized, passwordHash, now, now, now);

    const account = this.findAccountById(id);
    if (!account) throw new Error("Account insert did not persist");
    return account;
  }

  updateLastLogin(accountId: string, now: string): void {
    this.db
      .prepare("UPDATE accounts SET last_login_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, accountId);
  }

  updatePasswordAndRevokeSessions(accountId: string, passwordHash: string, now: string): void {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare(
          "UPDATE accounts SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(passwordHash, now, now, accountId);
      this.revokeAllSessions(accountId, "password_reset", now);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  setAllowedAndRevokeIfDenied(accountId: string, allowed: boolean, now: string): void {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare("UPDATE accounts SET is_allowed = ?, updated_at = ? WHERE id = ?")
        .run(allowed ? 1 : 0, now, accountId);
      if (!allowed) this.revokeAllSessions(accountId, "admission_revoked", now);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  setDisabledAndRevoke(accountId: string, disabled: boolean, now: string): void {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare("UPDATE accounts SET disabled_at = ?, updated_at = ? WHERE id = ?")
        .run(disabled ? now : null, now, accountId);
      if (disabled) this.revokeAllSessions(accountId, "account_disabled", now);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  createSessionIfAccountActive(
    id: string,
    accountId: string,
    expectedPasswordChangedAt: string,
    secretHash: string,
    expiresAt: string,
    now: string,
  ): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO sessions (
           id, account_id, device_id, secret_hash, expires_at,
           created_at, last_seen_at, rotated_at, revoked_at, revoke_reason
         )
         SELECT ?, id, NULL, ?, ?, ?, ?, NULL, NULL, NULL
           FROM accounts
          WHERE id = ?
            AND is_allowed = 1
            AND disabled_at IS NULL
            AND password_changed_at = ?`,
      )
      .run(id, secretHash, expiresAt, now, now, accountId, expectedPasswordChangedAt);
    return result.changes === 1;
  }

  findSessionWithAccount(sessionId: string): SessionWithAccount | null {
    const row = this.db
      .prepare(
        `SELECT
           s.id AS session_id, s.account_id, s.device_id, s.secret_hash, s.expires_at,
           s.created_at AS session_created_at, s.last_seen_at, s.rotated_at, s.revoked_at, s.revoke_reason,
           a.id, a.username, a.username_normalized, a.password_hash, a.is_allowed, a.disabled_at,
           a.created_at, a.updated_at, a.password_changed_at, a.last_login_at
         FROM sessions s
         JOIN accounts a ON a.id = s.account_id
         WHERE s.id = ?`,
      )
      .get(sessionId) as SessionAccountRow | undefined;

    if (!row) return null;
    return {
      session: {
        id: row.session_id,
        accountId: row.account_id,
        deviceId: row.device_id,
        secretHash: row.secret_hash,
        expiresAt: row.expires_at,
        createdAt: row.session_created_at,
        lastSeenAt: row.last_seen_at,
        rotatedAt: row.rotated_at,
        revokedAt: row.revoked_at,
        revokeReason: row.revoke_reason,
      },
      account: mapAccount(row),
    };
  }

  touchSession(sessionId: string, now: string): void {
    this.db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, sessionId);
  }

  rotateSession(
    sessionId: string,
    expectedSecretHash: string,
    secretHash: string,
    expiresAt: string,
    now: string,
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE sessions
            SET secret_hash = ?, expires_at = ?, last_seen_at = ?, rotated_at = ?
          WHERE id = ? AND secret_hash = ? AND revoked_at IS NULL`,
      )
      .run(secretHash, expiresAt, now, now, sessionId, expectedSecretHash);
    return result.changes === 1;
  }

  revokeSession(sessionId: string, reason: string, now: string): void {
    this.db
      .prepare(
        `UPDATE sessions
            SET revoked_at = COALESCE(revoked_at, ?),
                revoke_reason = COALESCE(revoke_reason, ?)
          WHERE id = ?`,
      )
      .run(now, reason, sessionId);
  }

  private revokeAllSessions(accountId: string, reason: string, now: string): void {
    this.db
      .prepare(
        `UPDATE sessions
            SET revoked_at = COALESCE(revoked_at, ?),
                revoke_reason = COALESCE(revoke_reason, ?)
          WHERE account_id = ? AND revoked_at IS NULL`,
      )
      .run(now, reason, accountId);
  }
}

function mapAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    username: row.username,
    usernameNormalized: row.username_normalized,
    passwordHash: row.password_hash,
    isAllowed: row.is_allowed === 1,
    disabledAt: row.disabled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    passwordChangedAt: row.password_changed_at,
    lastLoginAt: row.last_login_at,
  };
}
