import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  MIRA_DESKTOP_OAUTH_REDIRECT_URI,
  MIRA_MOBILE_OAUTH_CLIENT_ID,
  MIRA_MOBILE_OAUTH_REDIRECT_URI,
  issuedCloudSessionSchema,
  oauthApiErrorEnvelopeSchema,
  type OAuthTokenRequest,
} from "@uichat-mira/cloud-auth-contracts";
import { parseAuthorizationCode } from "../../src/oauth/authorization-code.js";
import { parseSessionToken } from "../../src/security/session-token.js";
import { createTestOAuthContext } from "../helpers/oauth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";
const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const codeChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "state-0123456789-abcdef";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function context(options: Parameters<typeof createTestOAuthContext>[1] = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mira-oauth-token-contract-"));
  cleanup.push(dir);
  return createTestOAuthContext(join(dir, "auth.sqlite"), options);
}

function authorizeUrl(overrides: Record<string, string> = {}): string {
  const parameters: Record<string, string> = {
    response_type: "code",
    client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
    redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...overrides,
  };
  return "/v1/oauth/authorize?" + new URLSearchParams(parameters).toString();
}

async function authorize(
  testContext: ReturnType<typeof createTestOAuthContext>,
  overrides: Record<string, string> = {},
): Promise<string> {
  const url = authorizeUrl(overrides);
  const page = await testContext.app.inject({ method: "GET", url });
  expect(page.statusCode).toBe(200);
  const csrfCookie = String(page.headers["set-cookie"]).split(";")[0]!;
  const fields = new URLSearchParams(url.split("?")[1]);
  fields.set("csrf_token", csrfCookie.split("=")[1]!);
  fields.set("username", "alice");
  fields.set("password", password);
  const response = await testContext.app.inject({
    method: "POST",
    url: "/v1/oauth/authorize",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: csrfCookie,
    },
    payload: fields.toString(),
  });
  expect(response.statusCode).toBe(303);
  const location = new URL(String(response.headers.location));
  const code = location.searchParams.get("code");
  expect(code).toBeTruthy();
  return code!;
}

function tokenForm(
  code: string,
  overrides: Partial<Record<keyof OAuthTokenRequest | string, string>> = {},
): string {
  const fields: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
    code,
    redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
    code_verifier: codeVerifier,
    installation_id: randomUUID(),
    platform: "desktop",
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete fields[key];
    else fields[key] = value;
  }
  return new URLSearchParams(fields).toString();
}

async function exchange(
  testContext: ReturnType<typeof createTestOAuthContext>,
  payload: string,
  headers: Record<string, string> = {},
) {
  return testContext.app.inject({
    method: "POST",
    url: "/v1/oauth/token",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    payload,
  });
}

function errorCode(response: { json(): unknown }): string {
  return oauthApiErrorEnvelopeSchema.parse(response.json()).error.code;
}

