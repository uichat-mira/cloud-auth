import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  hostGrantErrorEnvelopeSchema,
  hostGrantSnapshotSchema,
  hostMobileGrantSchema,
} from "@uichat-mira/cloud-auth-contracts";
import {
  createFirstPartySession,
  createTestOAuthContext,
  type TestOAuthContext,
  type TestOAuthOptions,
} from "../helpers/oauth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function databasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "mira-host-grant-persistence-"));
  cleanup.push(dir);
  return join(dir, "auth.sqlite");
}

function context(path: string, options: TestOAuthOptions = {}): TestOAuthContext {
  return createTestOAuthContext(path, options);
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
  expectedRevision: number,
  scopes: string[],
) {
  return testContext.app.inject({
    method: "PUT",
    url: `/v1/hosts/${hostId}/grant-policy`,
    headers: auth(token),
    payload: { expectedRevision, scopes },
  });
}

function snapshot(testContext: TestOAuthContext, token: string, hostId: string) {
  return testContext.app.inject({
    method: "GET",
    url: `/v1/hosts/${hostId}/grants`,
    headers: auth(token),
  });
}

function mobileGrant(testContext: TestOAuthContext, token: string, hostId: string) {
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
  expectedRevision: number,
  scopes: string[],
) {
  return testContext.app.inject({
    method: "PATCH",
    url: `/v1/hosts/${hostId}/grants/${mobileDeviceId}`,
    headers: auth(token),
    payload: { expectedRevision, scopes },
  });
}

function sessionDeviceId(testContext: TestOAuthContext, token: string): string {
  const sessionId = token.split(".")[1]!;
  const row = testContext.db
    .prepare("SELECT device_id FROM sessions WHERE id = ?")
    .get(sessionId) as { device_id: string };
  return row.device_id;
}

