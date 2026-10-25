import {
  createPublicKey,
  randomUUID,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLOUD_SHIYAN_AUDIENCE,
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  MIRA_DESKTOP_OAUTH_REDIRECT_URI,
  SERVICE_CREDENTIAL_ISSUER,
  SHIYAN_AUTHENTICATE_SCOPE,
  issuedCloudSessionSchema,
  issuedServiceCredentialSchema,
  serviceCredentialErrorEnvelopeSchema,
  type OAuthAuthorizationRequest,
  type OAuthTokenRequest,
} from "@uichat-mira/cloud-auth-contracts";
import { parseAuthorizationCode } from "../../src/oauth/authorization-code.js";
import { OAuthError } from "../../src/oauth/errors.js";
import { parseSessionToken } from "../../src/security/session-token.js";
import { verifyServiceCredential } from "../../src/service-credentials/index.js";
import type { ServiceCredentialKeyRing } from "../../src/service-credentials/keyring.js";
import {
  createTestOAuthContext,
  type TestOAuthContext,
  type TestOAuthOptions,
} from "../helpers/oauth.js";
import { createTestServiceCredentialKeyMaterial } from "../helpers/service-credential.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";
const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const codeChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "state-0123456789-abcdef";

const authorizationRequest: OAuthAuthorizationRequest = {
  response_type: "code",
  client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
  redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
  state,
  code_challenge: codeChallenge,
  code_challenge_method: "S256",
};

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function databasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "mira-oauth-exchange-"));
  cleanup.push(dir);
  return join(dir, "auth.sqlite");
}

function createContext(
  path: string,
  options: TestOAuthOptions,
): TestOAuthContext {
  return createTestOAuthContext(path, options);
}

function tokenRequest(
  code: string,
  installationId: string,
  overrides: Partial<OAuthTokenRequest> = {},
): OAuthTokenRequest {
  return {
    grant_type: "authorization_code",
    client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
    code,
    redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
    code_verifier: codeVerifier,
    installation_id: installationId,
    platform: "desktop",
    ...overrides,
  };
}

function exchangeViaApp(
  context: TestOAuthContext,
  request: OAuthTokenRequest,
) {
  return context.app.inject({
    method: "POST",
    url: "/v1/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams(request).toString(),
  });
}

function trustedKeys(keyRing: ServiceCredentialKeyRing): Map<string, KeyObject> {
  return new Map(
    keyRing.jwks.keys.map((jwk) => [
      jwk.kid,
      createPublicKey({ key: jwk as JsonWebKey, format: "jwk" }),
    ]),
  );
}

