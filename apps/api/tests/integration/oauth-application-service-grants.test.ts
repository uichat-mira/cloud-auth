import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  issuedCloudSessionSchema, registeredServiceCredentialSchema, serviceCatalogSchema,
  SERVICE_CREDENTIAL_ISSUER, type ServiceDefinition,
} from "@uichat-mira/cloud-auth-contracts";
import { createTestOAuthContext, createFirstPartySession } from "../helpers/oauth.js";
import { createTestServiceCredentialKeyMaterial, trustedServiceCredentialKeys } from "../helpers/service-credential.js";
import { ServiceRegistryRepository } from "../../src/service-registry/repository.js";
import { parseAuthorizationCode } from "../../src/oauth/authorization-code.js";
import { verifyServiceCredential } from "../../src/service-credentials/verifier.js";

const password = "correct horse battery staple";
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const clientId = "fixture-web";
const callback = "https://fixture.example/auth/callback";
const otherClient = "other-web";
const otherCallback = "https://other.example/auth/callback";
const notes: ServiceDefinition = {
  serviceId: "notes", projectId: "fixture", displayName: "Notes",
  protocol: { name: "mcp", version: "2025-11-25", endpoint: "https://fixture.example/mcp" },
  audience: "mira:service:notes", scopes: ["service:notes:read"],
};
const archive: ServiceDefinition = {
  serviceId: "archive", projectId: "fixture", displayName: "Archive",
  protocol: { name: "http", version: "1", endpoint: "https://fixture.example/archive" },
  audience: "mira:service:archive", scopes: ["service:archive:read"],
};
const otherService: ServiceDefinition = {
  ...notes, serviceId: "other", projectId: "other", displayName: "Other",
  protocol: { ...notes.protocol, endpoint: "https://other.example/mcp" },
  audience: "mira:service:other", scopes: ["service:other:read"],
};
let dir: string | undefined;
let ctx: ReturnType<typeof createTestOAuthContext> | undefined;
afterEach(async () => {
  if (ctx) { await ctx.app.close(); ctx.db.close(); ctx = undefined; }
  if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; }
});

async function setup() {
  dir = mkdtempSync(join(tmpdir(), "oauth-app-grants-"));
  const context = createTestOAuthContext(join(dir, "auth.sqlite"), {
    serviceCredentialKeyMaterial: createTestServiceCredentialKeyMaterial(),
  });
  ctx = context;
  // Explicitly seed trusted administrative records in a disposable DB.
  // No claim of a production application-management API is made by this test.
  context.db.prepare("INSERT INTO oauth_cloud_applications(client_id, project_id, display_name, redirect_uri) VALUES (?, ?, ?, ?)")
    .run(clientId, "fixture", "Fixture <Cloud>", callback);
  context.db.prepare("INSERT INTO oauth_cloud_applications(client_id, project_id, display_name, redirect_uri) VALUES (?, ?, ?, ?)")
    .run(otherClient, "other", "Other Cloud", otherCallback);
  const declare = (owner: string, definition: ServiceDefinition) => context.db.prepare(
    "INSERT INTO oauth_cloud_application_services(service_id, client_id, definition_json) VALUES (?, ?, ?)",
  ).run(definition.serviceId, owner, JSON.stringify(definition));
  declare(clientId, notes);
  declare(clientId, archive);
  declare(otherClient, otherService);
  await context.service.provisionAccount("alice", password);
  await context.service.provisionAccount("bob", password);
  const alice = await createFirstPartySession(context, { username: "alice", password, platform: "mobile" });
  const bob = await createFirstPartySession(context, { username: "bob", password, platform: "mobile" });
  const registry = new ServiceRegistryRepository(context.db);
  const catalog = async (token: string) => {
    const response = await context.app.inject({ method: "GET", url: "/v1/services", headers: { authorization: "Bearer " + token } });
    expect(response.statusCode).toBe(200);
    return serviceCatalogSchema.parse(response.json()).services;
  };
  const authorize = async (username = "alice", appId = clientId, uri = callback) => {
    const parameters = new URLSearchParams({
      response_type: "code", client_id: appId, redirect_uri: uri,
      state: "fixture-state-0123456789abcdef", code_challenge: challenge, code_challenge_method: "S256",
    });
    const page = await context.app.inject({ method: "GET", url: "/v1/oauth/authorize?" + parameters.toString() });
    expect(page.statusCode).toBe(200);
    if (appId === clientId) {
      expect(page.body).toContain("Fixture &lt;Cloud&gt;");
      expect(page.body).not.toContain("Fixture <Cloud>");
    }
    const cookie = String(page.headers["set-cookie"]).split(";")[0]!;
    parameters.set("csrf_token", cookie.split("=")[1]!);
    parameters.set("username", username);
    parameters.set("password", password);
    const authorized = await context.app.inject({
      method: "POST", url: "/v1/oauth/authorize", headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      payload: parameters.toString(),
    });
    expect(authorized.statusCode).toBe(303);
    const code = new URL(String(authorized.headers.location)).searchParams.get("code");
    expect(code).toBeTruthy();
    return code!;
  };
  const exchange = (code: string, appId = clientId, uri = callback, overrides = {}) => context.app.inject({
    method: "POST", url: "/v1/oauth/token",
    payload: { grant_type: "authorization_code", client_id: appId, code,
      redirect_uri: uri, code_verifier: verifier, installation_id: randomUUID(), platform: "web", ...overrides },
  });
  return { context, registry, alice, bob, catalog, authorize, exchange };
}

