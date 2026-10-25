import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  hostGrantErrorEnvelopeSchema,
  hostGrantPolicyResponseSchema,
  hostGrantSnapshotSchema,
  hostMobileGrantMutationResponseSchema,
  hostMobileGrantSchema,
} from "@uichat-mira/cloud-auth-contracts";
import {
  createFirstPartySession,
  createTestOAuthContext,
  type TestOAuthContext,
} from "../helpers/oauth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function context(): TestOAuthContext {
  const dir = mkdtempSync(join(tmpdir(), "mira-host-grant-contract-"));
  cleanup.push(dir);
  return createTestOAuthContext(join(dir, "auth.sqlite"));
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function registerHost(testContext: TestOAuthContext, token: string) {
  const response = await testContext.app.inject({
    method: "POST",
    url: "/v1/hosts",
    headers: auth(token),
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { id: string; deviceId: string };
}

function setPolicy(
  testContext: TestOAuthContext,
  token: string,
  hostId: string,
  payload: Record<string, unknown>,
) {
  return testContext.app.inject({
    method: "PUT",
    url: `/v1/hosts/${hostId}/grant-policy`,
    headers: auth(token),
    payload,
  });
}

function getSnapshot(testContext: TestOAuthContext, token: string, hostId: string) {
  return testContext.app.inject({
    method: "GET",
    url: `/v1/hosts/${hostId}/grants`,
    headers: auth(token),
  });
}

function getMobileGrant(testContext: TestOAuthContext, token: string, hostId: string) {
  return testContext.app.inject({
    method: "GET",
    url: `/v1/hosts/${hostId}/grant`,
    headers: auth(token),
  });
}

function patchGrant(
  testContext: TestOAuthContext,
  token: string,
  hostId: string,
  mobileDeviceId: string,
  payload: Record<string, unknown>,
) {
  return testContext.app.inject({
    method: "PATCH",
    url: `/v1/hosts/${hostId}/grants/${mobileDeviceId}`,
    headers: auth(token),
    payload,
  });
}

function deleteGrant(
  testContext: TestOAuthContext,
  token: string,
  hostId: string,
  mobileDeviceId: string,
  expectedRevision: number,
) {
  return testContext.app.inject({
    method: "DELETE",
    url: `/v1/hosts/${hostId}/grants/${mobileDeviceId}?expectedRevision=${expectedRevision}`,
    headers: auth(token),
  });
}

function sessionDeviceId(testContext: TestOAuthContext, token: string): string {
  const sessionId = token.split(".")[1]!;
  const row = testContext.db
    .prepare("SELECT device_id FROM sessions WHERE id = ?")
    .get(sessionId) as { device_id: string };
  return row.device_id;
}

describe("Host grant HTTP contract", () => {
  it("lets the owning Desktop set a ceiling that current and later Mobiles inherit", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    await testContext.service.provisionAccount("bob", password);
    const installationId = randomUUID();
    const desktop = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      installationId,
    });
    const firstMobile = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const bobDesktop = await createFirstPartySession(testContext, {
      username: "bob",
      password,
    });
    const host = await registerHost(testContext, desktop.sessionToken);
    const bobHost = await registerHost(testContext, bobDesktop.sessionToken);

    const unconfigured = hostGrantSnapshotSchema.parse(
      (await getSnapshot(testContext, desktop.sessionToken, host.id)).json(),
    );
    expect(unconfigured).toMatchObject({
      policyConfigured: false,
      policyScopes: [],
      revision: 0,
      grants: [],
    });
    expect(
      (await getMobileGrant(testContext, firstMobile.sessionToken, host.id)).statusCode,
    ).toBe(404);

    expect(
      (await setPolicy(testContext, desktop.sessionToken, bobHost.id, {
        expectedRevision: 0,
        scopes: ["tools:read"],
      })).statusCode,
    ).toBe(404);

    for (const payload of [
      { expectedRevision: 0, scopes: ["relay:transport"] },
      { expectedRevision: 0, scopes: ["tools:*"] },
      { expectedRevision: 0, scopes: ["tools:read"], accountId: "forged" },
      { expectedRevision: -1, scopes: [] },
    ]) {
      const response = await setPolicy(testContext, desktop.sessionToken, host.id, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }

    const policy = await setPolicy(testContext, desktop.sessionToken, host.id, {
      expectedRevision: 0,
      scopes: ["tools:invoke", "threads:read", "tools:invoke"],
    });
    expect(policy.statusCode).toBe(200);
    const created = hostGrantPolicyResponseSchema.parse(policy.json());
    expect(created).toMatchObject({
      hostId: host.id,
      accountId: desktop.account.id,
      revision: 1,
      scopes: ["threads:read", "tools:invoke"],
    });
    expect(policy.body).not.toContain(desktop.sessionToken);
    expect(policy.body).not.toContain(password);

    const firstSnapshotResponse = await getSnapshot(
      testContext,
      desktop.sessionToken,
      host.id,
    );
    expect(firstSnapshotResponse.statusCode).toBe(200);
    const firstSnapshot = hostGrantSnapshotSchema.parse(firstSnapshotResponse.json());
    expect(firstSnapshot).toMatchObject({
      hostId: host.id,
      accountId: desktop.account.id,
      policyConfigured: true,
      policyScopes: ["threads:read", "tools:invoke"],
      revision: 1,
      maxStalenessSeconds: 300,
      grants: [
        {
          mobileDeviceId: sessionDeviceId(testContext, firstMobile.sessionToken),
          scopes: ["threads:read", "tools:invoke"],
          status: "active",
        },
      ],
    });
    expect(Date.parse(firstSnapshot.validUntil)).toBeGreaterThan(
      Date.parse(firstSnapshot.issuedAt),
    );
    for (const secret of [
      desktop.sessionToken,
      firstMobile.sessionToken,
      password,
      installationId,
      "password_hash",
      "secret",
      "relay_room",
    ]) {
      expect(firstSnapshotResponse.body).not.toContain(secret);
    }

    const laterMobile = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const refreshed = hostGrantSnapshotSchema.parse(
      (await getSnapshot(testContext, desktop.sessionToken, host.id)).json(),
    );
    expect(refreshed.revision).toBe(2);
    expect(refreshed.grants).toEqual(
      expect.arrayContaining([
        {
          mobileDeviceId: sessionDeviceId(testContext, firstMobile.sessionToken),
          scopes: ["threads:read", "tools:invoke"],
          status: "active",
        },
        {
          mobileDeviceId: sessionDeviceId(testContext, laterMobile.sessionToken),
          scopes: ["threads:read", "tools:invoke"],
          status: "active",
        },
      ]),
    );

    const ownGrant = hostMobileGrantSchema.parse(
      (
        await getMobileGrant(testContext, laterMobile.sessionToken, host.id)
      ).json(),
    );
    expect(ownGrant).toEqual({
      hostId: host.id,
      accountId: desktop.account.id,
      mobileDeviceId: sessionDeviceId(testContext, laterMobile.sessionToken),
      revision: 2,
      scopes: ["threads:read", "tools:invoke"],
      issuedAt: expect.any(String),
      validUntil: expect.any(String),
      maxStalenessSeconds: 300,
    });

    // A Mobile may read only its own grant; the Host-wide ledger exposes
    // sibling device IDs and is reserved for Desktop / account Portal.
    const deniedFullSnapshot = await getSnapshot(
      testContext,
      laterMobile.sessionToken,
      host.id,
    );
    expect(deniedFullSnapshot.statusCode).toBe(403);
    expect(hostGrantErrorEnvelopeSchema.parse(deniedFullSnapshot.json()).error.code)
      .toBe("HOST_GRANT_NOT_ALLOWED");

    // A Desktop device row or a Portal/account session cannot mint the ceiling.
    const portal = await testContext.service.login("alice", password, "127.0.0.1");
    const portalSnapshot = hostGrantSnapshotSchema.parse(
      (await getSnapshot(testContext, portal.sessionToken, host.id)).json(),
    );
    expect(portalSnapshot.grants).toHaveLength(2);
    expect(
      (await setPolicy(testContext, firstMobile.sessionToken, host.id, {
        expectedRevision: 2,
        scopes: ["tools:read"],
      })).statusCode,
    ).toBe(404);
    expect(
      (await setPolicy(testContext, portal.sessionToken, host.id, {
        expectedRevision: 2,
        scopes: ["tools:read"],
      })).statusCode,
    ).toBe(404);

    // Cross-account reads and Mobile self-grants fail closed.
    expect(
      (await getSnapshot(testContext, bobDesktop.sessionToken, host.id)).statusCode,
    ).toBe(404);
    expect(
      (await getMobileGrant(testContext, firstMobile.sessionToken, bobHost.id)).statusCode,
    ).toBe(404);

    await testContext.app.close();
    testContext.db.close();
  });

  it("only narrows or revokes from an account session and rejects stale revisions", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    await testContext.service.provisionAccount("bob", password);
    const desktop = await createFirstPartySession(testContext, {
      username: "alice",
      password,
    });
    const mobile = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const bobMobile = await createFirstPartySession(testContext, {
      username: "bob",
      password,
      platform: "mobile",
    });
    const host = await registerHost(testContext, desktop.sessionToken);
    const mobileDeviceId = sessionDeviceId(testContext, mobile.sessionToken);

    expect(
      (
        await setPolicy(testContext, desktop.sessionToken, host.id, {
          expectedRevision: 0,
          scopes: ["threads:read", "tools:read", "tools:invoke"],
        })
      ).statusCode,
    ).toBe(200);

    const portal = await testContext.service.login("alice", password, "127.0.0.1");
    const narrowed = await patchGrant(
      testContext,
      portal.sessionToken,
      host.id,
      mobileDeviceId,
      { expectedRevision: 1, scopes: ["tools:read"] },
    );
    expect(narrowed.statusCode).toBe(200);
    expect(hostMobileGrantMutationResponseSchema.parse(narrowed.json())).toMatchObject({
      hostId: host.id,
      mobileDeviceId,
      revision: 2,
      scopes: ["tools:read"],
      status: "active",
    });

    expect(
      hostMobileGrantSchema.parse(
        (await getMobileGrant(testContext, mobile.sessionToken, host.id)).json(),
      ).scopes,
    ).toEqual(["tools:read"]);

    for (const payload of [
      { expectedRevision: 2, scopes: ["relay:transport"] },
      { expectedRevision: 2, scopes: ["tools:read"], mobileDeviceId: "forged" },
    ]) {
      const response = await patchGrant(
        testContext,
        portal.sessionToken,
        host.id,
        mobileDeviceId,
        payload,
      );
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }

    const widened = await patchGrant(
      testContext,
      portal.sessionToken,
      host.id,
      mobileDeviceId,
      { expectedRevision: 2, scopes: ["tools:read", "tools:invoke"] },
    );
    expect(widened.statusCode).toBe(403);
    expect(hostGrantErrorEnvelopeSchema.parse(widened.json()).error.code).toBe(
      "HOST_GRANT_NOT_ALLOWED",
    );

    const stale = await patchGrant(
      testContext,
      portal.sessionToken,
      host.id,
      mobileDeviceId,
      { expectedRevision: 1, scopes: ["threads:read"] },
    );
    expect(stale.statusCode).toBe(409);
    expect(hostGrantErrorEnvelopeSchema.parse(stale.json()).error.code).toBe(
      "HOST_GRANT_STALE_REVISION",
    );

    const foreignMobile = await patchGrant(
      testContext,
      portal.sessionToken,
      host.id,
      sessionDeviceId(testContext, bobMobile.sessionToken),
      { expectedRevision: 2, scopes: [] },
    );
    expect(foreignMobile.statusCode).toBe(404);

    const revoked = await deleteGrant(
      testContext,
      portal.sessionToken,
      host.id,
      mobileDeviceId,
      2,
    );
    expect(revoked.statusCode).toBe(200);
    expect(hostMobileGrantMutationResponseSchema.parse(revoked.json())).toMatchObject({
      revision: 3,
      scopes: [],
      status: "revoked",
    });

    const snapshot = hostGrantSnapshotSchema.parse(
      (await getSnapshot(testContext, portal.sessionToken, host.id)).json(),
    );
    expect(snapshot.revision).toBe(3);
    expect(snapshot.grants).toEqual([
      { mobileDeviceId, scopes: [], status: "revoked" },
    ]);

    expect(
      (await getMobileGrant(testContext, mobile.sessionToken, host.id)).statusCode,
    ).toBe(404);

    expect(
      (
        await patchGrant(testContext, portal.sessionToken, host.id, mobileDeviceId, {
          expectedRevision: 3,
          scopes: ["tools:read"],
        })
      ).statusCode,
    ).toBe(403);

    const staleDelete = await deleteGrant(
      testContext,
      portal.sessionToken,
      host.id,
      mobileDeviceId,
      2,
    );
    expect(staleDelete.statusCode).toBe(409);

    await testContext.app.close();
    testContext.db.close();
  });

  it("fails closed for anonymous and malformed callers without leaking another account", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const desktop = await createFirstPartySession(testContext, {
      username: "alice",
      password,
    });
    const host = await registerHost(testContext, desktop.sessionToken);

    const anonymous = await testContext.app.inject({
      method: "GET",
      url: `/v1/hosts/${host.id}/grants`,
    });
    expect(anonymous.statusCode).toBe(401);
    expect(hostGrantErrorEnvelopeSchema.parse(anonymous.json()).error.code).toBe(
      "HOST_GRANT_REAUTH_REQUIRED",
    );

    const unknown = await getSnapshot(testContext, desktop.sessionToken, randomUUID());
    expect(unknown.statusCode).toBe(404);

    const invalid = await testContext.app.inject({
      method: "DELETE",
      url: `/v1/hosts/${host.id}/grants/${randomUUID()}?expectedRevision=soon`,
      headers: auth(desktop.sessionToken),
    });
    expect(invalid.statusCode).toBe(400);

    await testContext.app.close();
    testContext.db.close();
  });
});