describe("OAuth token exchange SQLite runtime", () => {
  it("consumes one code under concurrent exchange and issues a reusable device-bound session", async () => {
    const path = databasePath();
    const fixedNow = new Date();
    const keyMaterial = createTestServiceCredentialKeyMaterial();
    const options: TestOAuthOptions = {
      now: () => fixedNow,
      sessionTtlSeconds: 3600,
      serviceCredentialKeyMaterial: keyMaterial,
    };
    const first = createContext(path, options);
    const second = createContext(path, options);
    await first.service.provisionAccount("alice", password);
    const grant = await first.oauthService.authorizeWithPassword(
      "alice",
      password,
      "127.0.0.1",
      authorizationRequest,
    );
    const installationId = randomUUID();
    const request = tokenRequest(grant.code, installationId);

    const responses = await Promise.all([
      exchangeViaApp(first, request),
      exchangeViaApp(second, request),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 400]);
    const accepted = responses.find((response) => response.statusCode === 200)!;
    const rejected = responses.find((response) => response.statusCode === 400)!;
    expect(rejected.json()).toMatchObject({
      error: { code: "OAUTH_INVALID_GRANT" },
    });

    const session = issuedCloudSessionSchema.parse(accepted.json());
    const parsedCode = parseAuthorizationCode(grant.code)!;
    expect(
      first.db
        .prepare(
          "SELECT consumed_at, consumed_by_session_id FROM oauth_authorization_codes WHERE id = ?",
        )
        .get(parsedCode.id),
    ).toMatchObject({
      consumed_at: fixedNow.toISOString(),
      consumed_by_session_id: session.sessionToken.split(".")[1],
    });

    const binding = first.db
      .prepare(
        `SELECT s.account_id, s.device_id, d.installation_id, d.platform
           FROM sessions s JOIN devices d ON d.id = s.device_id
          WHERE d.installation_id = ?`,
      )
      .get(installationId) as {
      account_id: string;
      device_id: string;
      installation_id: string;
      platform: string;
    };
    expect(binding).toMatchObject({
      account_id: session.account.id,
      installation_id: installationId,
      platform: "desktop",
    });
    expect(
      first.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toMatchObject({ count: 1 });
    expect(
      first.db.prepare("SELECT COUNT(*) AS count FROM devices").get(),
    ).toMatchObject({ count: 1 });

    expect(first.service.getSession(session.sessionToken).account.username).toBe("alice");

    const credentialResponse = await first.app.inject({
      method: "POST",
      url: "/v1/service-credentials",
      headers: { authorization: `Bearer ${session.sessionToken}` },
      payload: { audience: CLOUD_SHIYAN_AUDIENCE },
    });
    expect(credentialResponse.statusCode).toBe(200);
    const credential = issuedServiceCredentialSchema.parse(credentialResponse.json());
    const keyRing = first.keyRing!;
    const verified = verifyServiceCredential(credential.token, {
      issuer: SERVICE_CREDENTIAL_ISSUER,
      audience: CLOUD_SHIYAN_AUDIENCE,
      publicKeys: trustedKeys(keyRing),
    });
    expect(verified.claims).toMatchObject({
      sub: session.account.id,
      device_id: binding.device_id,
      aud: CLOUD_SHIYAN_AUDIENCE,
      scope: [SHIYAN_AUTHENTICATE_SCOPE],
    });
    expect(Object.keys(verified.claims).sort()).toEqual([
      "aud",
      "device_id",
      "exp",
      "iat",
      "iss",
      "nbf",
      "scope",
      "sub",
    ]);

    await first.app.close();
    first.db.close();
    await second.app.close();
    second.db.close();

    const reopened = createContext(path, options);
    expect(reopened.service.getSession(session.sessionToken).account.username).toBe("alice");
    expect(() => reopened.oauthService.exchangeAuthorizationCode(request)).toThrowError(
      expect.objectContaining({ code: "OAUTH_INVALID_GRANT" }),
    );

    reopened.deviceService.revoke(session.sessionToken, binding.device_id);
    for (const token of [session.sessionToken]) {
      expect(() => reopened.service.getSession(token)).toThrow(/Re-authentication/);
    }
    const rejectedCredential = await reopened.app.inject({
      method: "POST",
      url: "/v1/service-credentials",
      headers: { authorization: `Bearer ${session.sessionToken}` },
      payload: { audience: CLOUD_SHIYAN_AUDIENCE },
    });
    expect(rejectedCredential.statusCode).toBe(401);
    expect(
      serviceCredentialErrorEnvelopeSchema.parse(rejectedCredential.json()).error.code,
    ).toBe("SERVICE_CREDENTIAL_REAUTH_REQUIRED");

    await reopened.app.close();
    reopened.db.close();
  });

  it("reuses the existing account-owned device and preserves its metadata", async () => {
    const path = databasePath();
    const context = createContext(path, {});
    await context.service.provisionAccount("alice", password);
    const login = await context.service.login("alice", password, "127.0.0.1");
    const installationId = randomUUID();
    const registered = context.deviceService.register(login.sessionToken, {
      installationId,
      platform: "desktop",
      clientName: "Mira Desktop",
      clientVersion: "1.0.0",
    });

    const grant = await context.oauthService.authorizeWithPassword(
      "alice",
      password,
      "127.0.0.1",
      authorizationRequest,
    );
    const response = await exchangeViaApp(context, tokenRequest(grant.code, installationId));
    expect(response.statusCode).toBe(200);
    const session = issuedCloudSessionSchema.parse(response.json());

    expect(
      context.db
        .prepare("SELECT COUNT(*) AS count FROM devices")
        .get(),
    ).toMatchObject({ count: 1 });
    expect(
      context.db
        .prepare(
          `SELECT s.device_id, d.client_name, d.client_version
             FROM sessions s JOIN devices d ON d.id = s.device_id
            WHERE s.id = ?`,
        )
        .get(parseSessionToken(session.sessionToken)!.id),
    ).toMatchObject({
      device_id: registered.id,
      client_name: "Mira Desktop",
      client_version: "1.0.0",
    });
    expect(context.service.getSession(session.sessionToken).account.username).toBe("alice");

    context.db.close();
    await context.app.close();
  });

  it("does not reuse another account's installation or a revoked device", async () => {
    const path = databasePath();
    const context = createContext(path, {
      serviceCredentialKeyMaterial: createTestServiceCredentialKeyMaterial(),
    });
    await context.service.provisionAccount("alice", password);
    await context.service.provisionAccount("bob", password);
    const bobLogin = await context.service.login("bob", password, "127.0.0.2");
    const installationId = randomUUID();
    const bobDevice = context.deviceService.register(bobLogin.sessionToken, {
      installationId,
      platform: "desktop",
      clientName: "Bob Desktop",
    });

    const aliceCode = await context.oauthService.authorizeWithPassword(
      "alice",
      password,
      "127.0.0.1",
      authorizationRequest,
    );
    const aliceExchange = await exchangeViaApp(
      context,
      tokenRequest(aliceCode.code, installationId),
    );
    expect(aliceExchange.statusCode).toBe(200);
    const aliceSession = issuedCloudSessionSchema.parse(aliceExchange.json());
    expect(aliceSession.account.id).not.toBe(bobLogin.account.id);

    const devices = context.db
      .prepare(
        "SELECT id, account_id, installation_id, revoked_at FROM devices ORDER BY created_at, id",
      )
      .all() as Array<{
      id: string;
      account_id: string;
      installation_id: string;
      revoked_at: string | null;
    }>;
    expect(devices).toHaveLength(2);
    const aliceDevice = devices.find((device) => device.account_id === aliceSession.account.id)!;
    const bobDeviceRow = devices.find((device) => device.account_id === bobLogin.account.id)!;
    expect(aliceDevice.id).not.toBe(bobDevice.id);
    expect(bobDeviceRow.id).toBe(bobDevice.id);
    expect(bobDeviceRow.revoked_at).toBeNull();
    expect(context.service.getSession(bobLogin.sessionToken).account.username).toBe("bob");

    context.deviceService.revoke(aliceSession.sessionToken, aliceDevice.id);
    expect(() => context.service.getSession(aliceSession.sessionToken)).toThrow(
      /Re-authentication/,
    );

    const nextCode = await context.oauthService.authorizeWithPassword(
      "alice",
      password,
      "127.0.0.1",
      authorizationRequest,
    );
    const revokedDeviceExchange = await exchangeViaApp(
      context,
      tokenRequest(nextCode.code, installationId),
    );
    expect(revokedDeviceExchange.statusCode).toBe(400);
    expect(revokedDeviceExchange.json()).toMatchObject({
      error: { code: "OAUTH_INVALID_GRANT" },
    });
    expect(
      context.db.prepare("SELECT COUNT(*) AS count FROM devices").get(),
    ).toMatchObject({ count: 2 });
    expect(
      context.db
        .prepare("SELECT COUNT(*) AS count FROM sessions WHERE account_id = ?")
        .get(aliceSession.account.id),
    ).toMatchObject({ count: 1 });
    expect(
      context.db
        .prepare("SELECT consumed_at FROM oauth_authorization_codes WHERE id = ?")
        .get(parseAuthorizationCode(nextCode.code)!.id),
    ).toMatchObject({ consumed_at: null });

    context.db.close();
    await context.app.close();
  });

  it("keeps every failed exchange authority-free and sanitizes the token error", async () => {
    const path = databasePath();
    const context = createContext(path, {
      now: () => new Date("2026-10-25T10:00:00.000Z"),
    });
    await context.service.provisionAccount("alice", password);
    const grant = await context.oauthService.authorizeWithPassword(
      "alice",
      password,
      "127.0.0.1",
      authorizationRequest,
    );
    const installationId = randomUUID();

    for (const request of [
      tokenRequest(grant.code, installationId, { code_verifier: "B".repeat(43) }),
      tokenRequest(grant.code, installationId, { redirect_uri: "https://evil.example/cb" }),
      tokenRequest(grant.code, installationId, {
        client_id: "mira-mobile",
        redirect_uri: "mira-mobile://oauth/callback",
      }),
    ]) {
      const response = await exchangeViaApp(context, request);
      expect(response.statusCode).toBe(400);
      const body = response.body;
      expect(body).not.toContain(grant.code);
      expect(body).not.toContain(request.code_verifier);
      expect(body).not.toContain(password);
      expect(body).not.toContain("evil.example");
      expect(body).not.toContain("secret");
      expect(response.json()).toEqual({
        error: {
          code: "OAUTH_INVALID_GRANT",
          message: "Authorization code cannot be exchanged",
        },
      });
    }

    expect(
      context.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toMatchObject({ count: 0 });
    expect(
      context.db.prepare("SELECT COUNT(*) AS count FROM devices").get(),
    ).toMatchObject({ count: 0 });
    expect(
      context.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get(),
    ).toMatchObject({ count: 1 });
    expect(
      context.db
        .prepare("SELECT consumed_at FROM oauth_authorization_codes WHERE id = ?")
        .get(parseAuthorizationCode(grant.code)!.id),
    ).toMatchObject({ consumed_at: null });

    expect(() =>
      context.oauthService.exchangeAuthorizationCode(
        tokenRequest(grant.code, installationId, {
          code_verifier: "B".repeat(43),
        }),
      ),
    ).toThrowError(OAuthError);

    context.db.close();
    await context.app.close();
  });
});