describe("OAuth authorization_code + PKCE S256 token exchange", () => {
  it("redeems one code into the existing device-bound Cloud Session authority", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const code = await authorize(testContext);
    const installationId = randomUUID();

    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toMatchObject({ count: 0 });

    const response = await exchange(testContext, tokenForm(code, { installation_id: installationId }));
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["pragma"]).toBe("no-cache");
    const session = issuedCloudSessionSchema.parse(response.json());
    expect(session.account.username).toBe("alice");
    expect(Object.keys(response.json() as object).sort()).toEqual([
      "account",
      "expiresAt",
      "sessionToken",
    ]);
    expect(response.body).not.toContain(code);
    expect(response.body).not.toContain(codeVerifier);
    expect(response.body).not.toContain(password);
    expect(response.body).not.toContain("scope");
    expect(response.body).not.toContain("tool");
    expect(response.body).not.toContain("relay");

    const parsedCode = parseAuthorizationCode(code);
    const record = testContext.oauthRepository.findAuthorizationCode(parsedCode!.id);
    expect(record).toMatchObject({
      consumedAt: expect.any(String),
      consumedBySessionId: parseSessionToken(session.sessionToken)!.id,
      consumeReason: "exchanged",
    });

    const sessionRow = testContext.db
      .prepare(
        `SELECT s.account_id, s.device_id, s.secret_hash, s.revoked_at,
                d.installation_id, d.platform, d.revoked_at AS device_revoked_at
           FROM sessions s JOIN devices d ON d.id = s.device_id
          WHERE s.id = ?`,
      )
      .get(parseSessionToken(session.sessionToken)!.id) as Record<string, unknown>;
    expect(sessionRow).toMatchObject({
      account_id: session.account.id,
      installation_id: installationId,
      platform: "desktop",
      revoked_at: null,
      device_revoked_at: null,
    });
    expect(String(sessionRow.secret_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sessionRow)).not.toContain(session.sessionToken);

    const restore = await testContext.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json()).toMatchObject({ account: { username: "alice" } });

    const renew = await testContext.app.inject({
      method: "POST",
      url: "/v1/auth/session/renew",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(renew.statusCode).toBe(200);
    const renewed = issuedCloudSessionSchema.parse(renew.json());
    expect(renew.body).not.toContain(session.sessionToken);

    const deviceList = await testContext.app.inject({
      method: "GET",
      url: "/v1/devices",
      headers: { authorization: `Bearer ${renewed.sessionToken}` },
    });
    expect(deviceList.statusCode).toBe(200);
    expect(deviceList.json()).toMatchObject({
      devices: [{ platform: "desktop", revokedAt: null }],
    });

    const logout = await testContext.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${renewed.sessionToken}` },
    });
    expect(logout.statusCode).toBe(204);
    const afterLogout = await testContext.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${renewed.sessionToken}` },
    });
    expect(afterLogout.statusCode).toBe(401);

    await testContext.app.close();
    testContext.db.close();
  });

  it("binds a Mobile authorization code to a Mobile installation", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const code = await authorize(testContext, {
      client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
      redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
    });

    const response = await exchange(
      testContext,
      tokenForm(code, {
        client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
        redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
        platform: "mobile",
      }),
    );
    expect(response.statusCode).toBe(200);
    const session = issuedCloudSessionSchema.parse(response.json());
    const row = testContext.db
      .prepare(
        `SELECT d.platform FROM sessions s JOIN devices d ON d.id = s.device_id WHERE s.id = ?`,
      )
      .get(parseSessionToken(session.sessionToken)!.id);
    expect(row).toMatchObject({ platform: "mobile" });

    await testContext.app.close();
    testContext.db.close();
  });

  it("accepts the same strict field set as flat JSON and rejects widened JSON", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const code = await authorize(testContext);
    const base = {
      grant_type: "authorization_code",
      client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
      code,
      redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
      code_verifier: codeVerifier,
      installation_id: randomUUID(),
      platform: "desktop",
    };

    const widened = await testContext.app.inject({
      method: "POST",
      url: "/v1/oauth/token",
      payload: { ...base, account_id: "attacker-account" },
    });
    expect(widened.statusCode).toBe(400);
    expect(errorCode(widened)).toBe("OAUTH_INVALID_REQUEST");

    const nonString = await testContext.app.inject({
      method: "POST",
      url: "/v1/oauth/token",
      payload: { ...base, platform: ["desktop"] },
    });
    expect(nonString.statusCode).toBe(400);
    expect(errorCode(nonString)).toBe("OAUTH_INVALID_REQUEST");

    const accepted = await testContext.app.inject({
      method: "POST",
      url: "/v1/oauth/token",
      payload: base,
    });
    expect(accepted.statusCode).toBe(200);
    expect(issuedCloudSessionSchema.parse(accepted.json()).account.username).toBe("alice");

    await testContext.app.close();
    testContext.db.close();
  });

  it("rejects replay, wrong verifier, cross-client, redirect swapping and expired codes", async () => {
    let clock = new Date("2026-10-25T10:00:00.000Z");
    const testContext = context({
      codeTtlSeconds: 60,
      sessionTtlSeconds: 120,
      now: () => clock,
    });
    await testContext.service.provisionAccount("alice", password);
    const code = await authorize(testContext);

    const wrongVerifier = await exchange(
      testContext,
      tokenForm(code, { code_verifier: "A".repeat(43) }),
    );
    expect(wrongVerifier.statusCode).toBe(400);
    expect(errorCode(wrongVerifier)).toBe("OAUTH_INVALID_GRANT");
    expect(wrongVerifier.body).not.toContain(code);
    expect(wrongVerifier.body).not.toContain("A".repeat(43));

    for (const payload of [
      tokenForm(code, {
        client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
        redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
      }),
      tokenForm(code, { redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI }),
      tokenForm(code, { client_id: MIRA_MOBILE_OAUTH_CLIENT_ID }),
      tokenForm(code, { platform: "mobile" }),
    ]) {
      const response = await exchange(testContext, payload);
      expect(response.statusCode).toBe(400);
      expect(errorCode(response)).toBe("OAUTH_INVALID_GRANT");
    }

    const accepted = await exchange(testContext, tokenForm(code));
    expect(accepted.statusCode).toBe(200);
    const issued = issuedCloudSessionSchema.parse(accepted.json());
    expect(issued.expiresAt).toBe("2026-10-25T10:02:00.000Z");

    const replay = await exchange(testContext, tokenForm(code));
    expect(replay.statusCode).toBe(400);
    expect(errorCode(replay)).toBe("OAUTH_INVALID_GRANT");

    const sessionsAfterReplay = testContext.db
      .prepare("SELECT COUNT(*) AS count FROM sessions")
      .get();
    expect(sessionsAfterReplay).toMatchObject({ count: 1 });

    clock = new Date("2026-10-25T10:03:00.000Z");
    const expiredCode = await authorize(testContext);
    clock = new Date("2026-10-25T10:04:01.000Z");
    const expired = await exchange(testContext, tokenForm(expiredCode));
    expect(expired.statusCode).toBe(400);
    expect(errorCode(expired)).toBe("OAUTH_INVALID_GRANT");
    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toMatchObject({ count: 1 });

    await testContext.app.close();
    testContext.db.close();
  });

  it("fails closed for unsupported grants, plain PKCE, malformed and unexpected parameters", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const code = await authorize(testContext);

    const cases: Array<{ payload: string; code: string }> = [
      {
        payload: tokenForm(code, { grant_type: "client_credentials" }),
        code: "OAUTH_UNSUPPORTED_GRANT_TYPE",
      },
      {
        payload: tokenForm(code, { code_challenge_method: "plain" }),
        code: "OAUTH_INVALID_REQUEST",
      },
      { payload: tokenForm(code, { scope: "openid" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { device_id: "attacker-device" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { account_id: "attacker-account" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { code_verifier: "short" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { code_verifier: "a".repeat(43) + "!" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { code: "mca_v1.broken" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { client_id: "third-party" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { platform: "server" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { installation_id: "not-a-uuid" }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code, { code: undefined }), code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code) + "&grant_type=authorization_code", code: "OAUTH_INVALID_REQUEST" },
      { payload: tokenForm(code) + "&code_verifier=duplicate", code: "OAUTH_INVALID_REQUEST" },
    ];

    for (const testCase of cases) {
      const response = await exchange(testContext, testCase.payload);
      expect(response.statusCode, testCase.payload).toBe(400);
      expect(errorCode(response)).toBe(testCase.code);
      expect(response.headers["cache-control"]).toBe("no-store");
    }

    const missingGrant = await exchange(
      testContext,
      tokenForm(code, { grant_type: undefined }),
    );
    expect(missingGrant.statusCode).toBe(400);
    expect(errorCode(missingGrant)).toBe("OAUTH_INVALID_REQUEST");

    const unregisteredClient = await exchange(
      testContext,
      tokenForm(code, { client_id: "third-party" }),
    );
    expect(unregisteredClient.statusCode).toBe(400);
    expect(unregisteredClient.body).not.toContain("third-party");
    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toMatchObject({ count: 0 });
    expect(
      testContext.db
        .prepare("SELECT consumed_at FROM oauth_authorization_codes")
        .get(),
    ).toMatchObject({ consumed_at: null });

    await testContext.app.close();
    testContext.db.close();
  });

  it("does not accept a Cloud Session bearer or client-supplied ownership as authority", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    await testContext.service.provisionAccount("bob", password);
    const aliceLogin = await testContext.service.login("alice", password, "127.0.0.1");
    const bobLogin = await testContext.service.login("bob", password, "127.0.0.2");
    const code = await authorize(testContext);

    const withoutCode = await exchange(testContext, tokenForm(code, { code: undefined }), {
      authorization: `Bearer ${aliceLogin.sessionToken}`,
    });
    expect(withoutCode.statusCode).toBe(400);
    expect(errorCode(withoutCode)).toBe("OAUTH_INVALID_REQUEST");
    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toMatchObject({ count: 2 });

    const withWrongOwner = await exchange(
      testContext,
      tokenForm(code, { account_id: bobLogin.account.id }),
      { authorization: `Bearer ${bobLogin.sessionToken}` },
    );
    expect(withWrongOwner.statusCode).toBe(400);
    expect(errorCode(withWrongOwner)).toBe("OAUTH_INVALID_REQUEST");

    const accepted = await exchange(testContext, tokenForm(code), {
      authorization: `Bearer ${bobLogin.sessionToken}`,
    });
    expect(accepted.statusCode).toBe(200);
    expect(issuedCloudSessionSchema.parse(accepted.json()).account.username).toBe("alice");

    const devices = testContext.db
      .prepare("SELECT account_id FROM devices")
      .all() as Array<{ account_id: string }>;
    expect(devices).toEqual([{ account_id: aliceLogin.account.id }]);

    await testContext.app.close();
    testContext.db.close();
  });

  it("rejects disabled or denied accounts at the exchange boundary", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const disabledCode = await authorize(testContext);
    testContext.service.setDisabled("alice", true);
    const disabled = await exchange(testContext, tokenForm(disabledCode));
    expect(disabled.statusCode).toBe(400);
    expect(errorCode(disabled)).toBe("OAUTH_INVALID_GRANT");
    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toMatchObject({ count: 0 });
    expect(
      testContext.db
        .prepare("SELECT consumed_at FROM oauth_authorization_codes WHERE id = ?")
        .get(parseAuthorizationCode(disabledCode)!.id),
    ).toMatchObject({ consumed_at: null });

    testContext.service.setDisabled("alice", false);
    const deniedCode = await authorize(testContext);
    testContext.service.setAllowed("alice", false);
    const denied = await exchange(testContext, tokenForm(deniedCode));
    expect(denied.statusCode).toBe(400);
    expect(errorCode(denied)).toBe("OAUTH_INVALID_GRANT");
    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toMatchObject({ count: 0 });
    expect(
      testContext.db
        .prepare("SELECT consumed_at FROM oauth_authorization_codes WHERE id = ?")
        .get(parseAuthorizationCode(deniedCode)!.id),
    ).toMatchObject({ consumed_at: null });

    await testContext.app.close();
    testContext.db.close();
  });
});
