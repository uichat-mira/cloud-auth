import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  applicationManifestSchema, oauthClientIdSchema, findFirstPartyOAuthClient, WHO_YOU_WEB_OAUTH_CLIENT_ID,
  type ApplicationOAuthIdentity, type ApplicationOAuthTokenRequest,
  type ApplicationOAuthTokenResponse, type OAuthAuthorizationRequest,
} from "@uichat-mira/cloud-auth-contracts";
import { ApplicationServiceRepository } from "../application-services/repository.js";
import { issueAuthorizationCode, parseAuthorizationCode, verifyAuthorizationCodeSecret } from "../oauth/authorization-code.js";
import { verifyPkceS256 } from "../oauth/pkce.js";
import { OAuthError } from "../oauth/errors.js";
import type { LoginClient } from "../trusted-applications/login-catalog.js";

type Instance = {
  app_id: string; origin: string; manifest_revision: number; manifest_json: string;
};
type Code = {
  id: string; account_id: string; app_id: string; client_id: string; redirect_uri: string;
  manifest_revision: number; code_challenge: string; secret_hash: string; expires_at: string; consumed_at: string | null;
};
type Session = {
  id: string; account_id: string; app_id: string; client_id: string; manifest_revision: number;
  secret_hash: string; expires_at: string; revoked_at: string | null;
};

const invalid = () => new OAuthError("OAUTH_INVALID_GRANT", 400, "Authorization code cannot be exchanged");
const unauthorized = () => new OAuthError("OAUTH_UNAUTHORIZED_CLIENT", 400, "OAuth client or redirect URI is not registered");
const reauth = () => new OAuthError("OAUTH_REAUTH_REQUIRED", 401, "Application session is not active");
const hash = (secret: string) => createHash("sha256").update("mira-application-session:").update(secret).digest("hex");

export class ApplicationOAuthRepository {
  constructor(private readonly db: DatabaseSync) {}

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private activeAccount(accountId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM accounts WHERE id = ? AND is_allowed = 1 AND disabled_at IS NULL").get(accountId);
  }

  private instance(clientId: string): Instance | null {
    if (findFirstPartyOAuthClient(clientId) || clientId === WHO_YOU_WEB_OAUTH_CLIENT_ID ||
        !oauthClientIdSchema.safeParse(clientId).success) return null;
    const rows = this.db.prepare(
      "SELECT app_id, origin, manifest_revision, manifest_json FROM application_instances WHERE disabled_at IS NULL AND json_extract(manifest_json, '$.oauth.clientId') = ? LIMIT 2",
    ).all(clientId) as Instance[];
    if (rows.length !== 1) return null;
    const row = rows[0]!;
    if (clientId.startsWith("https:") && new URL(clientId).origin !== row.origin) return null;
    return row;
  }

  private resolve(clientId: string, redirectUri: string): { row: Instance; client: LoginClient } | null {
    const row = this.instance(clientId);
    if (!row) return null;
    const manifest = applicationManifestSchema.parse(JSON.parse(row.manifest_json));
    if (manifest.appId !== row.app_id || manifest.manifestRevision !== row.manifest_revision ||
        !manifest.oauth.redirectUris.includes(redirectUri) || new URL(redirectUri).origin !== row.origin) return null;
    return { row, client: { clientId, platform: "web", redirectUris: manifest.oauth.redirectUris,
      displayName: manifest.name, origin: row.origin, manifestRevision: row.manifest_revision,
      serviceLabels: manifest.services.map(service => service.name + (service.scopes.length ? " (" + service.scopes.join(", ") + ")" : "")) } };
  }

  resolveClient(clientId: string, redirectUri: string): LoginClient | null {
    return this.resolve(clientId, redirectUri)?.client ?? null;
  }

  issue(accountId: string, request: OAuthAuthorizationRequest, now: Date, ttl: number, expectedRevision: number | undefined) {
    return this.transaction(() => {
      const binding = this.resolve(request.client_id, request.redirect_uri);
      if (!binding || binding.row.manifest_revision !== expectedRevision) throw unauthorized();
      if (!this.activeAccount(accountId)) throw reauth();
      const issued = issueAuthorizationCode();
      const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
      this.db.prepare("INSERT INTO application_oauth_codes (id, account_id, app_id, client_id, redirect_uri, manifest_revision, code_challenge, secret_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        issued.id, accountId, binding.row.app_id, request.client_id, request.redirect_uri,
        binding.row.manifest_revision, request.code_challenge, issued.secretHash, expiresAt,
      );
      return { code: issued.code, redirectUri: request.redirect_uri, state: request.state, expiresAt };
    });
  }

