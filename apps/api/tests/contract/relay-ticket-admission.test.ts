import { createPublicKey, type JsonWebKey, type KeyObject } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
  CLOUD_SHIYAN_AUDIENCE,
  RELAY_TRANSPORT_SCOPE,
  SERVICE_CREDENTIAL_ISSUER,
  SHIYAN_AUTHENTICATE_SCOPE,
  issuedServiceCredentialSchema,
  serviceCredentialErrorEnvelopeSchema,
} from "@uichat-mira/cloud-auth-contracts";
import { verifyServiceCredential } from "../../src/service-credentials/index.js";
import {
  createFirstPartySession,
  createTestOAuthContext,
  type TestOAuthContext,
} from "../helpers/oauth.js";
import { createTestServiceCredentialKeyMaterial } from "../helpers/service-credential.js";

const password = "correct horse battery staple";
const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function context(): TestOAuthContext {
  const dir = mkdtempSync(join(tmpdir(), "mira-relay-ticket-contract-"));
  cleanup.push(dir);
  return createTestOAuthContext(join(dir, "auth.sqlite"), {
    serviceCredentialKeyMaterial: createTestServiceCredentialKeyMaterial(),
  });
}

function issue(context: TestOAuthContext, token: string, body: unknown) {
  return context.app.inject({
    method: "POST",
    url: "/v1/service-credentials",
    headers: { authorization: `Bearer ${token}` },
    payload: body as Record<string, unknown>,
  });
}

function trustedKeys(context: TestOAuthContext): Map<string, KeyObject> {
  const ring = context.keyRing;
  if (!ring) throw new Error("Expected a configured key ring");
  return new Map(
    ring.jwks.keys.map((jwk) => [
      jwk.kid,
      createPublicKey({ key: jwk as JsonWebKey, format: "jwk" }),
    ]),
  );
}

interface Accounts {
  aliceDesktop: Awaited<ReturnType<typeof createFirstPartySession>>;
  aliceMobile: Awaited<ReturnType<typeof createFirstPartySession>>;
  bobDesktop: Awaited<ReturnType<typeof createFirstPartySession>>;
  bobMobile: Awaited<ReturnType<typeof createFirstPartySession>>;
  aliceHost: ReturnType<TestOAuthContext["hostService"]["register"]>;
  bobHost: ReturnType<TestOAuthContext["hostService"]["register"]>;
}

async function createAccounts(context: TestOAuthContext): Promise<Accounts> {
  await context.service.provisionAccount("alice", password);
  await context.service.provisionAccount("bob", password);
  const aliceDesktop = await createFirstPartySession(context, {
    username: "alice",
    password,
  });
  const aliceMobile = await createFirstPartySession(context, {
    username: "alice",
    password,
    platform: "mobile",
  });
  const bobDesktop = await createFirstPartySession(context, {
    username: "bob",
    password,
  });
  const bobMobile = await createFirstPartySession(context, {
    username: "bob",
    password,
    platform: "mobile",
  });
  return {
    aliceDesktop,
    aliceMobile,
    bobDesktop,
    bobMobile,
    aliceHost: context.hostService.register(aliceDesktop.sessionToken),
    bobHost: context.hostService.register(bobDesktop.sessionToken),
  };
}

