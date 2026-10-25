import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  MIRA_DESKTOP_OAUTH_REDIRECT_URI,
  type OAuthAuthorizationRequest,
} from "@uichat-mira/cloud-auth-contracts";
import {
  parseAuthorizationCode,
  verifyAuthorizationCodeSecret,
} from "../../src/oauth/authorization-code.js";
import { AuthError } from "../../src/auth/auth-service.js";
import { OAuthRepository } from "../../src/oauth/oauth-repository.js";
import { createTestOAuthContext } from "../helpers/oauth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "state-0123456789-abcdef";

const request: OAuthAuthorizationRequest = {
  response_type: "code",
  client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
  redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
};

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("OAuth authorization code SQLite persistence", () => {
  it("stores only a hashed, unconsumed code and preserves it across reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-oauth-persistence-"));
    cleanup.push(dir);
    const databasePath = join(dir, "auth.sqlite");
    const first = createTestOAuthContext(databasePath);
    await first.service.provisionAccount("alice", password);
    const login = await first.service.login("alice", password, "127.0.0.1");

    const grant = first.oauthService.authorize(login.sessionToken, request);
    const parsed = parseAuthorizationCode(grant.code);
    expect(parsed).not.toBeNull();

    const row = first.db
      .prepare("SELECT * FROM oauth_authorization_codes WHERE id = ?")
      .get(parsed!.id) as Record<string, unknown>;
    expect(row).toMatchObject({
      id: parsed!.id,
      client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
      redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: "S256",
      consumed_at: null,
      consumed_by_session_id: null,
      consume_reason: null,
    });
    expect(row.secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyAuthorizationCodeSecret(parsed!.secret, String(row.secret_hash))).toBe(true);
    expect(JSON.stringify(row)).not.toContain(grant.code);
    expect(JSON.stringify(row)).not.toContain(parsed!.secret);
    expect(JSON.stringify(row)).not.toContain(password);
    expect(JSON.stringify(row)).not.toContain(login.sessionToken);

    const sessionsBefore = first.db
      .prepare("SELECT COUNT(*) AS count FROM sessions")
      .get() as { count: number };
    expect(sessionsBefore).toMatchObject({ count: 1 });
    first.db.close();

    const second = createTestOAuthContext(databasePath);
    const reopenedRepository = new OAuthRepository(second.db);
    const reopened = reopenedRepository.findAuthorizationCode(parsed!.id);
    expect(reopened).toMatchObject({
      accountId: row.account_id,
      clientId: MIRA_DESKTOP_OAUTH_CLIENT_ID,
      redirectUri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      secretHash: row.secret_hash,
      expiresAt: row.expires_at,
      consumedAt: null,
    });
    expect(verifyAuthorizationCodeSecret(parsed!.secret, reopened!.secretHash)).toBe(true);
    expect(
      second.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toEqual(sessionsBefore);
    second.db.close();
  });

  it("bounds code lifetime and persists no code when the account is not allowed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-oauth-expiry-"));
    cleanup.push(dir);
    const databasePath = join(dir, "auth.sqlite");
    const fixedNow = new Date("2026-10-25T10:00:00.000Z");
    const first = createTestOAuthContext(databasePath, {
      codeTtlSeconds: 60,
      now: () => fixedNow,
    });
    await first.service.provisionAccount("alice", password);
    const login = await first.service.login("alice", password, "127.0.0.1");

    const grant = first.oauthService.authorize(login.sessionToken, request);
    expect(grant.expiresAt).toBe("2026-10-25T10:01:00.000Z");
    const parsed = parseAuthorizationCode(grant.code);
    const record = first.oauthRepository.findAuthorizationCode(parsed!.id);
    expect(record?.createdAt).toBe(fixedNow.toISOString());
    expect(record?.expiresAt).toBe(grant.expiresAt);
    expect(Date.parse(record!.expiresAt) - Date.parse(record!.createdAt)).toBe(60_000);

    first.service.setDisabled("alice", true);
    await first.service.provisionAccount("disabled", password);
    const disabledSession = (
      await first.service.login("disabled", password, "127.0.0.1")
    ).sessionToken;
    first.service.setDisabled("disabled", true);
    expect(() => first.oauthService.authorize(disabledSession, request)).toThrowError(AuthError);

    first.service.setDisabled("alice", false);
    const deniedSession = (
      await first.service.login("alice", password, "127.0.0.2")
    ).sessionToken;
    first.service.setAllowed("alice", false);
    expect(() => first.oauthService.authorize(deniedSession, request)).toThrowError(AuthError);

    expect(
      first.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get(),
    ).toMatchObject({ count: 1 });
    first.db.close();

    const second = createTestOAuthContext(databasePath);
    const reopened = second.oauthRepository.findAuthorizationCode(parsed!.id);
    expect(reopened).toMatchObject({
      expiresAt: "2026-10-25T10:01:00.000Z",
      consumedAt: null,
    });
    second.db.close();
  });
});
