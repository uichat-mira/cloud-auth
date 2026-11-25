import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applicationManifestSchema,
  applicationOAuthTokenResponseSchema,
  applicationServiceCatalogSchema,
  applicationServiceCredentialSchema,
  MIRA_MOBILE_OAUTH_CLIENT_ID,
  MIRA_MOBILE_OAUTH_REDIRECT_URI,
  SERVICE_CREDENTIAL_ISSUER,
} from "@uichat-mira/cloud-auth-contracts";
import { createTestOAuthContext, createFirstPartySession } from "../helpers/oauth.js";
import { createTestServiceCredentialKeyMaterial, trustedServiceCredentialKeys } from "../helpers/service-credential.js";
import { verifyApplicationServiceCredential } from "../../src/service-credentials/verifier.js";
import { ApplicationInstanceService } from "../../src/application-instances/service.js";
import { TrustedApplicationManagement } from "../../src/trusted-applications/management.js";
import { computePkceS256Challenge } from "../../src/oauth/pkce.js";

const password = "correct horse battery staple";
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = computePkceS256Challenge(verifier);
const state = "fixture-state-0123456789abcdef";
const appA = "app-fixture-a";
const appB = "app-fixture-b";
const secret = "fixture-registration-" + "x".repeat(20);
const origin = (id: string) => "https://" + id + ".example";
const clientId = (id: string) => origin(id) + "/oauth-client.json";
const callback = (id: string) => origin(id) + "/auth/callback";
const resource = (id: string) => origin(id) + "/mcp";
function declaration(id: string, revision = 1, scopes = ["mail.read"]) {
  return applicationManifestSchema.parse({
    schemaVersion: "1", appId: id, projectId: "fixture-mail",
    name: "Fixture <Mail>", homeUrl: origin(id), manifestRevision: revision,
    oauth: { clientId: clientId(id), redirectUris: [callback(id)] },
    registrationVerification: { endpoint: origin(id) + "/verify" },
    services: [{ serviceId: "mail", name: "Mail", type: "mcp",
      protocol: { name: "mcp", version: "2026-07-28", endpoint: resource(id) },
      resource: resource(id), scopes }],
  });
}
let dir: string | undefined;
let ctx: ReturnType<typeof createTestOAuthContext> | undefined;
afterEach(async () => {
  if (ctx) { await ctx.app.close(); ctx.db.close(); ctx = undefined; }
  if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; }
});
const bearer = (token: string) => ({ authorization: "Bearer " + token });

