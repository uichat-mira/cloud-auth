import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SERVICE_CREDENTIAL_ISSUER,
  applicationManifestSchema,
  applicationServiceCatalogSchema,
  applicationServiceCredentialSchema,
  serviceDefinitionSchema,
  type ApplicationManifest,
  type ServiceDefinition,
} from "@uichat-mira/cloud-auth-contracts";
import { ServiceRegistryRepository } from "../../src/service-registry/repository.js";
import { ApplicationServiceRepository } from "../../src/application-services/repository.js";
import { verifyApplicationServiceCredential } from "../../src/service-credentials/verifier.js";
import { verifyServiceCredential } from "../../src/service-credentials/verifier.js";
import {
  createTestServiceCredentialContext,
  createTestServiceCredentialKeyMaterial,
  provisionedSession,
  trustedServiceCredentialKeys,
} from "../helpers/service-credential.js";

const appA = "app-a-instance-0001";
const appB = "app-b-instance-0001";
const originA = "https://mail-a.example";
const originB = "https://mail-b.example";
const resourceA = originA + "/mcp";
const resourceB = originB + "/mcp";
const projectId = "mail-project";
const serviceId = "mail";

let directory: string | undefined;
let context: ReturnType<typeof createTestServiceCredentialContext> | undefined;
afterEach(async () => {
  if (context) { await context.app.close(); context.db.close(); context = undefined; }
  if (directory) { rmSync(directory, { recursive: true, force: true }); directory = undefined; }
});

function manifest(
  appId: string,
  origin: string,
  manifestRevision = 1,
  scopes = ["mail.read"],
): ApplicationManifest {
  return applicationManifestSchema.parse({
    schemaVersion: "1",
    appId,
    projectId,
    name: "Mail " + appId,
    homeUrl: origin + "/",
    manifestRevision,
    oauth: {
      clientId: origin + "/oauth-client.json",
      redirectUris: [origin + "/auth/callback"],
    },
    registrationVerification: { endpoint: origin + "/mira/verify-registration" },
    services: [{
      serviceId,
      name: "Mail",
      type: "mcp",
      protocol: { name: "mcp", version: "2026-07-28", endpoint: origin + "/mcp" },
      resource: origin + "/mcp",
      scopes,
    }],
  });
}

function insertInstance(
  db: NonNullable<typeof context>["db"],
  value: ApplicationManifest,
  origin: string,
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO application_instances(
       app_id, owner_account_id, origin, project_id, display_name,
       manifest_revision, manifest_json, created_at, updated_at
     ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    value.appId,
    origin,
    value.projectId,
    value.name,
    value.manifestRevision,
    JSON.stringify(value),
    now,
    now,
  );
}

function replaceInstance(
  db: NonNullable<typeof context>["db"],
  value: ApplicationManifest,
  origin: string,
) {
  db.prepare(
    `UPDATE application_instances
        SET project_id = ?, display_name = ?, manifest_revision = ?, manifest_json = ?, updated_at = ?
      WHERE app_id = ?`,
  ).run(
    value.projectId,
    value.name,
    value.manifestRevision,
    JSON.stringify(value),
    new Date().toISOString(),
    value.appId,
  );
}

