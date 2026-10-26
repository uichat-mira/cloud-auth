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
  return "/v1/oauth/authorize?" + new URLSearchParams(parameters).toString();
}

function locationOf(response: { headers: Record<string, unknown> }): URL | null {
  const location = response.headers.location;
  return typeof location === "string" ? new URL(location) : null;
}

async function browserAuthorize(
  testContext: ReturnType<typeof createTestOAuthContext>,
  url = authorizeUrl(),
  username = "alice",
  pass = password,
  formOverrides: Record<string, string> = {},
) {
  const page = await testContext.app.inject({ method: "GET", url });
  expect(page.statusCode).toBe(200);
  expect(page.headers["content-type"]).toContain("text/html");
  expect(page.body).not.toContain("Bearer");
  const cookieHeader = page.headers["set-cookie"];
  expect(typeof cookieHeader).toBe("string");
  const csrfCookie = String(cookieHeader).split(";")[0]!;
  const csrf = csrfCookie.split("=")[1]!;
  const fields = new URLSearchParams(url.split("?")[1]);
  fields.set("csrf_token", csrf);
  fields.set("username", username);
  fields.set("password", pass);
  for (const [key, value] of Object.entries(formOverrides)) fields.set(key, value);
  const response = await testContext.app.inject({
    method: "POST",
    url: "/v1/oauth/authorize",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: csrfCookie,
    },
    payload: fields.toString(),
  });
  return { page, response, csrfCookie, csrf };
}

