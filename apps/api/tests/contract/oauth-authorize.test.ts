import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  MIRA_DESKTOP_OAUTH_REDIRECT_URI,
  MIRA_MOBILE_OAUTH_CLIENT_ID,
  MIRA_MOBILE_OAUTH_REDIRECT_URI,
  oauthApiErrorEnvelopeSchema,
  oauthAuthorizationCallbackErrorSchema,
  oauthAuthorizationCodeSchema,
} from "@uichat-mira/cloud-auth-contracts";
import { parseAuthorizationCode } from "../../src/oauth/authorization-code.js";
import { createTestOAuthContext } from "../helpers/oauth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "state-0123456789-abcdef";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function context() {
  const dir = mkdtempSync(join(tmpdir(), "mira-oauth-contract-"));
  cleanup.push(dir);
  return createTestOAuthContext(join(dir, "auth.sqlite"));
}

function authorizeUrl(overrides: Record<string, string | null> = {}): string {
  const parameters: Record<string, string> = {
    response_type: "code",
    client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
    redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete parameters[key];
    else parameters[key] = value;
  }
  return `/v1/oauth/authorize?${new URLSearchParams(parameters).toString()}`;
}

function locationOf(response: { headers: Record<string, unknown> }): URL | null {
  const location = response.headers.location;
  return typeof location === "string" ? new URL(location) : null;
}

async function login(context: ReturnType<typeof createTestOAuthContext>) {
  await context.service.provisionAccount("alice", password);
  return (await context.service.login("alice", password, "127.0.0.1")).sessionToken;
}