describe("Host grant SQLite persistence", () => {
  it("preserves policy, revision and bounded validity across reopen", async () => {
    const path = databasePath();
    const clock = { value: Date.parse("2026-10-25T12:00:00.000Z") };
    const options: TestOAuthOptions = {
      hostGrantSnapshotTtlSeconds: 60,
      sessionTtlSeconds: 3600,
      now: () => new Date(clock.value),
    };
    const first = context(path, options);
    await first.service.provisionAccount("alice", password);
    const desktop = await createFirstPartySession(first, { username: "alice", password });
    const mobile = await createFirstPartySession(first, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const host = await registerHost(first, desktop.sessionToken);

    expect(
      (await setPolicy(first, desktop.sessionToken, host.id, 0, [
        "threads:read",
        "tools:read",
      ])).statusCode,
    ).toBe(200);
    const before = hostGrantSnapshotSchema.parse(
      (await snapshot(first, desktop.sessionToken, host.id)).json(),
    );
    expect(before).toMatchObject({
      revision: 1,
      policyScopes: ["threads:read", "tools:read"],
      maxStalenessSeconds: 60,
    });
    expect(before.validUntil).toBe("2026-10-25T12:01:00.000Z");
    await first.app.close();
    first.db.close();

    const second = context(path, options);
    const reopened = hostGrantSnapshotSchema.parse(
      (await snapshot(second, desktop.sessionToken, host.id)).json(),
    );
    expect(reopened).toMatchObject({
      hostId: host.id,
      policyConfigured: true,
      policyScopes: ["threads:read", "tools:read"],
      revision: 1,
      grants: [
        {
          mobileDeviceId: sessionDeviceId(second, mobile.sessionToken),
          scopes: ["threads:read", "tools:read"],
          status: "active",
        },
      ],
    });

    clock.value += 61_000;
    expect(Date.parse(reopened.validUntil)).toBeLessThanOrEqual(clock.value);
    const refreshed = hostGrantSnapshotSchema.parse(
      (await snapshot(second, desktop.sessionToken, host.id)).json(),
    );
    expect(Date.parse(refreshed.issuedAt)).toBe(clock.value);
    expect(Date.parse(refreshed.validUntil)).toBeGreaterThan(clock.value);

    await second.app.close();
    second.db.close();
  });

  it("derives later Mobile eligibility and folds device revocation into revision", async () => {
    const path = databasePath();
    const first = context(path);
    await first.service.provisionAccount("alice", password);
    const desktop = await createFirstPartySession(first, { username: "alice", password });
    const firstMobile = await createFirstPartySession(first, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const host = await registerHost(first, desktop.sessionToken);

    await setPolicy(first, desktop.sessionToken, host.id, 0, [
      "threads:read",
      "messages:read",
      "tools:invoke",
    ]);
    const laterMobile = await createFirstPartySession(first, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const laterMobileId = sessionDeviceId(first, laterMobile.sessionToken);

    const joined = hostGrantSnapshotSchema.parse(
      (await snapshot(first, desktop.sessionToken, host.id)).json(),
    );
    expect(joined.revision).toBe(2);
    expect(joined.grants).toHaveLength(2);
    expect(joined.grants).toContainEqual({
      mobileDeviceId: laterMobileId,
      scopes: ["threads:read", "messages:read", "tools:invoke"],
      status: "active",
    });

    const revoked = await first.app.inject({
      method: "DELETE",
      url: `/v1/devices/${laterMobileId}`,
      headers: auth(firstMobile.sessionToken),
    });
    expect(revoked.statusCode).toBe(200);

    const afterRevoke = hostGrantSnapshotSchema.parse(
      (await snapshot(first, desktop.sessionToken, host.id)).json(),
    );
    expect(afterRevoke.revision).toBe(3);
    expect(afterRevoke.grants).toEqual([
      {
        mobileDeviceId: sessionDeviceId(first, firstMobile.sessionToken),
        scopes: ["threads:read", "messages:read", "tools:invoke"],
        status: "active",
      },
    ]);
    const revokedMobileGrant = await mobileGrant(
      first,
      laterMobile.sessionToken,
      host.id,
    );
    expect(revokedMobileGrant.statusCode).toBe(401);
    await first.app.close();
    first.db.close();

    const reopened = context(path);
    const persisted = hostGrantSnapshotSchema.parse(
      (await snapshot(reopened, desktop.sessionToken, host.id)).json(),
    );
    expect(persisted.revision).toBe(3);
    expect(persisted.grants.map((grant) => grant.mobileDeviceId)).not.toContain(
      laterMobileId,
    );
    await reopened.app.close();
    reopened.db.close();
  });

  it("rejects stale writers across connections and intersects a lowered ceiling", async () => {
    const path = databasePath();
    const first = context(path);
    const second = context(path);
    await first.service.provisionAccount("alice", password);
    const desktop = await createFirstPartySession(first, { username: "alice", password });
    const mobile = await createFirstPartySession(first, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const mobileId = sessionDeviceId(first, mobile.sessionToken);
    const host = await registerHost(first, desktop.sessionToken);

    await setPolicy(first, desktop.sessionToken, host.id, 0, [
      "threads:read",
      "tools:read",
      "tools:invoke",
    ]);
    expect(
      (
        await patchGrant(second, desktop.sessionToken, host.id, mobileId, 1, [
          "tools:invoke",
        ])
      ).statusCode,
    ).toBe(200);

    const stale = await patchGrant(
      second,
      desktop.sessionToken,
      host.id,
      mobileId,
      1,
      ["threads:read"],
    );
    expect(stale.statusCode).toBe(409);
    expect(hostGrantErrorEnvelopeSchema.parse(stale.json()).error.code).toBe(
      "HOST_GRANT_STALE_REVISION",
    );

    const lowered = await setPolicy(first, desktop.sessionToken, host.id, 2, [
      "tools:read",
    ]);
    expect(lowered.statusCode).toBe(200);
    const snapshotAfterLowering = hostGrantSnapshotSchema.parse(
      (await snapshot(second, desktop.sessionToken, host.id)).json(),
    );
    expect(snapshotAfterLowering.revision).toBe(3);
    expect(snapshotAfterLowering.grants).toEqual([
      { mobileDeviceId: mobileId, scopes: [], status: "active" },
    ]);
    expect(
      hostMobileGrantSchema.parse(
        (await mobileGrant(second, mobile.sessionToken, host.id)).json(),
      ).scopes,
    ).toEqual([]);

    const losingConcurrentWrite = await setPolicy(
      second,
      desktop.sessionToken,
      host.id,
      2,
      ["threads:read"],
    );
    expect(losingConcurrentWrite.statusCode).toBe(409);

    await first.app.close();
    first.db.close();
    await second.app.close();
    second.db.close();
  });

  it("rejects fresh account and Mobile grants if the owning Host Session expires or is revoked", async () => {
    const testContext = context(databasePath());
    await testContext.service.provisionAccount("alice", password);
    const desktop = await createFirstPartySession(testContext, {
      username: "alice",
      password,
    });
    const mobile = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const host = await registerHost(testContext, desktop.sessionToken);
    expect(
      (await setPolicy(testContext, desktop.sessionToken, host.id, 0, ["tools:invoke"]))
        .statusCode,
    ).toBe(200);
    const portal = await testContext.service.login("alice", password, "127.0.0.1");
    expect((await snapshot(testContext, portal.sessionToken, host.id)).statusCode).toBe(200);
    expect((await mobileGrant(testContext, mobile.sessionToken, host.id)).statusCode).toBe(200);

    const desktopSessionId = desktop.sessionToken.split(".")[1]!;
    const original = testContext.db
      .prepare("SELECT expires_at FROM sessions WHERE id = ?")
      .get(desktopSessionId) as { expires_at: string };

    // The Portal and Mobile Sessions remain active. Only the Host-owning
    // Desktop Session expires, without any stored revoked_at marker.
    testContext.db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      desktopSessionId,
    );

    for (const response of [
      await snapshot(testContext, portal.sessionToken, host.id),
      await mobileGrant(testContext, mobile.sessionToken, host.id),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(hostGrantErrorEnvelopeSchema.parse(response.json()).error.code).toBe(
        "HOST_GRANT_NOT_FOUND",
      );
    }

    // A still-authorized account owner must be able to narrow and revoke
    // durable permissions remotely without the Desktop signing in again.
    const mobileDeviceId = sessionDeviceId(testContext, mobile.sessionToken);
    const narrowed = await patchGrant(
      testContext,
      portal.sessionToken,
      host.id,
      mobileDeviceId,
      1,
      [],
    );
    expect(narrowed.statusCode).toBe(200);
    expect(narrowed.json()).toMatchObject({ revision: 2, scopes: [], status: "active" });
    expect((await snapshot(testContext, portal.sessionToken, host.id)).statusCode).toBe(404);

    const revoked = await testContext.app.inject({
      method: "DELETE",
      url: `/v1/hosts/${host.id}/grants/${mobileDeviceId}?expectedRevision=2`,
      headers: auth(portal.sessionToken),
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({ revision: 3, scopes: [], status: "revoked" });

    // An explicit revoke has the same fail-closed snapshot effect, even if the
    // original expiry time is restored in storage.
    testContext.db
      .prepare("UPDATE sessions SET expires_at = ?, revoked_at = ? WHERE id = ?")
      .run(original.expires_at, new Date().toISOString(), desktopSessionId);
    expect((await snapshot(testContext, portal.sessionToken, host.id)).statusCode).toBe(404);
    expect((await mobileGrant(testContext, mobile.sessionToken, host.id)).statusCode).toBe(404);

    await testContext.app.close();
    testContext.db.close();
  });

  it("invalidates future authority on session, Host and account-session revocation", async () => {
    const path = databasePath();
    const testContext = context(path);
    await testContext.service.provisionAccount("alice", password);
    const installationId = randomUUID();
    const desktop = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      installationId,
    });
    const mobile = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const host = await registerHost(testContext, desktop.sessionToken);
    await setPolicy(testContext, desktop.sessionToken, host.id, 0, ["tools:read"]);
    const portal = await testContext.service.login("alice", password, "127.0.0.1");

    const logoutPortal = await testContext.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: auth(portal.sessionToken),
    });
    expect(logoutPortal.statusCode).toBe(204);
    expect(
      (
        await patchGrant(
          testContext,
          portal.sessionToken,
          host.id,
          sessionDeviceId(testContext, mobile.sessionToken),
          1,
          [],
        )
      ).statusCode,
    ).toBe(401);

    const logoutDesktop = await testContext.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: auth(desktop.sessionToken),
    });
    expect(logoutDesktop.statusCode).toBe(204);
    expect(
      (await snapshot(testContext, desktop.sessionToken, host.id)).statusCode,
    ).toBe(401);

    const relogin = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      installationId,
    });
    const reRegistered = await registerHost(testContext, relogin.sessionToken);
    expect(reRegistered.id).toBe(host.id);
    const afterRelogin = hostGrantSnapshotSchema.parse(
      (await snapshot(testContext, relogin.sessionToken, host.id)).json(),
    );
    expect(afterRelogin.revision).toBe(1);
    expect(afterRelogin.grants).toHaveLength(1);

    const secondPortal = await testContext.service.login("alice", password, "127.0.0.2");
    const revokeHost = await testContext.app.inject({
      method: "DELETE",
      url: `/v1/devices/${reRegistered.deviceId}`,
      headers: auth(secondPortal.sessionToken),
    });
    expect(revokeHost.statusCode).toBe(200);

    expect(
      (await snapshot(testContext, secondPortal.sessionToken, host.id)).statusCode,
    ).toBe(404);
    expect(
      (await mobileGrant(testContext, mobile.sessionToken, host.id)).statusCode,
    ).toBe(404);
    const hostReregister = await testContext.app.inject({
      method: "POST",
      url: "/v1/hosts",
      headers: auth(relogin.sessionToken),
    });
    expect(hostReregister.statusCode).toBe(401);

    await testContext.app.close();
    testContext.db.close();
  });
});