async function setup() {
  dir = mkdtempSync(join(tmpdir(), "oauth-app-v1-"));
  const context = createTestOAuthContext(join(dir, "auth.sqlite"), {
    serviceCredentialKeyMaterial: createTestServiceCredentialKeyMaterial(),
  });
  ctx = context;
  await context.service.provisionAccount("alice", password);
  await context.service.provisionAccount("bob", password);
  const alice = await createFirstPartySession(context, { username: "alice", password, platform: "mobile" });
  const bob = await createFirstPartySession(context, { username: "bob", password, platform: "mobile" });
  const manifests = new Map([appA, appB].map(id => [origin(id), declaration(id)]));
  const instances = new ApplicationInstanceService(context.db, {
    get: async url => ({ status: 200, body: manifests.get(new URL(url).origin) }),
    post: async (url, body) => {
      const manifest = manifests.get(new URL(url).origin);
      const input = body as { appId: string; appSecret: string };
      return manifest && input.appId === manifest.appId && input.appSecret === secret
        ? { status: 200, body: { ok: true, appId: input.appId } }
        : { status: 403, body: { ok: false } };
    },
  });
  for (const id of [appA, appB]) {
    await instances.register(bob.account.id, { origin: origin(id), appId: id, appSecret: secret });
  }
  const authorize = async (id = appA, username = "alice") => {
    const fields = new URLSearchParams({ response_type: "code", client_id: clientId(id),
      redirect_uri: callback(id), state, code_challenge: challenge, code_challenge_method: "S256" });
    const page = await context.app.inject({ method: "GET", url: "/v1/oauth/authorize?" + fields });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Fixture &lt;Mail&gt;");
    expect(page.body).toContain(origin(id));
    const cookie = String(page.headers["set-cookie"]).split(";")[0]!;
    fields.set("csrf_token", cookie.split("=")[1]!);
    fields.set("manifest_revision", String(manifests.get(origin(id))!.manifestRevision));
    fields.set("username", username);
    fields.set("password", password);
    const response = await context.app.inject({ method: "POST", url: "/v1/oauth/authorize",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, payload: fields.toString() });
    expect(response.statusCode).toBe(303);
    const returned = new URL(String(response.headers.location));
    expect(returned.searchParams.get("state")).toBe(state);
    return returned.searchParams.get("code")!;
  };
  const exchange = (code: string, id = appA, extra: Record<string, unknown> = {}) => context.app.inject({
    method: "POST", url: "/v1/oauth/token", payload: {
      grant_type: "authorization_code", client_id: clientId(id), redirect_uri: callback(id), code,
      code_verifier: verifier, ...extra,
    },
  });
  const catalog = async (token = alice.sessionToken) => {
    const response = await context.app.inject({ method: "GET", url: "/v1/application-services", headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    return applicationServiceCatalogSchema.parse(response.json()).services;
  };
  const credential = (id = appA, revision = 1, token = alice.sessionToken) => context.app.inject({
    method: "POST", url: "/v1/application-services/" + id + "/mail/credential",
    headers: bearer(token), payload: { resource: resource(id), expectedRevision: revision },
  });
  const appSession = (token: string) => context.app.inject({
    method: "GET", url: "/v1/oauth/application-session", headers: bearer(token),
  });
  const count = (table: "sessions" | "devices" | "application_oauth_sessions" | "application_service_grants") =>
    Number((context.db.prepare("SELECT COUNT(*) AS n FROM " + table).get() as { n: number }).n);
  const status = (disabled: boolean, token = bob.sessionToken) => context.app.inject({
    method: "POST", url: "/v1/account/applications/" + appA + "/status",
    headers: bearer(token), payload: { disabled },
  });
  return { context, alice, bob, authorize, exchange, catalog, credential, appSession, count, status, instances, manifests };
}

describe("V1 registered application OAuth and instance service grants", () => {
  it("uses real browser authorization and atomic exchange without native session or device creation", async () => {
    const s = await setup();
    expect(await s.catalog()).toEqual([]);
    const nativeSessions = s.count("sessions"), nativeDevices = s.count("devices");
    const code = await s.authorize();
    expect(await s.catalog()).toEqual([]);
    for (const response of [
      await s.exchange(code, appB),
      await s.exchange(code, appA, { code_verifier: "x".repeat(43) }),
      await s.exchange(code, appA, { redirect_uri: callback(appB) }),
      await s.exchange(code, appA, { client_secret: secret }),
      await s.exchange(code, appA, { installation_id: "01890f6e-4f3c-4cc8-9dbc-55116c2f", platform: "web" }),
      await s.exchange(code, appA, { client_id: MIRA_MOBILE_OAUTH_CLIENT_ID, redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
        installation_id: "01890f6e-4f3c-4cc8-9dbc-55116c2f", platform: "mobile" }),
    ]) expect(response.statusCode).toBe(400);
    expect(await s.catalog()).toEqual([]);
    const result = await s.exchange(code);
    expect(result.statusCode).toBe(200);
    const issued = applicationOAuthTokenResponseSchema.parse(result.json());
    expect(issued).toMatchObject({ subject: s.alice.account.id, appId: appA, audience: clientId(appA) });
    expect(issued).not.toHaveProperty("sessionToken");
    expect(s.count("sessions")).toBe(nativeSessions);
    expect(s.count("devices")).toBe(nativeDevices);
    expect(s.count("application_oauth_sessions")).toBe(1);
    expect((await s.appSession(issued.access_token)).json()).toMatchObject({ appId: appA, subject: s.alice.account.id });
    for (const url of ["/v1/auth/session", "/v1/devices", "/v1/account/applications", "/v1/application-services"]) {
      expect((await s.context.app.inject({ method: "GET", url, headers: bearer(issued.access_token) })).statusCode).toBe(401);
    }
    expect((await s.credential(appA, 1, issued.access_token)).statusCode).toBe(401);
    expect(await s.catalog(s.bob.sessionToken)).toEqual([]);
    expect((await s.catalog()).map(x => [x.appId, x.serviceId])).toEqual([[appA, "mail"]]);
    expect((await s.credential(appB)).statusCode).toBe(404);
    const ticket = applicationServiceCredentialSchema.parse((await s.credential()).json());
    expect(verifyApplicationServiceCredential(ticket.token, {
      issuer: SERVICE_CREDENTIAL_ISSUER, expectedApplication: { appId: appA, serviceId: "mail", resource: resource(appA) },
      publicKeys: trustedServiceCredentialKeys(s.context),
    }).claims.sub).toBe(s.alice.account.id);
    expect((await s.exchange(code)).statusCode).toBe(400);
    expect((await s.exchange(await s.authorize(appB), appB)).statusCode).toBe(200);
    expect((await s.catalog()).map(x => x.appId)).toEqual([appA, appB]);
  });

  it("keeps logout separate from authorization; app revoke invalidates sessions and pending codes", async () => {
    const s = await setup();
    const first = applicationOAuthTokenResponseSchema.parse((await s.exchange(await s.authorize())).json());
    expect((await s.context.app.inject({ method: "POST", url: "/v1/oauth/application-session/logout", headers: bearer(first.access_token) })).statusCode).toBe(204);
    expect((await s.appSession(first.access_token)).statusCode).toBe(401);
    expect(await s.catalog()).toHaveLength(1);
    const second = applicationOAuthTokenResponseSchema.parse((await s.exchange(await s.authorize())).json());
    const pending = await s.authorize();
    expect((await s.context.app.inject({ method: "POST", url: "/v1/account/application-authorizations/" + appA + "/revoke", headers: bearer(s.alice.sessionToken) })).statusCode).toBe(204);
    expect((await s.appSession(second.access_token)).statusCode).toBe(401);
    expect((await s.exchange(pending)).statusCode).toBe(400);
    expect(await s.catalog()).toEqual([]);
    expect((await s.credential()).statusCode).toBe(404);
    expect((await s.exchange(await s.authorize())).statusCode).toBe(200);
    expect((await s.catalog())[0]?.revision).toBe(3);
  });

  it("owner disable invalidates all prior sessions, codes and grants; enabling never restores them", async () => {
    const s = await setup();
    const first = applicationOAuthTokenResponseSchema.parse((await s.exchange(await s.authorize())).json());
    const pending = await s.authorize();
    expect((await s.status(true, s.alice.sessionToken)).statusCode).toBe(400);
    expect((await s.status(true)).statusCode).toBe(204);
    expect((await s.appSession(first.access_token)).statusCode).toBe(401);
    expect(await s.catalog()).toEqual([]);
    expect((await s.credential()).statusCode).toBe(404);
    expect((await s.exchange(pending)).statusCode).toBe(400);
    expect((await s.status(false)).statusCode).toBe(204);
    expect((await s.exchange(pending)).statusCode).toBe(400);
    expect(await s.catalog()).toEqual([]);
    expect((await s.exchange(await s.authorize())).statusCode).toBe(200);
  });

  it("a service-specific revoke also invalidates pre-revoke OAuth codes", async () => {
    const s = await setup();
    await s.exchange(await s.authorize());
    const pending = await s.authorize();
    expect((await s.context.app.inject({ method: "POST", url: "/v1/application-services/" + appA + "/mail/revoke",
      headers: bearer(s.alice.sessionToken), payload: { resource: resource(appA), expectedRevision: 1 } })).statusCode).toBe(200);
    expect((await s.exchange(pending)).statusCode).toBe(400);
    expect(await s.catalog()).toEqual([]);
    expect((await s.exchange(await s.authorize())).statusCode).toBe(200);
  });

  it("manifest change invalidates pending grants and sessions even if an earlier declaration returns", async () => {
    const s = await setup();
    const first = applicationOAuthTokenResponseSchema.parse((await s.exchange(await s.authorize())).json());
    const pending = await s.authorize();
    for (const revision of [2, 3]) {
      s.manifests.set(origin(appA), declaration(appA, revision, revision === 2 ? ["mail.read", "mail.write"] : ["mail.read"]));
      await s.instances.register(s.bob.account.id, { origin: origin(appA), appId: appA, appSecret: secret });
    }
    expect(await s.catalog()).toEqual([]);
    expect((await s.exchange(pending)).statusCode).toBe(400);
    expect((await s.appSession(first.access_token)).statusCode).toBe(401);
    expect((await s.exchange(await s.authorize())).statusCode).toBe(200);
    expect((await s.catalog())[0]).toMatchObject({ manifestRevision: 3, revision: 2, scopes: ["mail.read"] });
  });

  it("rolls back code consumption, grant and session on a failed write", async () => {
    const s = await setup();
    const code = await s.authorize();
    s.context.db.exec("CREATE TRIGGER fail_app_session BEFORE INSERT ON application_oauth_sessions BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END;");
    expect((await s.exchange(code)).statusCode).toBe(500);
    expect(s.count("application_oauth_sessions")).toBe(0);
    expect(s.count("application_service_grants")).toBe(0);
    s.context.db.exec("DROP TRIGGER fail_app_session");
    expect((await s.exchange(code)).statusCode).toBe(200);
    expect((await s.exchange(code)).statusCode).toBe(400);
  });

  it("rejects V0 trusted application OAuth even when the old enrollment exists", async () => {
    const s = await setup();
    new TrustedApplicationManagement(s.context.db).enroll("legacy-web", {
      projectId: "legacy", displayName: "Legacy", redirectUri: "https://legacy.example/callback",
      endpointOrigins: ["https://legacy.example"],
    });
    const query = new URLSearchParams({ response_type: "code", client_id: "legacy-web",
      redirect_uri: "https://legacy.example/callback", state, code_challenge: challenge, code_challenge_method: "S256" });
    expect((await s.context.app.inject({ method: "GET", url: "/v1/oauth/authorize?" + query })).statusCode).toBe(400);
    expect(await s.catalog()).toEqual([]);
  });
});
