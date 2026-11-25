import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  WHO_YOU_WEB_OAUTH_CLIENT_ID,
  type DevicePlatform,
} from "@uichat-mira/cloud-auth-contracts";
import { verifyAuthorizationCodeSecret } from "./authorization-code.js";
import { verifyPkceS256 } from "./pkce.js";
import { TrustedApplicationLoginCatalog } from "../trusted-applications/login-catalog.js";
import { ServiceRegistryError, ServiceRegistryRepository } from "../service-registry/repository.js";

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
  serviceGrantFingerprint: string | null;
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

export interface ExchangeAuthorizationCodeInput {
  codeId: string;
  codeSecret: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  installationId: string;
  platform: DevicePlatform;
  now: string;
  sessionId: string;
  sessionSecretHash: string;
  sessionExpiresAt: string;
}

export interface ExchangedAuthorization {
  sessionId: string;
  accountId: string;
  accountUsername: string;
  deviceId: string;
  devicePlatform: DevicePlatform;
  sessionExpiresAt: string;
}

export type ExchangeAuthorizationCodeFailure =
  | "invalid_grant"
  | "device_revoked"
  | "device_platform_mismatch";

export type ExchangeAuthorizationCodeResult =
  | { ok: true; value: ExchangedAuthorization }
  | { ok: false; reason: ExchangeAuthorizationCodeFailure };

type ExchangeDeviceRow = {
  id: string;
  platform: DevicePlatform;
  revoked_at: string | null;
};

type ExchangeAccountRow = {
  id: string;
  username: string;
  is_allowed: number;
  disabled_at: string | null;
};

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
  service_grant_fingerprint: string | null;
};

export class OAuthRepository {
  private readonly loginCatalog: TrustedApplicationLoginCatalog;
  constructor(private readonly db: DatabaseSync) {
    this.loginCatalog = new TrustedApplicationLoginCatalog(db);
  }

  resolveRegisteredClient(clientId: string, redirectUri: string) {
    return this.loginCatalog.snapshot(clientId, redirectUri)?.client ?? null;
  }

  /**
   * The account admission check and insert share one transaction so a disable
   * or deny that commits before issuance cannot leave a usable code behind.
   */
  createAuthorizationCodeIfAccountActive(input: CreateAuthorizationCodeInput): boolean {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const snapshot = this.loginCatalog.snapshot(input.clientId, input.redirectUri);
      if (!snapshot) {
        this.db.exec("ROLLBACK;");
        return false;
      }
      const result = this.db
        .prepare(
          `INSERT INTO oauth_authorization_codes (
             id, account_id, client_id, redirect_uri, code_challenge,
             code_challenge_method, secret_hash, expires_at, created_at,
             consumed_at, consumed_by_session_id, consume_reason, service_grant_fingerprint
           )
           SELECT ?, a.id, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?
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
          snapshot.fingerprint,
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
                consumed_at, consumed_by_session_id, consume_reason, service_grant_fingerprint
           FROM oauth_authorization_codes
          WHERE id = ?`,
      )
      .get(id) as AuthorizationCodeRow | undefined;
    return row ? mapAuthorizationCode(row) : null;
  }