describe("Relay ticket HTTP admission contract", () => {
  it("issues signed host and client tickets with the OPS-008 audience, scope and room", async () => {
    const testContext = context();
    const accounts = await createAccounts(testContext);

    const hostResponse = await issue(testContext, accounts.aliceDesktop.sessionToken, {
      audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
      relay: { room: accounts.aliceHost.relayRoom, role: "host" },
    });
    expect(hostResponse.statusCode).toBe(200);
    const hostTicket = issuedServiceCredentialSchema.parse(hostResponse.json());
    expect(hostTicket.audience).toBe(CLOUD_RELAY_TRANSPORT_AUDIENCE);

    const hostVerified = verifyServiceCredential(hostTicket.token, {
      issuer: SERVICE_CREDENTIAL_ISSUER,
      audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
      publicKeys: trustedKeys(testContext),
      expectedRelay: { room: accounts.aliceHost.relayRoom, role: "host" },
    });
    expect(hostVerified.claims).toMatchObject({
      sub: accounts.aliceDesktop.account.id,
      device_id: accounts.aliceHost.deviceId,
      aud: CLOUD_RELAY_TRANSPORT_AUDIENCE,
      scope: [RELAY_TRANSPORT_SCOPE],
      relay: { room: accounts.aliceHost.relayRoom, role: "host" },
    });

    const clientResponse = await issue(testContext, accounts.aliceMobile.sessionToken, {
      audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
      relay: { room: accounts.aliceHost.relayRoom, role: "client" },
    });
    expect(clientResponse.statusCode).toBe(200);
    const clientTicket = issuedServiceCredentialSchema.parse(clientResponse.json());
    const clientVerified = verifyServiceCredential(clientTicket.token, {
      issuer: SERVICE_CREDENTIAL_ISSUER,
      audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
      publicKeys: trustedKeys(testContext),
      expectedRelay: { room: accounts.aliceHost.relayRoom, role: "client" },
    });
    expect(clientVerified.claims).toMatchObject({
      sub: accounts.aliceMobile.account.id,
      aud: CLOUD_RELAY_TRANSPORT_AUDIENCE,
      scope: [RELAY_TRANSPORT_SCOPE],
      relay: { room: accounts.aliceHost.relayRoom, role: "client" },
    });

    expect(hostResponse.body).not.toContain("sessionToken");
    expect(clientResponse.body).not.toContain(accounts.aliceMobile.sessionToken);

    await testContext.app.close();
    testContext.db.close();
  });

  it("rejects forged room, role, account and device metadata without leaking room ownership", async () => {
    const testContext = context();
    const accounts = await createAccounts(testContext);
    const hostCountBefore = testContext.db
      .prepare("SELECT COUNT(*) AS count FROM desktop_hosts")
      .get();

    const deniedBodies: Array<{ token: string; body: unknown }> = [
      {
        token: accounts.aliceMobile.sessionToken,
        body: {
          audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
          relay: { room: accounts.aliceHost.relayRoom, role: "host" },
        },
      },
      {
        token: accounts.aliceDesktop.sessionToken,
        body: {
          audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
          relay: { room: accounts.aliceHost.relayRoom, role: "client" },
        },
      },
      {
        token: accounts.bobMobile.sessionToken,
        body: {
          audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
          relay: { room: accounts.aliceHost.relayRoom, role: "client" },
        },
      },
      {
        token: accounts.bobDesktop.sessionToken,
        body: {
          audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
          relay: { room: accounts.aliceHost.relayRoom, role: "host" },
        },
      },
      {
        token: accounts.aliceMobile.sessionToken,
        body: {
          audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
          relay: { room: "room_unknown", role: "client" },
        },
      },
      {
        token: accounts.aliceMobile.sessionToken,
        body: {
          audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
          relay: { room: accounts.bobHost.relayRoom, role: "client" },
        },
      },
      {
        token: accounts.aliceDesktop.sessionToken,
        body: {
          audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
          relay: { room: accounts.bobHost.relayRoom, role: "host" },
        },
      },
    ];

    const failures = await Promise.all(
      deniedBodies.map(async ({ token, body }) => {
        const response = await issue(testContext, token, body);
        expect(response.statusCode).toBe(403);
        const envelope = serviceCredentialErrorEnvelopeSchema.parse(response.json());
        expect(envelope.error.code).toBe("SERVICE_CREDENTIAL_RELAY_NOT_AUTHORIZED");
        expect(envelope.error.message).toBe(
          "Relay transport ticket is not authorized for this device",
        );
        expect(response.body).not.toContain(accounts.aliceHost.relayRoom);
        expect(response.body).not.toContain(accounts.bobHost.relayRoom);
        expect(response.body).not.toContain(accounts.bobHost.deviceId);
        expect(response.body).not.toContain("eyJ");
        return envelope;
      }),
    );
    expect(new Set(failures.map((failure) => failure.error.message)).size).toBe(1);

    for (const body of [
      {
        audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
        relay: { room: accounts.aliceHost.relayRoom, role: "host" },
        accountId: accounts.bobMobile.account.id,
      },
      {
        audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
        relay: { room: accounts.aliceHost.relayRoom, role: "host" },
        deviceId: accounts.aliceHost.deviceId,
      },
      {
        audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
        relay: { room: accounts.aliceHost.relayRoom, role: "host" },
        platform: "desktop",
      },
      {
        audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
        relay: { room: accounts.aliceHost.relayRoom, role: "client", tool: "terminal" },
      },
    ]) {
      const response = await issue(testContext, accounts.aliceMobile.sessionToken, body);
      expect(response.statusCode).toBe(400);
      expect(serviceCredentialErrorEnvelopeSchema.parse(response.json()).error.code).toBe(
        "SERVICE_CREDENTIAL_INVALID_REQUEST",
      );
    }

    for (const token of ["", "not-a-token", "mcs_v1.unknown.secret"]) {
      const response = await issue(testContext, token, {
        audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
        relay: { room: accounts.aliceHost.relayRoom, role: "client" },
      });
      expect(response.statusCode).toBe(401);
      expect(serviceCredentialErrorEnvelopeSchema.parse(response.json()).error.code).toBe(
        "SERVICE_CREDENTIAL_REAUTH_REQUIRED",
      );
    }

    expect(
      testContext.db.prepare("SELECT COUNT(*) AS count FROM desktop_hosts").get(),
    ).toEqual(hostCountBefore);

    await testContext.app.close();
    testContext.db.close();
  });

  it("keeps Shiyan issuance and its error surface compatible", async () => {
    const testContext = context();
    const accounts = await createAccounts(testContext);

    for (const session of [accounts.aliceDesktop, accounts.aliceMobile]) {
      const response = await issue(testContext, session.sessionToken, {
        audience: CLOUD_SHIYAN_AUDIENCE,
      });
      expect(response.statusCode).toBe(200);
      const ticket = issuedServiceCredentialSchema.parse(response.json());
      const verified = verifyServiceCredential(ticket.token, {
        issuer: SERVICE_CREDENTIAL_ISSUER,
        audience: CLOUD_SHIYAN_AUDIENCE,
        publicKeys: trustedKeys(testContext),
      });
      expect(verified.claims).toMatchObject({
        aud: CLOUD_SHIYAN_AUDIENCE,
        scope: [SHIYAN_AUTHENTICATE_SCOPE],
      });
      expect(verified.claims).not.toHaveProperty("relay");
    }

    const malformed = await issue(testContext, accounts.aliceDesktop.sessionToken, {
      audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
    });
    expect(malformed.statusCode).toBe(400);
    expect(serviceCredentialErrorEnvelopeSchema.parse(malformed.json()).error.code).toBe(
      "SERVICE_CREDENTIAL_INVALID_REQUEST",
    );

    await testContext.app.close();
    testContext.db.close();
  });
});