function loginGrant(
  db: NonNullable<typeof context>["db"],
  accountId: string,
  appId: string,
  manifestRevision: number,
) {
  const repository = new ApplicationServiceRepository(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    repository.establishLoginGrants(accountId, appId, manifestRevision);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return repository;
}

async function setup() {
  directory = mkdtempSync(join(tmpdir(), "application-service-"));
  const ctx = createTestServiceCredentialContext(
    join(directory, "auth.sqlite"),
    createTestServiceCredentialKeyMaterial(),
  );
  context = ctx;
  const alice = await provisionedSession(ctx, "alice");
  const bob = await provisionedSession(ctx, "bob");
  insertInstance(ctx.db, manifest(appA, originA), originA);
  insertInstance(ctx.db, manifest(appB, originB), originB);
  return { ctx, alice, bob };
}

function headers(token: string) {
  return { authorization: "Bearer " + token };
}

function catalog(ctx: NonNullable<typeof context>, token: string) {
  return ctx.app.inject({
    method: "GET",
    url: "/v1/application-services",
    headers: headers(token),
  });
}

function credential(
  ctx: NonNullable<typeof context>,
  token: string,
  appId: string,
  resource: string,
  expectedRevision: number,
) {
  return ctx.app.inject({
    method: "POST",
    url: `/v1/application-services/${appId}/${serviceId}/credential`,
    headers: headers(token),
    payload: { resource, expectedRevision },
  });
}

function revoke(
  ctx: NonNullable<typeof context>,
  token: string,
  appId: string,
  resource: string,
  expectedRevision: number,
) {
  return ctx.app.inject({
    method: "POST",
    url: `/v1/application-services/${appId}/${serviceId}/revoke`,
    headers: headers(token),
    payload: { resource, expectedRevision },
  });
}

describe("instance-scoped application service catalog and credentials", () => {
  it("isolates two APP_IDs that declare the same serviceId and only issues for the granted instance", async () => {
    const { ctx, alice, bob } = await setup();
    expect((await catalog(ctx, alice.sessionToken)).json()).toEqual({ services: [] });

    loginGrant(ctx.db, alice.account.id, appA, 1);
    const current = applicationServiceCatalogSchema.parse(
      (await catalog(ctx, alice.sessionToken)).json(),
    );
    expect(current.services.map((entry) => [entry.appId, entry.serviceId, entry.resource, entry.revision]))
      .toEqual([[appA, serviceId, resourceA, 1]]);
    expect((await catalog(ctx, bob.sessionToken)).json()).toEqual({ services: [] });

    const issuedResponse = await credential(ctx, alice.sessionToken, appA, resourceA, 1);
    expect(issuedResponse.statusCode).toBe(200);
    const ticket = applicationServiceCredentialSchema.parse(issuedResponse.json());
    expect(ticket).toMatchObject({
      appId: appA,
      serviceId,
      resource: resourceA,
      revision: 1,
      scopes: ["mail.read"],
    });
    const verified = verifyApplicationServiceCredential(ticket.token, {
      issuer: SERVICE_CREDENTIAL_ISSUER,
      expectedApplication: { appId: appA, serviceId, resource: resourceA },
      publicKeys: trustedServiceCredentialKeys(ctx),
    });
    expect(verified.claims).toMatchObject({
      sub: alice.account.id,
      device_id: alice.deviceId,
      app_id: appA,
      service_id: serviceId,
      resource: resourceA,
      aud: resourceA,
      scope: ["mail.read"],
    });
    expect(() => verifyApplicationServiceCredential(ticket.token, {
      issuer: SERVICE_CREDENTIAL_ISSUER,
      expectedApplication: { appId: appB, serviceId, resource: resourceB },
      publicKeys: trustedServiceCredentialKeys(ctx),
    })).toThrow();

    expect((await credential(ctx, alice.sessionToken, appB, resourceB, 1)).statusCode).toBe(404);
    expect((await credential(ctx, bob.sessionToken, appA, resourceA, 1)).statusCode).toBe(404);
    expect((await credential(ctx, alice.sessionToken, appA, resourceB, 1)).statusCode).toBe(404);
    expect((await credential(ctx, alice.sessionToken, appA, resourceA, 2)).statusCode).toBe(409);

    expect((await revoke(ctx, alice.sessionToken, appA, resourceA, 1)).json()).toEqual({ revision: 2 });
    expect((await catalog(ctx, alice.sessionToken)).json()).toEqual({ services: [] });
    expect((await credential(ctx, alice.sessionToken, appA, resourceA, 1)).statusCode).toBe(404);
    expect((await credential(ctx, alice.sessionToken, appA, resourceA, 2)).statusCode).toBe(404);

    loginGrant(ctx.db, alice.account.id, appA, 1);
    const regranted = applicationServiceCatalogSchema.parse(
      (await catalog(ctx, alice.sessionToken)).json(),
    );
    expect(regranted.services[0]?.revision).toBe(3);
    expect((await credential(ctx, alice.sessionToken, appA, resourceA, 3)).statusCode).toBe(200);
  });

  it("invalidates stale declarations, does not widen scope silently, and leaves old tickets to expire naturally", async () => {
    const { ctx, alice } = await setup();
    loginGrant(ctx.db, alice.account.id, appA, 1);
    const first = applicationServiceCredentialSchema.parse(
      (await credential(ctx, alice.sessionToken, appA, resourceA, 1)).json(),
    );
    const verifier = {
      issuer: SERVICE_CREDENTIAL_ISSUER,
      expectedApplication: { appId: appA, serviceId, resource: resourceA },
      publicKeys: trustedServiceCredentialKeys(ctx),
    };
    expect(verifyApplicationServiceCredential(first.token, verifier).claims.scope)
      .toEqual(["mail.read"]);

    replaceInstance(ctx.db, manifest(appA, originA, 2, ["mail.read", "mail.write"]), originA);
    expect((await catalog(ctx, alice.sessionToken)).json()).toEqual({ services: [] });
    const stale = await credential(ctx, alice.sessionToken, appA, resourceA, 1);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: { code: "APPLICATION_SERVICE_DECLARATION_CHANGED" } });

    // A previously signed offline ticket is not instantly revocable; it is
    // accepted only until its own exp.
    expect(() => verifyApplicationServiceCredential(first.token, {
      ...verifier,
      now: () => new Date(Date.now() + 601_000),
    })).toThrow(/expired/i);

    loginGrant(ctx.db, alice.account.id, appA, 2);
    const refreshed = applicationServiceCatalogSchema.parse(
      (await catalog(ctx, alice.sessionToken)).json(),
    );
    expect(refreshed.services[0]).toMatchObject({
      revision: 2,
      manifestRevision: 2,
      scopes: ["mail.read", "mail.write"],
    });
    const widened = applicationServiceCredentialSchema.parse(
      (await credential(ctx, alice.sessionToken, appA, resourceA, 2)).json(),
    );
    expect(verifyApplicationServiceCredential(widened.token, verifier).claims.scope)
      .toEqual(["mail.read", "mail.write"]);
  });

  it("does not let ordinary login or the V0 bare-serviceId path create or consume an instance grant", async () => {
    const { ctx, alice } = await setup();
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM application_service_grants").get())
      .toEqual({ n: 0 });

    const legacyAudience = `mira:service:${serviceId}` as const;
    const legacy: ServiceDefinition = serviceDefinitionSchema.parse({
      serviceId,
      projectId,
      displayName: "Legacy mail",
      protocol: { name: "mcp", version: "2025-11-25", endpoint: resourceA },
      audience: legacyAudience,
      scopes: ["service:mail:read"],
    });
    const registry = new ServiceRegistryRepository(ctx.db);
    registry.register(alice.account.id, legacy);
    const legacyTicketResponse = await ctx.app.inject({
      method: "POST",
      url: `/v1/services/${serviceId}/credential`,
      headers: headers(alice.sessionToken),
      payload: { expectedRevision: 1 },
    });
    expect(legacyTicketResponse.statusCode).toBe(200);
    const legacyTicket = String(legacyTicketResponse.json().token);

    expect((await credential(ctx, alice.sessionToken, appA, resourceA, 1)).statusCode).toBe(404);
    expect(() => verifyApplicationServiceCredential(legacyTicket, {
      issuer: SERVICE_CREDENTIAL_ISSUER,
      expectedApplication: { appId: appA, serviceId, resource: resourceA },
      publicKeys: trustedServiceCredentialKeys(ctx),
    })).toThrow(/claims|audience/i);

    loginGrant(ctx.db, alice.account.id, appA, 1);
    const instanceTicket = applicationServiceCredentialSchema.parse(
      (await credential(ctx, alice.sessionToken, appA, resourceA, 1)).json(),
    );
    expect(() => verifyServiceCredential(instanceTicket.token, {
      issuer: SERVICE_CREDENTIAL_ISSUER,
      audience: legacyAudience,
      publicKeys: trustedServiceCredentialKeys(ctx),
    })).toThrow();
  });
});