  /**
   * Consumes the code and creates the device-bound Cloud Session in one
   * BEGIN IMMEDIATE transaction. All code, account, device and platform
   * authority is re-read while the write lock is held so a concurrent
   * exchange, account disable, device revoke, expiry or replay cannot
   * interleave between validation and issuance.
   *
   * The installation id identifies the receiving installation only. Its
   * account ownership and platform come from the server-side device model
   * scoped to the code's account, never from caller-supplied owner fields.
   */
  exchangeAuthorizationCode(
    input: ExchangeAuthorizationCodeInput,
  ): ExchangeAuthorizationCodeResult {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const record = this.findAuthorizationCode(input.codeId);
      const snapshot = record ? this.loginCatalog.snapshot(record.clientId, record.redirectUri) : null;
      const expiresAt = record ? Date.parse(record.expiresAt) : Number.NaN;
      const now = Date.parse(input.now);
      if (
        !record ||
        !Number.isFinite(expiresAt) ||
        !Number.isFinite(now) ||
        record.consumedAt !== null ||
        expiresAt <= now ||
        record.clientId !== input.clientId ||
        record.redirectUri !== input.redirectUri ||
        record.codeChallengeMethod !== "S256" ||
        !verifyAuthorizationCodeSecret(input.codeSecret, record.secretHash) ||
        !verifyPkceS256(input.codeVerifier, record.codeChallenge) ||
        !snapshot || snapshot.client.platform !== input.platform ||
        snapshot.fingerprint !== record.serviceGrantFingerprint
      ) {
        this.db.exec("ROLLBACK;");
        return { ok: false, reason: "invalid_grant" };
      }

      const account = this.db
        .prepare(
          `SELECT id, username, is_allowed, disabled_at
             FROM accounts
            WHERE id = ?`,
        )
        .get(record.accountId) as ExchangeAccountRow | undefined;
      if (!account || account.is_allowed !== 1 || account.disabled_at !== null) {
        this.db.exec("ROLLBACK;");
        return { ok: false, reason: "invalid_grant" };
      }

      const consumed = this.db
        .prepare(
          `UPDATE oauth_authorization_codes
              SET consumed_at = ?, consumed_by_session_id = ?, consume_reason = 'exchanged'
            WHERE id = ? AND consumed_at IS NULL`,
        )
        .run(input.now, input.sessionId, input.codeId);
      if (consumed.changes !== 1) {
        this.db.exec("ROLLBACK;");
        return { ok: false, reason: "invalid_grant" };
      }

      const existingDevice = this.db
        .prepare(
          `SELECT id, platform, revoked_at
             FROM devices
            WHERE account_id = ? AND installation_id = ?`,
        )
        .get(record.accountId, input.installationId) as ExchangeDeviceRow | undefined;

      let deviceId: string;
      let devicePlatform: DevicePlatform;
      if (existingDevice) {
        if (existingDevice.revoked_at !== null) {
          this.db.exec("ROLLBACK;");
          return { ok: false, reason: "device_revoked" };
        }
        if (existingDevice.platform !== input.platform) {
          this.db.exec("ROLLBACK;");
          return { ok: false, reason: "device_platform_mismatch" };
        }
        deviceId = existingDevice.id;
        devicePlatform = existingDevice.platform;
        this.db
          .prepare("UPDATE devices SET last_seen_at = ? WHERE id = ? AND account_id = ?")
          .run(input.now, deviceId, record.accountId);
      } else {
        deviceId = randomUUID();
        devicePlatform = input.platform;
        this.db
          .prepare(
            `INSERT INTO devices (
               id, account_id, installation_id, platform, client_name, client_version,
               public_key, created_at, last_seen_at, revoked_at, revoke_reason
             ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL)`,
          )
          .run(
            deviceId,
            record.accountId,
            input.installationId,
            input.platform,
            input.clientId === WHO_YOU_WEB_OAUTH_CLIENT_ID ? "Who You Web" : snapshot.client.displayName ?? null,
            input.now,
            input.now,
          );
      }

      this.db
        .prepare(
          `INSERT INTO sessions (
             id, account_id, device_id, secret_hash, expires_at,
             created_at, last_seen_at, rotated_at, revoked_at, revoke_reason
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
        )
        .run(
          input.sessionId,
          record.accountId,
          deviceId,
          input.sessionSecretHash,
          input.sessionExpiresAt,
          input.now,
          input.now,
        );

      this.db
        .prepare("UPDATE accounts SET last_login_at = ?, updated_at = ? WHERE id = ?")
        .run(input.now, input.now, record.accountId);

      new ServiceRegistryRepository(this.db).grantLoginServicesWithinTransaction(
        record.accountId, snapshot.services, record.createdAt,
      );
      this.db.exec("COMMIT;");
      return {
        ok: true,
        value: {
          sessionId: input.sessionId,
          accountId: record.accountId,
          accountUsername: account.username,
          deviceId,
          devicePlatform,
          sessionExpiresAt: input.sessionExpiresAt,
        },
      };
    } catch (error) {
      this.db.exec("ROLLBACK;");
      if (error instanceof ServiceRegistryError) return { ok: false, reason: "invalid_grant" };
      throw error;
    }
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
    serviceGrantFingerprint: row.service_grant_fingerprint,
  };
}
