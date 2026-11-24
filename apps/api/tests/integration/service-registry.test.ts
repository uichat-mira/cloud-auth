import { afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SERVICE_CREDENTIAL_ISSUER, registeredServiceCredentialSchema, serviceCatalogSchema,
  serviceDefinitionSchema, type ServiceDefinition,
} from "@uichat-mira/cloud-auth-contracts";
import { ServiceRegistryRepository } from "../../src/service-registry/repository.js";
import { verifyServiceCredential } from "../../src/service-credentials/verifier.js";
import { createTestServiceCredentialContext, createTestServiceCredentialKeyMaterial, provisionedSession, trustedServiceCredentialKeys, setGuanlanRegistrationStatus } from "../helpers/service-credential.js";

const notes: ServiceDefinition = {
  serviceId: "notes", projectId: "fixture", displayName: "Notes",
  protocol: { name: "mcp", version: "2025-11-25", endpoint: "https://notes.example/mcp" },
  audience: "mira:service:notes", scopes: ["service:notes:read"],
};
const archive: ServiceDefinition = {
  serviceId: "archive", projectId: "fixture", displayName: "Archive",
  protocol: { name: "http", version: "1", endpoint: "https://archive.example/api" },
  audience: "mira:service:archive", scopes: ["service:archive:read"],
};
const mail: ServiceDefinition = {
  serviceId: "who-you", projectId: "who-you", displayName: "Who You",
  protocol: { name: "mcp", version: "2025-11-25", endpoint: "https://who-you.tomz.io/mcp" },
  audience: "mira:who-you", scopes: ["whoyou.read"],
};
const guanlan: ServiceDefinition = {
  serviceId: "cloud-guanlan", projectId: "cloud-guanlan", displayName: "Guanlan",
  protocol: { name: "mcp", version: "2025-11-25", endpoint: "https://guanlan.example/mcp" },
  audience: "mira:cloud-guanlan", scopes: ["guanlan.read"],
};