  exchange(request: ApplicationOAuthTokenRequest, now: Date, ttl: number): ApplicationOAuthTokenResponse {
    const parsed = parseAuthorizationCode(request.code);
    if (!parsed) throw invalid();
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM application_oauth_codes WHERE id = ?").get(parsed.id) as Code | undefined;
      const binding = this.resolve(request.client_id, request.redirect_uri);
      const current = now.toISOString();
      if (!row || !binding || row.consumed_at !== null || row.expires_at <= current ||
          row.app_id !== binding.row.app_id || row.manifest_revision !== binding.row.manifest_revision ||
          row.client_id !== request.client_id || row.redirect_uri !== request.redirect_uri ||
          !this.activeAccount(row.account_id) ||
          !verifyAuthorizationCodeSecret(parsed.secret, row.secret_hash) ||
          !verifyPkceS256(request.code_verifier, row.code_challenge)) throw invalid();

      const id = randomBytes(16).toString("base64url");
      const secret = randomBytes(32).toString("base64url");
      const lifetime = Math.min(ttl, 3600);
      const expiresAt = new Date(now.getTime() + lifetime * 1000).toISOString();
      if (this.db.prepare("UPDATE application_oauth_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
        .run(current, row.id).changes !== 1) throw invalid();
      // 052 owns the sole service grant ledger. Use the same writer transaction.
      new ApplicationServiceRepository(this.db).establishLoginGrants(
        row.account_id, row.app_id, row.manifest_revision, current,
      );
      this.db.prepare("INSERT INTO application_oauth_sessions (id, account_id, app_id, client_id, manifest_revision, secret_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id, row.account_id, row.app_id, row.client_id, row.manifest_revision, hash(secret), expiresAt);
      return { access_token: "mas_v1." + id + "." + secret, token_type: "Bearer",
        expires_in: lifetime, expiresAt, issuer: "mira:cloud-auth", subject: row.account_id,
        audience: row.client_id, appId: row.app_id };
    });
  }

  private session(token: string, now: Date): Session {
    const match = /^mas_v1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!match) throw reauth();
    const row = this.db.prepare("SELECT * FROM application_oauth_sessions WHERE id = ?").get(match[1]!) as Session | undefined;
    if (!row || row.revoked_at !== null || row.expires_at <= now.toISOString() ||
        !this.activeAccount(row.account_id)) throw reauth();
    const expected = Buffer.from(row.secret_hash, "hex");
    const actual = Buffer.from(hash(match[2]!), "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw reauth();
    const instance = this.instance(row.client_id);
    if (!instance || instance.app_id !== row.app_id || instance.manifest_revision !== row.manifest_revision) throw reauth();
    return row;
  }

  identity(token: string, now: Date): ApplicationOAuthIdentity {
    const row = this.session(token, now);
    return { issuer: "mira:cloud-auth", subject: row.account_id, audience: row.client_id,
      appId: row.app_id, expiresAt: row.expires_at };
  }

  logout(token: string, now: Date): void {
    this.transaction(() => {
      const row = this.session(token, now);
      this.db.prepare("UPDATE application_oauth_sessions SET revoked_at = ? WHERE id = ?").run(now.toISOString(), row.id);
    });
  }

  revoke(accountId: string, appId: string, now: Date): void {
    this.transaction(() => {
      const time = now.toISOString();
      this.db.prepare("UPDATE application_oauth_codes SET consumed_at = ? WHERE account_id = ? AND app_id = ? AND consumed_at IS NULL").run(time, accountId, appId);
      this.db.prepare("UPDATE application_oauth_sessions SET revoked_at = ? WHERE account_id = ? AND app_id = ? AND revoked_at IS NULL").run(time, accountId, appId);
      this.db.prepare("UPDATE application_service_grants SET revoked_at = ?, updated_at = ?, revision = revision + 1 WHERE account_id = ? AND app_id = ? AND revoked_at IS NULL").run(time, time, accountId, appId);
    });
  }

  setDisabled(ownerId: string, appId: string, disabled: boolean, now: Date): void {
    this.transaction(() => {
      const time = now.toISOString();
      if (this.db.prepare("UPDATE application_instances SET disabled_at = ?, updated_at = ? WHERE app_id = ? AND owner_account_id = ?")
        .run(disabled ? time : null, time, appId, ownerId).changes !== 1) throw unauthorized();
      if (!disabled) return;
      this.db.prepare("UPDATE application_oauth_codes SET consumed_at = ? WHERE app_id = ? AND consumed_at IS NULL").run(time, appId);
      this.db.prepare("UPDATE application_oauth_sessions SET revoked_at = ? WHERE app_id = ? AND revoked_at IS NULL").run(time, appId);
      this.db.prepare("UPDATE application_service_grants SET revoked_at = ?, updated_at = ?, revision = revision + 1 WHERE app_id = ? AND revoked_at IS NULL").run(time, time, appId);
    });
  }
}