describe("OAuth application service grants", () => {
  it("grants only the actively logged-in application, atomically at successful exchange, and issues a real signed credential", async () => {
    const { context, alice, bob, catalog, authorize, exchange } = await setup();
    expect(await catalog(alice.sessionToken)).toEqual([]);
    const code = await authorize();
    expect(await catalog(alice.sessionToken)).toEqual([]);
    expect((await exchange(code, otherClient, otherCallback)).statusCode).toBe(400);
    expect((await exchange(code, clientId, callback, { code_verifier: "x".repeat(43) })).statusCode).toBe(400);
    expect(await catalog(alice.sessionToken)).toEqual([]);
    const successful = await exchange(code);
    expect(successful.statusCode).toBe(200);
    const web = issuedCloudSessionSchema.parse(successful.json());
    expect(web.account.id).toBe(alice.account.id);
    expect((await catalog(alice.sessionToken)).map(s => [s.definition.serviceId, s.revision])).toEqual([["archive", 1], ["notes", 1]]);
    expect(await catalog(bob.sessionToken)).toEqual([]);
    expect((await exchange(code)).statusCode).toBe(400);
    const tokenResponse = await context.app.inject({
      method: "POST", url: "/v1/services/notes/credential",
      headers: { authorization: "Bearer " + alice.sessionToken }, payload: { expectedRevision: 1 },
    });
    expect(tokenResponse.statusCode).toBe(200);
    const ticket = registeredServiceCredentialSchema.parse(tokenResponse.json());
    expect(verifyServiceCredential(ticket.token, {
      issuer: SERVICE_CREDENTIAL_ISSUER, audience: notes.audience,
      publicKeys: trustedServiceCredentialKeys(context),
    }).claims.sub).toBe(alice.account.id);
    const second = await exchange(await authorize());
    expect(second.statusCode).toBe(200);
    expect((await catalog(alice.sessionToken)).map(s => s.revision)).toEqual([1, 1]);
    expect((await context.app.inject({ method: "POST", url: "/v1/auth/logout", headers: { authorization: "Bearer " + web.sessionToken } })).statusCode).toBe(204);
    expect((await catalog(alice.sessionToken)).map(s => s.definition.serviceId)).toEqual(["archive", "notes"]);
    expect((await exchange(await authorize("bob", otherClient, otherCallback), otherClient, otherCallback)).statusCode).toBe(200);
    expect((await catalog(bob.sessionToken)).map(s => s.definition.serviceId)).toEqual(["other"]);
  });

  it("rejects unknown or disabled applications and a changed declaration between authorization and exchange", async () => {
    const { context, alice, catalog, authorize, exchange } = await setup();
    const untrusted = await context.app.inject({ method: "GET", url: "/v1/oauth/authorize?" + new URLSearchParams({
      response_type: "code", client_id: "unknown-web", redirect_uri: "https://unknown.example/callback",
      state: "fixture-state-0123456789abcdef", code_challenge: challenge, code_challenge_method: "S256",
    }).toString() });
    expect(untrusted.statusCode).toBe(400);
    expect(untrusted.headers.location).toBeUndefined();
    const code = await authorize();
    context.db.prepare("UPDATE oauth_cloud_application_services SET definition_json = ? WHERE service_id = ?")
      .run(JSON.stringify({ ...notes, protocol: { ...notes.protocol, version: "2026-07-28" } }), notes.serviceId);
    expect((await exchange(code)).statusCode).toBe(400);
    expect(await catalog(alice.sessionToken)).toEqual([]);
    const next = await authorize();
    context.db.prepare("UPDATE oauth_cloud_applications SET disabled_at = ? WHERE client_id = ?").run(new Date().toISOString(), clientId);
    expect((await exchange(next)).statusCode).toBe(400);
    expect(await catalog(alice.sessionToken)).toEqual([]);
  });

  it("fails closed for existing grants when a managed declaration is retired or its application disabled", async () => {
    const { context, alice, catalog, authorize, exchange } = await setup();
    expect((await exchange(await authorize())).statusCode).toBe(200);
    const credential = (id: string) => context.app.inject({
      method: "POST", url: "/v1/services/" + id + "/credential",
      headers: { authorization: "Bearer " + alice.sessionToken }, payload: { expectedRevision: 1 },
    });
    const now = new Date().toISOString();
    context.db.prepare("UPDATE oauth_cloud_application_services SET retired_at = ? WHERE service_id = ?").run(now, "notes");
    expect((await catalog(alice.sessionToken)).map(s => s.definition.serviceId)).toEqual(["archive"]);
    expect((await credential("notes")).statusCode).toBe(404);
    expect((await credential("archive")).statusCode).toBe(200);
    context.db.prepare("UPDATE oauth_cloud_applications SET disabled_at = ? WHERE client_id = ?").run(now, clientId);
    expect(await catalog(alice.sessionToken)).toEqual([]);
    expect((await credential("archive")).statusCode).toBe(404);
  });

  it("rolls back session, device, code consumption and all grants if one grant conflicts", async () => {
    const { context, registry, alice, bob, catalog, authorize, exchange } = await setup();
    registry.register(bob.account.id, { ...notes, projectId: "conflicting-project" });
    const code = await authorize();
    const before = context.db.prepare("SELECT COUNT(*) AS n FROM sessions").get();
    const beforeDevices = context.db.prepare("SELECT COUNT(*) AS n FROM devices").get();
    const result = await exchange(code);
    expect(result.statusCode).toBe(400);
    expect(await catalog(alice.sessionToken)).toEqual([]);
    expect(context.db.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual(before);
    expect(context.db.prepare("SELECT COUNT(*) AS n FROM devices").get()).toEqual(beforeDevices);
    expect(context.oauthRepository.findAuthorizationCode(parseAuthorizationCode(code)!.id)?.consumedAt).toBeNull();
  });

  it("does not silently widen an existing grant, and only a later explicit login restores a revoked grant", async () => {
    const { context, registry, alice, catalog, authorize, exchange } = await setup();
    expect((await exchange(await authorize())).statusCode).toBe(200);
    const preRevokeCode = await authorize();
    expect(registry.revoke(alice.account.id, "notes", 1)).toBe(2);
    expect((await exchange(preRevokeCode)).statusCode).toBe(400);
    expect((await catalog(alice.sessionToken)).map(s => s.definition.serviceId)).toEqual(["archive"]);
    // Later active sign-in can reauthorize. Distinguish equal millisecond timestamps.
    await new Promise(resolve => setTimeout(resolve, 5));
    expect((await exchange(await authorize())).statusCode).toBe(200);
    expect((await catalog(alice.sessionToken)).find(s => s.definition.serviceId === "notes")?.revision).toBe(3);
    const expanded = { ...notes, scopes: [...notes.scopes, "service:notes:write"] };
    context.db.prepare("UPDATE oauth_cloud_application_services SET definition_json = ? WHERE service_id = ?").run(JSON.stringify(expanded), notes.serviceId);
    expect((await exchange(await authorize())).statusCode).toBe(400);
    expect((await catalog(alice.sessionToken)).find(s => s.definition.serviceId === "notes")?.definition.scopes).toEqual(notes.scopes);
  });
});