describe("OAuth authorization/callback HTTP contract", () => {
  it("returns a browser form without a Bearer and only issues after password + CSRF submit", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);

    const initial = await testContext.app.inject({ method: "GET", url: authorizeUrl() });
    expect(initial.statusCode).toBe(200);
    expect(locationOf(initial)).toBeNull();
    expect(initial.body).toContain('method="post"');
    expect(initial.body).toContain('<html lang="zh-CN">');
    expect(initial.body).toContain("登录并授权");
    expect(initial.body).toContain("授权 Mira Desktop");
    expect(initial.body).toContain('name="username"');
    expect(initial.body).toContain('name="password"');
    expect(initial.body).toContain('name="csrf_token"');
    expect(initial.body).toContain("focus-visible");
    expect(initial.body).not.toContain("#31359d");
    expect(initial.body).not.toContain("<script");
    expect(initial.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(initial.body).not.toContain(password);
    expect(testContext.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get())
      .toMatchObject({ count: 0 });

    const { response } = await browserAuthorize(testContext);
    expect(response.statusCode).toBe(303);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    const location = locationOf(response);
    expect(location?.protocol).toBe("mira-desktop:");
    expect(location?.host).toBe("oauth");
    expect(location?.pathname).toBe("/callback");
    expect(location?.searchParams.get("state")).toBe(state);
    const code = location?.searchParams.get("code") ?? "";
    expect(oauthAuthorizationCodeSchema.parse(code)).toBe(code);
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
    expect(testContext.db.prepare("SELECT COUNT(*) AS count FROM sessions").get())
      .toMatchObject({ count: 0 });

    await testContext.app.close();
    testContext.db.close();
  });

  it("issues only to the fixed Mobile callback", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const { page, response } = await browserAuthorize(testContext, authorizeUrl({
      client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
      redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
    }));
    expect(page.body).toContain("授权 Mira Mobile");
    expect(page.body).toContain('method="post"');
    expect(response.statusCode).toBe(303);
    const location = locationOf(response);
    expect(location?.protocol).toBe("mira-mobile:");
    expect(location?.searchParams.get("state")).toBe(state);
    expect(oauthAuthorizationCodeSchema.safeParse(location?.searchParams.get("code")).success).toBe(true);
    await testContext.app.close();
    testContext.db.close();
  });

  it("cannot issue through a Cloud Session Bearer, missing CSRF or forged cookies", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const token = (await testContext.service.login("alice", password, "127.0.0.1")).sessionToken;
    const page = await testContext.app.inject({
      method: "GET",
      url: authorizeUrl(),
      headers: { authorization: "Bearer " + token },
    });
    expect(page.statusCode).toBe(200);
    expect(locationOf(page)).toBeNull();
    const fields = new URLSearchParams(authorizeUrl().split("?")[1]);
    fields.set("username", "alice");
    fields.set("password", password);
    const headers = { "content-type": "application/x-www-form-urlencoded" };

    const noCsrf = await testContext.app.inject({
      method: "POST", url: "/v1/oauth/authorize", headers, payload: fields.toString(),
    });
    expect(noCsrf.statusCode).toBe(403);
    fields.set("csrf_token", "A".repeat(43));
    const forged = await testContext.app.inject({
      method: "POST", url: "/v1/oauth/authorize",
      headers: { ...headers, cookie: "mira_oauth_csrf=" + "B".repeat(43) },
      payload: fields.toString(),
    });
    expect(forged.statusCode).toBe(403);
    expect(testContext.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get())
      .toMatchObject({ count: 0 });
    await testContext.app.close();
    testContext.db.close();
  });

  it("denies wrong credentials and accounts disabled or denied after the form GET", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const wrong = await browserAuthorize(testContext, authorizeUrl(), "alice", "wrong-password");
    expect(wrong.response.statusCode).toBe(401);
    expect(wrong.response.body).toContain("Invalid account or password");
    expect(wrong.response.body).not.toContain("wrong-password");

    const page = await testContext.app.inject({ method: "GET", url: authorizeUrl() });
    const cookie = String(page.headers["set-cookie"]).split(";")[0]!;
    const fields = new URLSearchParams(authorizeUrl().split("?")[1]);
    fields.set("csrf_token", cookie.split("=")[1]!);
    fields.set("username", "alice");
    fields.set("password", password);
    testContext.service.setDisabled("alice", true);
    const disabled = await testContext.app.inject({
      method: "POST", url: "/v1/oauth/authorize",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      payload: fields.toString(),
    });
    expect(disabled.statusCode).toBe(401);
    testContext.service.setDisabled("alice", false);
    testContext.service.setAllowed("alice", false);
    const denied = await testContext.app.inject({
      method: "POST", url: "/v1/oauth/authorize",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      payload: fields.toString(),
    });
    expect(denied.statusCode).toBe(401);
    expect(testContext.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get())
      .toMatchObject({ count: 0 });
    await testContext.app.close();
    testContext.db.close();
  });

  it("rejects forged POST clients, changed callback, duplicate fields and unknown fields", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    for (const overrides of [
      { redirect_uri: "https://evil.example/x" },
      { client_id: "third-party" },
      { code_challenge_method: "plain" },
      { code_challenge: "invalid" },
    ]) {
      const { response } = await browserAuthorize(testContext, authorizeUrl(), "alice", password, overrides);
      expect(response.statusCode).toBe(400);
      expect(locationOf(response)).toBeNull();
    }

    const page = await testContext.app.inject({ method: "GET", url: authorizeUrl() });
    const cookie = String(page.headers["set-cookie"]).split(";")[0]!;
    const fields = new URLSearchParams(authorizeUrl().split("?")[1]);
    fields.set("csrf_token", cookie.split("=")[1]!);
    fields.set("username", "alice");
    fields.set("password", password);
    const headers = { "content-type": "application/x-www-form-urlencoded", cookie };
    for (const extra of ["&client_id=mira-desktop", "&consent=true"]) {
      const duplicate = await testContext.app.inject({
        method: "POST", url: "/v1/oauth/authorize", headers,
        payload: fields.toString() + extra,
      });
      expect(duplicate.statusCode).toBe(400);
    }
    expect(testContext.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get())
      .toMatchObject({ count: 0 });
    await testContext.app.close();
    testContext.db.close();
  });

  it("rejects unregistered GET clients/callbacks and duplicate query keys before any redirect", async () => {
    const testContext = context();
    for (const url of [
      authorizeUrl({ client_id: null }),
      authorizeUrl({ redirect_uri: null }),
      authorizeUrl({ client_id: "third-party" }),
      authorizeUrl({ redirect_uri: "https://evil.example/callback" }),
      authorizeUrl({ redirect_uri: "javascript:alert(1)" }),
      authorizeUrl({ client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID, redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI }),
      authorizeUrl() + "&client_id=mira-desktop",
      authorizeUrl() + "&redirect_uri=" + encodeURIComponent(MIRA_DESKTOP_OAUTH_REDIRECT_URI),
    ]) {
      const response = await testContext.app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(400);
      expect(locationOf(response)).toBeNull();
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(oauthApiErrorEnvelopeSchema.safeParse(response.json()).success).toBe(true);
      expect(response.body).not.toContain("evil.example");
    }
    await testContext.app.close();
    testContext.db.close();
  });

  it("returns bounded errors for unsupported and malformed GET parameters", async () => {
    const testContext = context();
    const cases: Array<{ url: string; error: string; state?: string }> = [
      { url: authorizeUrl({ response_type: "token", state: null }), error: "unsupported_response_type" },
      { url: authorizeUrl({ response_type: "id_token" }), error: "unsupported_response_type", state },
      { url: authorizeUrl({ response_type: null }), error: "invalid_request", state },
      { url: authorizeUrl({ code_challenge: null }), error: "invalid_request", state },
      { url: authorizeUrl({ code_challenge: "short" }), error: "invalid_request", state },
      { url: authorizeUrl({ code_challenge: "a".repeat(43) }), error: "invalid_request", state },
      { url: authorizeUrl({ code_challenge_method: "plain" }), error: "invalid_request", state },
      { url: authorizeUrl({ state: null }), error: "invalid_request" },
      { url: authorizeUrl({ state: "short" }), error: "invalid_request" },
      { url: authorizeUrl({ state: state + "&code=injected" }), error: "invalid_request" },
      { url: authorizeUrl({ state: state + "\r\nlocation: https://evil.example" }), error: "invalid_request" },
      { url: authorizeUrl() + "&username=attacker", error: "invalid_request", state },
      { url: authorizeUrl() + "&device_id=attacker-device", error: "invalid_request", state },
      { url: authorizeUrl() + "&account_id=attacker-account", error: "invalid_request", state },
    ];
    for (const testCase of cases) {
      const response = await testContext.app.inject({ method: "GET", url: testCase.url });
      expect(response.statusCode).toBe(302);
      const location = locationOf(response);
      expect(location?.protocol).toBe("mira-desktop:");
      expect(location?.searchParams.get("code")).toBeNull();
      const error = oauthAuthorizationCallbackErrorSchema.parse(location?.searchParams.get("error"));
      expect(error).toBe(testCase.error);
      expect(location?.searchParams.get("state")).toBe(testCase.state ?? null);
      expect(response.body).not.toContain("\r");
      expect(response.body).not.toContain("\n");
    }
    expect(testContext.db.prepare("SELECT COUNT(*) AS count FROM oauth_authorization_codes").get())
      .toMatchObject({ count: 0 });
    await testContext.app.close();
    testContext.db.close();
  });
});