describe("OAuth authorization/callback HTTP contract", () => {
  it("issues a short-lived opaque code only to the registered desktop callback", async () => {
    const testContext = context();
    const token = await login(testContext);
    const sessionsBefore = testContext.db
      .prepare("SELECT COUNT(*) AS count FROM sessions")
      .get() as { count: number };

    const response = await testContext.app.inject({
      method: "GET",
      url: authorizeUrl(),
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    const location = locationOf(response);
    expect(location).not.toBeNull();
    expect(location?.protocol).toBe("mira-desktop:");
    expect(location?.host).toBe("oauth");
    expect(location?.pathname).toBe("/callback");
    expect(location?.searchParams.get("error")).toBeNull();
    expect(location?.searchParams.get("state")).toBe(state);
    const code = location?.searchParams.get("code") ?? "";
    expect(oauthAuthorizationCodeSchema.parse(code)).toBe(code);
    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain(password);
    expect(response.body).not.toContain(code);

    const parsed = parseAuthorizationCode(code);
    expect(parsed).not.toBeNull();
    const record = testContext.oauthRepository.findAuthorizationCode(parsed!.id);
    expect(record).toMatchObject({
      clientId: MIRA_DESKTOP_OAUTH_CLIENT_ID,
      redirectUri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      consumedAt: null,
      consumedBySessionId: null,
      consumeReason: null,
    });
    expect(record?.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record?.secretHash).not.toBe(code);
    expect(record?.accountId).toBe(
      (testContext.db.prepare("SELECT id FROM accounts WHERE username_normalized = ?").get("alice") as {
        id: string;
      }).id,
    );

    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toEqual(sessionsBefore);

    await testContext.app.close();
    testContext.db.close();
  });

  it("issues a code to the registered mobile callback for the mobile client", async () => {
    const testContext = context();
    const token = await login(testContext);

    const response = await testContext.app.inject({
      method: "GET",
      url: authorizeUrl({
        client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
        redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
      }),
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(302);
    const location = locationOf(response);
    expect(location?.protocol).toBe("mira-mobile:");
    expect(location?.searchParams.get("state")).toBe(state);
    expect(oauthAuthorizationCodeSchema.safeParse(location?.searchParams.get("code")).success).toBe(
      true,
    );

    await testContext.app.close();
    testContext.db.close();
  });

  it("denies unauthenticated, malformed, disabled and denied browser contexts", async () => {
    const testContext = context();
    const token = await login(testContext);

    for (const headers of [{}, { authorization: "Bearer not-a-cloud-session" }]) {
      const response = await testContext.app.inject({
        method: "GET",
        url: authorizeUrl(),
        headers,
      });
      expect(response.statusCode).toBe(401);
      expect(locationOf(response)).toBeNull();
      expect(oauthApiErrorEnvelopeSchema.parse(response.json())).toEqual({
        error: {
          code: "OAUTH_REAUTH_REQUIRED",
          message: "Re-authentication is required",
        },
      });
    }

    testContext.service.setDisabled("alice", true);
    const disabled = await testContext.app.inject({
      method: "GET",
      url: authorizeUrl(),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(disabled.statusCode).toBe(401);
    expect(locationOf(disabled)).toBeNull();

    testContext.service.setDisabled("alice", false);
    const freshToken = (await testContext.service.login("alice", password, "127.0.0.2"))
      .sessionToken;
    testContext.service.setAllowed("alice", false);
    const denied = await testContext.app.inject({
      method: "GET",
      url: authorizeUrl(),
      headers: { authorization: `Bearer ${freshToken}` },
    });
    expect(denied.statusCode).toBe(401);
    expect(locationOf(denied)).toBeNull();

    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get(),
    ).toMatchObject({ count: 0 });

    await testContext.app.close();
    testContext.db.close();
  });

  it("fails closed without open redirect for unregistered clients, callbacks and duplicates", async () => {
    const testContext = context();
    const token = await login(testContext);

    for (const url of [
      authorizeUrl({ client_id: null }),
      authorizeUrl({ redirect_uri: null }),
      authorizeUrl({ client_id: "third-party" }),
      authorizeUrl({ redirect_uri: "https://evil.example/callback" }),
      authorizeUrl({ redirect_uri: "javascript:alert(1)" }),
      authorizeUrl({
        client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
        redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
      }),
      `${authorizeUrl()}&client_id=${MIRA_DESKTOP_OAUTH_CLIENT_ID}`,
      `${authorizeUrl()}&redirect_uri=${encodeURIComponent(MIRA_DESKTOP_OAUTH_REDIRECT_URI)}`,
    ]) {
      const response = await testContext.app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(400);
      expect(locationOf(response)).toBeNull();
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(oauthApiErrorEnvelopeSchema.safeParse(response.json()).success).toBe(true);
      expect(response.body).not.toContain("evil.example");
    }

    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get(),
    ).toMatchObject({ count: 0 });

    await testContext.app.close();
    testContext.db.close();
  });

  it("returns bounded callback errors for unsupported or malformed authorization queries", async () => {
    const testContext = context();
    const token = await login(testContext);

    const cases: Array<{ url: string; error: string; state?: string }> = [
      {
        url: authorizeUrl({ response_type: "token", state: null }),
        error: "unsupported_response_type",
      },
      {
        url: authorizeUrl({ response_type: "id_token" }),
        error: "unsupported_response_type",
        state,
      },
      {
        url: authorizeUrl({ response_type: null }),
        error: "invalid_request",
        state,
      },
      {
        url: authorizeUrl({ code_challenge: null }),
        error: "invalid_request",
        state,
      },
      {
        url: authorizeUrl({ code_challenge: "short" }),
        error: "invalid_request",
        state,
      },
      {
        url: authorizeUrl({ code_challenge: "a".repeat(43) }),
        error: "invalid_request",
        state,
      },
      {
        url: authorizeUrl({ code_challenge_method: "plain" }),
        error: "invalid_request",
        state,
      },
      {
        url: authorizeUrl({ state: null }),
        error: "invalid_request",
      },
      {
        url: authorizeUrl({ state: "short" }),
        error: "invalid_request",
      },
      {
        url: authorizeUrl({ state: `${state}&code=injected` }),
        error: "invalid_request",
      },
      {
        url: authorizeUrl({ state: `${state}\r\nlocation: https://evil.example` }),
        error: "invalid_request",
      },
      {
        url: `${authorizeUrl()}&username=attacker`,
        error: "invalid_request",
        state,
      },
      {
        url: `${authorizeUrl()}&device_id=attacker-device`,
        error: "invalid_request",
        state,
      },
      {
        url: `${authorizeUrl()}&account_id=attacker-account`,
        error: "invalid_request",
        state,
      },
    ];

    for (const testCase of cases) {
      const response = await testContext.app.inject({
        method: "GET",
        url: testCase.url,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(302);
      const location = locationOf(response);
      expect(location).not.toBeNull();
      expect(location?.protocol).toBe("mira-desktop:");
      expect(location?.searchParams.get("code")).toBeNull();
      const error = oauthAuthorizationCallbackErrorSchema.parse(
        location?.searchParams.get("error"),
      );
      expect(error).toBe(testCase.error);
      expect(location?.searchParams.get("state")).toBe(testCase.state ?? null);
      expect(response.body).not.toContain("\r");
      expect(response.body).not.toContain("\n");
      expect(response.body).not.toContain(token);
    }

    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get(),
    ).toMatchObject({ count: 0 });

    await testContext.app.close();
    testContext.db.close();
  });
});