let directory: string | undefined;
let ctx: ReturnType<typeof createTestServiceCredentialContext> | undefined;
afterEach(async () => {
  if (ctx) { await ctx.app.close(); ctx.db.close(); ctx = undefined; }
  if (directory) { rmSync(directory, { recursive: true, force: true }); directory = undefined; }
});
async function setup() {
  directory = mkdtempSync(join(tmpdir(), "service-registry-"));
  const dbPath = join(directory, "auth.sqlite");
  const keys = createTestServiceCredentialKeyMaterial();
  const context = createTestServiceCredentialContext(dbPath, keys);
  ctx = context;
  const alice = await provisionedSession(context, "alice");
  const bob = await provisionedSession(context, "bob");
  const registry = new ServiceRegistryRepository(context.db);
  return { context, registry, alice, bob, dbPath, keys };
}
describe("registered service catalog and credentials", () => {
  it("validates service identities, scopes and credential-free HTTPS descriptors", () => {
    for (const invalid of [
      {...notes, audience: archive.audience},
      {...notes, scopes: archive.scopes},
      {...notes, scopes: ["service:notes:read", "service:notes:read"]},
      {...notes, protocol: {...notes.protocol, endpoint: "http://notes.example/mcp"}},
      {...notes, protocol: {...notes.protocol, endpoint: "https://user:password@notes.example/mcp"}},
      {...notes, protocol: {...notes.protocol, endpoint: "https://notes.example/mcp?token=abc"}},
      {...mail, scopes: ["whoyou.read", "whoyou.mail.write"]},
      {...mail, serviceId: "imposter"},
      {...notes, serviceId: "who-you", audience: "mira:service:who-you", scopes: ["service:who-you:read"]},
      {...notes, audience: "mira:cloud-relay-transport"},
    ]) expect(serviceDefinitionSchema.safeParse(invalid).success).toBe(false);
  });

  it("discovers new independent services, issues real signed credentials, rejects foreign/stale/revoked grants and survives reopen", async () => {
    const { context, registry, alice, bob, dbPath, keys } = await setup();
    const headers = (token: string) => ({ authorization: "Bearer " + token });
    const catalog = (token: string) => context.app.inject({ method: "GET", url: "/v1/services", headers: headers(token) });
    const credential = (token: string, id: string, expectedRevision: number, extra = {}) => context.app.inject({
      method: "POST", url: "/v1/services/" + id + "/credential",
      headers: headers(token), payload: { expectedRevision, ...extra },
    });
    expect(registry.register(alice.account.id, notes).revision).toBe(1);
    expect(registry.register(alice.account.id, notes).revision).toBe(1);
    registry.register(alice.account.id, archive);
    const current = await catalog(alice.sessionToken);
    expect(current.statusCode).toBe(200);
    expect(current.headers["cache-control"]).toBe("no-store");
    expect(serviceCatalogSchema.parse(current.json()).services.map(s => s.definition.serviceId)).toEqual(["archive", "notes"]);
    expect(serviceCatalogSchema.parse((await catalog(bob.sessionToken)).json()).services).toEqual([]);
    expect((await catalog("invalid")).statusCode).toBe(401);
    expect((await credential(bob.sessionToken, "notes", 1)).statusCode).toBe(404);
    expect((await credential(alice.sessionToken, "missing", 1)).statusCode).toBe(404);
    expect((await credential(alice.sessionToken, "notes", 1, { audience: archive.audience })).statusCode).toBe(400);
    expect((await credential(alice.sessionToken, "notes", 1, { scopes: ["service:notes:write"] })).statusCode).toBe(400);
    expect((await context.app.inject({ method: "POST", url: "/v1/service-credentials", headers: headers(alice.sessionToken), payload: { audience: notes.audience } })).statusCode).toBe(400);
    expect((await context.app.inject({ method: "POST", url: "/v1/services", headers: headers(alice.sessionToken), payload: notes })).statusCode).toBe(404);
    const issuedResponse = await credential(alice.sessionToken, "notes", 1);
    expect(issuedResponse.statusCode).toBe(200);
    const issued = registeredServiceCredentialSchema.parse(issuedResponse.json());
    const verifier = { issuer: SERVICE_CREDENTIAL_ISSUER, audience: notes.audience, publicKeys: trustedServiceCredentialKeys(context) };
    const claims = verifyServiceCredential(issued.token, verifier).claims;
    expect(claims.sub).toBe(alice.account.id);
    expect(claims.device_id).toBe(alice.deviceId);
    expect(claims.scope).toEqual(notes.scopes);
    expect(() => verifyServiceCredential(issued.token, { ...verifier, audience: archive.audience })).toThrow();
    expect(() => verifyServiceCredential(issued.token, { ...verifier, audience: "mira:who-you" })).toThrow();

    // Independent protocol fixture consumes the same signed bearer rather than mocking the issuer.
    const mcp = Fastify();
    mcp.post("/mcp", async (request, reply) => {
      try {
        const checked = verifyServiceCredential(String(request.headers.authorization).slice(7), verifier).claims;
        if (checked.sub !== alice.account.id || !checked.scope.includes("service:notes:read" as never)) return reply.code(403).send();
        const body = request.body as { method: string; id: number };
        if (body.method === "initialize") return {jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25", capabilities: {tools: {}}, serverInfo: {name: "notes", version: "1"} }};
        if (body.method === "tools/list") return {jsonrpc: "2.0", id: body.id, result: {tools: [{name: "read_note", description: "Read a fixture note", inputSchema: {type: "object"}}]}};
        if (body.method === "tools/call") return {jsonrpc: "2.0", id: body.id, result: {content: [{type: "text", text: "fixture note"}]}};
        return reply.code(400).send();
      } catch { return reply.code(401).send(); }
    });
    try {
      for (const method of ["initialize", "tools/list", "tools/call"]) {
        const result = await mcp.inject({method: "POST", url: "/mcp", headers: headers(issued.token), payload: {jsonrpc: "2.0", method, id: 1}});
        expect(result.statusCode).toBe(200);
        if (method === "tools/call") expect(result.json().result.content[0].text).toBe("fixture note");
      }
      const archiveToken = registeredServiceCredentialSchema.parse((await credential(alice.sessionToken, "archive", 1)).json()).token;
      expect((await mcp.inject({method: "POST", url: "/mcp", headers: headers(archiveToken), payload: {method: "tools/list", id: 1}})).statusCode).toBe(401);
    } finally { await mcp.close(); }

    const changed = {...notes, protocol: {...notes.protocol, version: "2026-07-28"}};
    expect(() => registry.register(alice.account.id, changed)).toThrow("SERVICE_REGISTRATION_CHANGED");
    expect(registry.register(alice.account.id, changed, 1).revision).toBe(2);
    expect((await credential(alice.sessionToken, "notes", 1)).statusCode).toBe(409);
    expect((await credential(alice.sessionToken, "notes", 2)).statusCode).toBe(200);
    expect(() => registry.register(bob.account.id, {...notes, projectId: "other"})).toThrow("SERVICE_REGISTRATION_IDENTITY_CONFLICT");
    expect(registry.revoke(alice.account.id, "notes", 2)).toBe(3);
    expect(registry.revoke(alice.account.id, "notes", 3)).toBe(3);
    expect((await credential(alice.sessionToken, "notes", 2)).statusCode).toBe(404);
    expect(serviceCatalogSchema.parse((await catalog(alice.sessionToken)).json()).services.map(s => s.definition.serviceId)).toEqual(["archive"]);
    expect(verifyServiceCredential(issued.token, verifier).claims.sub).toBe(alice.account.id);
    expect(() => verifyServiceCredential(issued.token, { ...verifier, now: () => new Date(issued.expiresAt) })).toThrow();

    await context.app.close();
    context.db.close();
    ctx = undefined;
    const reopened = createTestServiceCredentialContext(dbPath, keys);
    ctx = reopened;
    expect(new ServiceRegistryRepository(reopened.db).list(alice.account.id).map(s => s.definition.serviceId)).toEqual(["archive"]);
    expect(() => new ServiceRegistryRepository(reopened.db).register(alice.account.id, notes)).toThrow("SERVICE_REGISTRATION_CHANGED");
  });

  it("reuses canonical service credentials and does not bypass Guanlan admission or device/session authority", async () => {
    const { context, registry, alice } = await setup();
    registry.register(alice.account.id, mail);
    registry.register(alice.account.id, guanlan);
    registry.register(alice.account.id, notes);
    const call = (id: string) => context.app.inject({method: "POST", url: "/v1/services/" + id + "/credential", headers: {authorization: "Bearer " + alice.sessionToken}, payload: {expectedRevision: 1}});
    const mailResponse = await call("who-you");
    expect(mailResponse.statusCode).toBe(200);
    const token = registeredServiceCredentialSchema.parse(mailResponse.json()).token;
    expect(verifyServiceCredential(token, {issuer: SERVICE_CREDENTIAL_ISSUER, audience: mail.audience, publicKeys: trustedServiceCredentialKeys(context)}).claims.scope).toEqual(["whoyou.read"]);
    expect((await call("cloud-guanlan")).statusCode).toBe(409);
    setGuanlanRegistrationStatus(context.db, alice.account.id, "delivered");
    expect((await call("cloud-guanlan")).statusCode).toBe(200);
    const generic = await call("notes");
    expect(generic.statusCode).toBe(200);
    expect((await context.app.inject({method: "POST", url: "/v1/auth/logout", headers: {authorization: "Bearer " + alice.sessionToken}})).statusCode).toBe(204);
    expect((await call("notes")).statusCode).toBe(401);
  });
});
