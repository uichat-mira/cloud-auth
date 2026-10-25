import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  desktopHostListResponseSchema,
  desktopHostSchema,
  hostErrorEnvelopeSchema,
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
  const dir = mkdtempSync(join(tmpdir(), "mira-host-contract-"));
  cleanup.push(dir);
  return createTestOAuthContext(join(dir, "auth.sqlite"));
}

function registerHost(
  testContext: TestOAuthContext,
  token: string,
  payload?: Record<string, unknown>,
) {
  return testContext.app.inject({
    method: "POST",
    url: "/v1/hosts",
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });
}

function listHosts(testContext: TestOAuthContext, token: string) {
  return testContext.app.inject({
    method: "GET",
    url: "/v1/hosts",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("Desktop Host directory HTTP contract", () => {
  it("registers one server-controlled Host room and discovers it only in the same account", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    await testContext.service.provisionAccount("bob", password);
    const desktopInstallation = randomUUID();
    const aliceDesktop = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      installationId: desktopInstallation,
    });
    const aliceMobile = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const bobDesktop = await createFirstPartySession(testContext, {
      username: "bob",
      password,
    });
    const bobMobile = await createFirstPartySession(testContext, {
      username: "bob",
      password,
      platform: "mobile",
    });

    for (const payload of [
      { accountId: "attacker" },
      { relayRoom: "room_chosen-by-client" },
      { platform: "desktop" },
      { role: "host" },
      { availability: "available" },
    ]) {
      const forged = await registerHost(testContext, aliceDesktop.sessionToken, payload);
      expect(forged.statusCode, JSON.stringify(payload)).toBe(400);
      expect(hostErrorEnvelopeSchema.parse(forged.json()).error.code).toBe(
        "HOST_INVALID_REQUEST",
      );
    }
    expect(testContext.db.prepare("SELECT COUNT(*) AS count FROM desktop_hosts").get()).toMatchObject({
      count: 0,
    });

    const registered = await registerHost(testContext, aliceDesktop.sessionToken);
    expect(registered.statusCode).toBe(200);
    const aliceHost = desktopHostSchema.parse(registered.json());
    expect(aliceHost).toMatchObject({
      deviceId: expect.any(String),
      availability: "available",
      registeredAt: expect.any(String),
      lastAdvertisedAt: expect.any(String),
      leaseExpiresAt: expect.any(String),
    });
    expect(aliceHost.relayRoom).toMatch(/^room_[A-Za-z0-9_-]{43}$/);
    expect(aliceHost.relayRoom).not.toContain("chosen");
    expect(registered.body).not.toContain(aliceDesktop.sessionToken);
    expect(registered.body).not.toContain(password);
    expect(registered.body).not.toContain(desktopInstallation);
    expect(registered.body).not.toContain("secret");
    expect(registered.body).not.toContain("password_hash");

    const refreshed = await registerHost(testContext, aliceDesktop.sessionToken);
    expect(refreshed.statusCode).toBe(200);
    const refreshedHost = desktopHostSchema.parse(refreshed.json());
    expect(refreshedHost).toMatchObject({
      id: aliceHost.id,
      deviceId: aliceHost.deviceId,
      relayRoom: aliceHost.relayRoom,
    });

    const aliceList = await listHosts(testContext, aliceMobile.sessionToken);
    expect(aliceList.statusCode).toBe(200);
    const aliceHosts = desktopHostListResponseSchema.parse(aliceList.json()).hosts;
    expect(aliceHosts).toEqual([refreshedHost]);
    expect(aliceList.body).not.toContain(aliceDesktop.sessionToken);
    expect(aliceList.body).not.toContain(password);

    const bobBefore = await listHosts(testContext, bobMobile.sessionToken);
    expect(bobBefore.statusCode).toBe(200);
    expect(desktopHostListResponseSchema.parse(bobBefore.json()).hosts).toEqual([]);

    const bobRegistered = await registerHost(testContext, bobDesktop.sessionToken);
    expect(bobRegistered.statusCode).toBe(200);
    const bobHost = desktopHostSchema.parse(bobRegistered.json());
    expect(bobHost.id).not.toBe(aliceHost.id);
    expect(bobHost.deviceId).not.toBe(aliceHost.deviceId);
    expect(bobHost.relayRoom).not.toBe(aliceHost.relayRoom);

    const bobList = await listHosts(testContext, bobMobile.sessionToken);
    expect(desktopHostListResponseSchema.parse(bobList.json()).hosts).toEqual([bobHost]);
    expect(bobList.body).not.toContain(aliceHost.relayRoom);

    const aliceAfter = await listHosts(testContext, aliceMobile.sessionToken);
    expect(desktopHostListResponseSchema.parse(aliceAfter.json()).hosts).toEqual([
      refreshedHost,
    ]);
    expect(aliceAfter.body).not.toContain(bobHost.relayRoom);

    const ownership = testContext.hostService.resolveRoomOwnership(aliceHost.relayRoom);
    expect(ownership).toMatchObject({
      hostId: aliceHost.id,
      accountId: aliceDesktop.account.id,
      deviceId: aliceHost.deviceId,
      availability: "available",
    });
    expect(testContext.hostService.resolveRoomOwnership(bobHost.relayRoom)).toMatchObject({
      hostId: bobHost.id,
      accountId: bobDesktop.account.id,
    });
    expect(testContext.hostService.resolveRoomOwnership("room_unknown")).toBeNull();

    await testContext.app.close();
    testContext.db.close();
  });

  it("rejects Mobile, Portal and non-OAuth Desktop sessions as Host callers", async () => {
    const testContext = context();
    await testContext.service.provisionAccount("alice", password);
    const desktopInstallation = randomUUID();
    const aliceDesktop = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      installationId: desktopInstallation,
    });
    const aliceMobile = await createFirstPartySession(testContext, {
      username: "alice",
      password,
      platform: "mobile",
    });

    for (const token of [aliceMobile.sessionToken]) {
      const response = await registerHost(testContext, token);
      expect(response.statusCode).toBe(403);
      expect(hostErrorEnvelopeSchema.parse(response.json())).toEqual({
        error: {
          code: "HOST_REGISTRATION_NOT_ALLOWED",
          message: "This Cloud Session is not an approved Mira Desktop Host",
        },
      });
    }

    for (const payload of [
      { platform: "desktop" },
      { role: "host" },
      { clientId: "mira-desktop" },
    ]) {
      const forged = await registerHost(testContext, aliceMobile.sessionToken, payload);
      expect(forged.statusCode).toBe(400);
      expect(hostErrorEnvelopeSchema.parse(forged.json()).error.code).toBe(
        "HOST_INVALID_REQUEST",
      );
    }

    // An unbound Portal/password session cannot become a Host.
    const portalSession = await testContext.service.login(
      "alice",
      password,
      "127.0.0.1",
    );
    const portalAttempt = await registerHost(testContext, portalSession.sessionToken);
    expect(portalAttempt.statusCode).toBe(403);
    expect(hostErrorEnvelopeSchema.parse(portalAttempt.json()).error.code).toBe(
      "HOST_REGISTRATION_NOT_ALLOWED",
    );

    // Nor can a password session become a Host merely by naming a desktop
    // device. The server requires persisted first-party OAuth client provenance.
    const boundPortalSession = await testContext.service.login(
      "alice",
      password,
      "127.0.0.2",
      { installationId: desktopInstallation, platform: "desktop" },
    );
    const boundPortalAttempt = await registerHost(
      testContext,
      boundPortalSession.sessionToken,
    );
    expect(boundPortalAttempt.statusCode).toBe(403);
    expect(hostErrorEnvelopeSchema.parse(boundPortalAttempt.json()).error.code).toBe(
      "HOST_REGISTRATION_NOT_ALLOWED",
    );

    expect(
      testContext.db
        .prepare(
          `SELECT c.client_id
             FROM sessions s
             JOIN oauth_authorization_codes c ON c.consumed_by_session_id = s.id
            WHERE s.id = ?`,
        )
        .get(aliceDesktop.sessionToken.split(".")[1]!),
    ).toMatchObject({ client_id: "mira-desktop" });

    expect(testContext.db.prepare("SELECT COUNT(*) AS count FROM desktop_hosts").get()).toMatchObject({
      count: 0,
    });

    const unauthenticated = await testContext.app.inject({
      method: "POST",
      url: "/v1/hosts",
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(hostErrorEnvelopeSchema.parse(unauthenticated.json()).error.code).toBe(
      "HOST_REAUTH_REQUIRED",
    );

    const unauthenticatedList = await testContext.app.inject({
      method: "GET",
      url: "/v1/hosts",
    });
    expect(unauthenticatedList.statusCode).toBe(401);
    expect(hostErrorEnvelopeSchema.parse(unauthenticatedList.json()).error.code).toBe(
      "HOST_REAUTH_REQUIRED",
    );

    await testContext.app.close();
    testContext.db.close();
  });
});
