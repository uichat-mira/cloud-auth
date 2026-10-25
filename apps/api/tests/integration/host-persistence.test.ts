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
  type TestOAuthOptions,
} from "../helpers/oauth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function databasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "mira-host-persistence-"));
  cleanup.push(dir);
  return join(dir, "auth.sqlite");
}

function createContext(path: string, options: TestOAuthOptions = {}): TestOAuthContext {
  return createTestOAuthContext(path, options);
}

async function listHosts(context: TestOAuthContext, token: string) {
  const response = await context.app.inject({
    method: "GET",
    url: "/v1/hosts",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.statusCode).toBe(200);
  return desktopHostListResponseSchema.parse(response.json()).hosts;
}

describe("Desktop Host SQLite persistence", () => {
  it("preserves the Host identity and server-controlled room across reopen", async () => {
    const path = databasePath();
    const first = createContext(path);
    await first.service.provisionAccount("alice", password);
    const desktop = await createFirstPartySession(first, {
      username: "alice",
      password,
    });
    const mobile = await createFirstPartySession(first, {
      username: "alice",
      password,
      platform: "mobile",
    });
    const host = desktopHostSchema.parse(first.hostService.register(desktop.sessionToken));
    expect(host.availability).toBe("available");
    await first.app.close();
    first.db.close();

    const second = createContext(path);
    expect(second.db.prepare("SELECT COUNT(*) AS count FROM desktop_hosts").get()).toMatchObject({
      count: 1,
    });
    const hosts = await listHosts(second, mobile.sessionToken);
    expect(hosts).toEqual([host]);
    expect(hosts[0]?.relayRoom).toBe(host.relayRoom);
    expect(second.hostService.resolveRoomOwnership(host.relayRoom)).toMatchObject({
      hostId: host.id,
      accountId: desktop.account.id,
      deviceId: host.deviceId,
      availability: "available",
    });

    await second.app.close();
    second.db.close();
  });

  it("expires stale presence, refreshes by lease, and invalidates on logout/device revoke", async () => {
    const path = databasePath();
    const clock = { value: Date.now() };
    const options: TestOAuthOptions = {
      hostLeaseSeconds: 60,
      sessionTtlSeconds: 3600,
      now: () => new Date(clock.value),
    };
    const context = createContext(path, options);
    await context.service.provisionAccount("alice", password);
    const installationId = randomUUID();
    const desktop = await createFirstPartySession(context, {
      username: "alice",
      password,
      installationId,
    });
    const mobile = await createFirstPartySession(context, {
      username: "alice",
      password,
      platform: "mobile",
    });

    const host = desktopHostSchema.parse(context.hostService.register(desktop.sessionToken));
    expect(host.availability).toBe("available");

    clock.value += 61_000;
    const stale = await listHosts(context, mobile.sessionToken);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ id: host.id, availability: "offline" });
    expect(context.hostService.resolveRoomOwnership(host.relayRoom)).toMatchObject({
      hostId: host.id,
      availability: "offline",
    });

    const refreshed = desktopHostSchema.parse(
      context.hostService.register(desktop.sessionToken),
    );
    expect(refreshed).toMatchObject({
      id: host.id,
      relayRoom: host.relayRoom,
      availability: "available",
    });

    const logout = await context.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${desktop.sessionToken}` },
    });
    expect(logout.statusCode).toBe(204);

    expect(await listHosts(context, mobile.sessionToken)).toEqual([]);
    expect(context.hostService.resolveRoomOwnership(host.relayRoom)).toBeNull();

    const relogin = await createFirstPartySession(context, {
      username: "alice",
      password,
      installationId,
    });
    const reRegistered = desktopHostSchema.parse(
      context.hostService.register(relogin.sessionToken),
    );
    expect(reRegistered.id).toBe(host.id);
    expect(reRegistered.availability).toBe("available");
    expect(reRegistered.relayRoom).not.toBe(host.relayRoom);
    expect(context.hostService.resolveRoomOwnership(host.relayRoom)).toBeNull();
    expect(context.hostService.resolveRoomOwnership(reRegistered.relayRoom)).toMatchObject({
      hostId: host.id,
      availability: "available",
    });

    const revoke = await context.app.inject({
      method: "DELETE",
      url: `/v1/devices/${reRegistered.deviceId}`,
      headers: { authorization: `Bearer ${mobile.sessionToken}` },
    });
    expect(revoke.statusCode).toBe(200);

    expect(await listHosts(context, mobile.sessionToken)).toEqual([]);
    expect(context.hostService.resolveRoomOwnership(reRegistered.relayRoom)).toBeNull();
    expect(
      context.db
        .prepare("SELECT revoked_at, revoke_reason FROM desktop_hosts WHERE id = ?")
        .get(host.id),
    ).toMatchObject({
      revoked_at: expect.any(String),
      revoke_reason: "host_device_revoked",
    });

    const rejected = await context.app.inject({
      method: "POST",
      url: "/v1/hosts",
      headers: { authorization: `Bearer ${relogin.sessionToken}` },
    });
    expect(rejected.statusCode).toBe(401);
    expect(hostErrorEnvelopeSchema.parse(rejected.json()).error.code).toBe(
      "HOST_REAUTH_REQUIRED",
    );

    await context.app.close();
    context.db.close();
  });

  it("keeps one Host row and room when two Desktop sessions register the same device", async () => {
    const path = databasePath();
    const clock = { value: Date.now() };
    const options: TestOAuthOptions = {
      sessionTtlSeconds: 3600,
      now: () => new Date(clock.value),
    };
    const first = createContext(path, options);
    const second = createContext(path, options);
    await first.service.provisionAccount("alice", password);
    const installationId = randomUUID();
    const sessionA = await createFirstPartySession(first, {
      username: "alice",
      password,
      installationId,
    });
    const sessionB = await createFirstPartySession(second, {
      username: "alice",
      password,
      installationId,
    });
    expect(sessionA.account.id).toBe(sessionB.account.id);

    const [a, b] = await Promise.all([
      Promise.resolve().then(() => first.hostService.register(sessionA.sessionToken)),
      Promise.resolve().then(() => second.hostService.register(sessionB.sessionToken)),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.deviceId).toBe(b.deviceId);
    expect(a.relayRoom).toBe(b.relayRoom);
    expect(
      first.db.prepare("SELECT COUNT(*) AS count FROM desktop_hosts").get(),
    ).toMatchObject({ count: 1 });

    const owner = first.db
      .prepare("SELECT session_id FROM desktop_hosts WHERE id = ?")
      .get(a.id) as { session_id: string };
    expect(owner.session_id).toBe(sessionB.sessionToken.split(".")[1]);

    // Logging out the superseded session does not withdraw the Host that the
    // newer session currently owns.
    first.service.logout(sessionA.sessionToken);
    expect(first.hostService.resolveRoomOwnership(a.relayRoom)).toMatchObject({
      hostId: a.id,
      availability: "available",
    });
    second.service.logout(sessionB.sessionToken);
    expect(first.hostService.resolveRoomOwnership(a.relayRoom)).toBeNull();

    await first.app.close();
    first.db.close();
    await second.app.close();
    second.db.close();
  });
});
