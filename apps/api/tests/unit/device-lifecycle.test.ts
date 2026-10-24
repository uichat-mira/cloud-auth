import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthError } from "../../src/auth/auth-service.js";
import { DeviceError } from "../../src/devices/device-service.js";
import { issueSessionToken, parseSessionToken } from "../../src/security/session-token.js";
import { createTestAuth, type TestAuthContext } from "../helpers/auth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function createContext(): TestAuthContext {
  const dir = mkdtempSync(join(tmpdir(), "mira-device-lifecycle-"));
  cleanup.push(dir);
  return createTestAuth(join(dir, "auth.sqlite"));
}

describe("Mira Device lifecycle model", () => {
  it("keeps one canonical device per installation and isolates account ownership", async () => {
    const context = createContext();
    await context.service.provisionAccount("alice", password);
    await context.service.provisionAccount("bob", password);
    const alice = await context.service.login("alice", password, "127.0.0.1");
    const bob = await context.service.login("bob", password, "127.0.0.2");

    const desktopInstallation = randomUUID();
    const mobileInstallation = randomUUID();

    const aliceDesktop = context.deviceService.register(alice.sessionToken, {
      installationId: desktopInstallation,
      platform: "desktop",
      clientName: "Mira Desktop",
      clientVersion: "1.0.0",
    });
    expect(aliceDesktop.id).toBeTruthy();
    expect(aliceDesktop).not.toHaveProperty("installationId");
    expect(aliceDesktop).not.toHaveProperty("accountId");
    expect(aliceDesktop.revokedAt).toBeNull();

    const aliceDesktopAgain = context.deviceService.register(alice.sessionToken, {
      installationId: desktopInstallation.toUpperCase(),
      platform: "desktop",
      clientName: "Mira Desktop",
      clientVersion: "1.0.1",
    });
    expect(aliceDesktopAgain.id).toBe(aliceDesktop.id);
    expect(aliceDesktopAgain.createdAt).toBe(aliceDesktop.createdAt);
    expect(aliceDesktopAgain.clientVersion).toBe("1.0.1");

    expect(() =>
      context.deviceService.register(alice.sessionToken, {
        installationId: desktopInstallation,
        platform: "mobile",
        clientName: "Mira Mobile",
        clientVersion: "99.0.0",
      }),
    ).toThrowError(DeviceError);
    try {
      context.deviceService.register(alice.sessionToken, {
        installationId: desktopInstallation,
        platform: "mobile",
      });
      throw new Error("Expected conflicting platform to be rejected");
    } catch (error) {
      expect(error).toMatchObject({ code: "DEVICE_PLATFORM_MISMATCH", statusCode: 409 });
    }
    expect(
      context.deviceService.list(alice.sessionToken).find((device) => device.id === aliceDesktop.id),
    ).toEqual(aliceDesktopAgain);

    const aliceMobile = context.deviceService.register(alice.sessionToken, {
      installationId: mobileInstallation,
      platform: "mobile",
    });
    expect(aliceMobile.id).not.toBe(aliceDesktop.id);

    const bobDesktop = context.deviceService.register(bob.sessionToken, {
      installationId: desktopInstallation,
      platform: "desktop",
    });
    expect(bobDesktop.id).not.toBe(aliceDesktop.id);

    expect(context.deviceService.list(alice.sessionToken).map((device) => device.id).sort()).toEqual(
      [aliceDesktop.id, aliceMobile.id].sort(),
    );
    expect(context.deviceService.list(bob.sessionToken).map((device) => device.id)).toEqual([
      bobDesktop.id,
    ]);

    expect(
      context.db.prepare("SELECT COUNT(*) AS count FROM devices").get(),
    ).toMatchObject({ count: 3 });
    expect(
      context.db
        .prepare(
          `SELECT COUNT(*) AS count
             FROM devices d
             JOIN accounts a ON a.id = d.account_id
            WHERE a.username_normalized = 'alice'`,
        )
        .get(),
    ).toMatchObject({ count: 2 });

    context.db.close();
  });

  it("refuses to reactivate a revoked installation from a different valid session", async () => {
    const context = createContext();
    await context.service.provisionAccount("revoked", password);
    const session = await context.service.login("revoked", password, "127.0.0.1");
    const installationId = randomUUID();
    const device = context.deviceService.register(session.sessionToken, {
      installationId,
      platform: "mobile",
      clientName: "Mira Mobile",
      clientVersion: "2.0.0",
    });

    context.db
      .prepare(
        "UPDATE devices SET revoked_at = ?, revoke_reason = ?, last_seen_at = ? WHERE id = ?",
      )
      .run("2026-10-24T08:00:00.000Z", "user_revoked", "2026-10-24T08:00:00.000Z", device.id);

    expect(() => context.service.getSession(session.sessionToken)).toThrowError(AuthError);

    const freshSession = await context.service.login("revoked", password, "127.0.0.2");
    expect(() =>
      context.deviceService.register(freshSession.sessionToken, {
        installationId,
        platform: "mobile",
        clientName: "Mira Mobile",
        clientVersion: "2.0.1",
      }),
    ).toThrowError(DeviceError);

    try {
      context.deviceService.register(freshSession.sessionToken, {
        installationId,
        platform: "mobile",
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "DEVICE_REVOKED", statusCode: 409 });
    }

    const row = context.db
      .prepare(
        "SELECT client_version, last_seen_at, revoked_at, revoke_reason FROM devices WHERE id = ?",
      )
      .get(device.id) as {
      client_version: string | null;
      last_seen_at: string;
      revoked_at: string | null;
      revoke_reason: string | null;
    };
    expect(row).toEqual({
      client_version: "2.0.0",
      last_seen_at: "2026-10-24T08:00:00.000Z",
      revoked_at: "2026-10-24T08:00:00.000Z",
      revoke_reason: "user_revoked",
    });

    context.db.close();
  });

  it("reserves a nullable public key without hardware identifier fields", () => {
    const context = createContext();
    const columns = context.db.prepare("PRAGMA table_info(devices)").all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;

    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "account_id",
      "installation_id",
      "platform",
      "client_name",
      "client_version",
      "public_key",
      "created_at",
      "last_seen_at",
      "revoked_at",
      "revoke_reason",
    ]);
    const publicKey = columns.find((column) => column.name === "public_key");
    expect(publicKey).toMatchObject({ notnull: 0, dflt_value: null });
    expect(columns.some((column) => /imei|mac|serial|fingerprint|hardware/i.test(column.name))).toBe(
      false,
    );

    context.db.close();
  });

  it("requires an accepted Cloud Session for device registration and listing", () => {
    const context = createContext();

    for (const action of [
      () =>
        context.deviceService.register("mcs_v1.invalid.invalid", {
          installationId: randomUUID(),
          platform: "desktop",
        }),
      () => context.deviceService.list("mcs_v1.invalid.invalid"),
    ]) {
      try {
        action();
        throw new Error("Expected an authentication failure");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect(error).toMatchObject({ code: "AUTH_REAUTH_REQUIRED", statusCode: 401 });
      }
    }

    expect(context.db.prepare("SELECT COUNT(*) AS count FROM devices").get()).toMatchObject({
      count: 0,
    });
    context.db.close();
  });

  it("binds each installation session and revokes only that device", async () => {
    const context = createContext();
    await context.service.provisionAccount("alice", password);
    const desktopLogin = await context.service.login("alice", password, "127.0.0.1");
    const mobileLogin = await context.service.login("alice", password, "127.0.0.2");

    const desktopInstallation = randomUUID();
    const mobileInstallation = randomUUID();
    const desktop = context.deviceService.register(desktopLogin.sessionToken, {
      installationId: desktopInstallation,
      platform: "desktop",
      clientName: "Mira Desktop",
    });
    const mobile = context.deviceService.register(mobileLogin.sessionToken, {
      installationId: mobileInstallation,
      platform: "mobile",
      clientName: "Mira Mobile",
    });

    const desktopSessionId = parseSessionToken(desktopLogin.sessionToken)?.id;
    const mobileSessionId = parseSessionToken(mobileLogin.sessionToken)?.id;
    expect(desktopSessionId).toBeTruthy();
    expect(mobileSessionId).toBeTruthy();
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(desktopSessionId!) as { device_id: string | null },
    ).toEqual({ device_id: desktop.id });
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(mobileSessionId!) as { device_id: string | null },
    ).toEqual({ device_id: mobile.id });

    const renewedDesktop = context.service.renewSession(desktopLogin.sessionToken);
    expect(parseSessionToken(renewedDesktop.sessionToken)?.id).toBe(desktopSessionId);
    const renewedMobile = context.service.renewSession(mobileLogin.sessionToken);
    expect(renewedMobile.account.username).toBe("alice");
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(desktopSessionId!) as { device_id: string | null },
    ).toEqual({ device_id: desktop.id });

    const staleDesktopRecord = context.repository.findSessionWithAccount(desktopSessionId!);
    expect(staleDesktopRecord).not.toBeNull();

    const revoked = context.deviceService.revoke(renewedDesktop.sessionToken, desktop.id);
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.id).toBe(desktop.id);

    const repeatedRevoke = context.deviceService.revoke(
      renewedMobile.sessionToken,
      desktop.id,
    );
    expect(repeatedRevoke.revokedAt).toBe(revoked.revokedAt);
    expect(context.deviceService.list(renewedMobile.sessionToken)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: mobile.id, revokedAt: null }),
        expect.objectContaining({ id: desktop.id, revokedAt: revoked.revokedAt }),
      ]),
    );

    for (const action of [
      () => context.service.getSession(renewedDesktop.sessionToken),
      () => context.service.renewSession(renewedDesktop.sessionToken),
      () => context.service.getSession(desktopLogin.sessionToken),
    ]) {
      try {
        action();
        throw new Error("Expected the revoked device session to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect(error).toMatchObject({ code: "AUTH_REAUTH_REQUIRED", statusCode: 401 });
      }
    }

    const rotated = issueSessionToken(desktopSessionId!);
    expect(
      context.repository.rotateSession(
        desktopSessionId!,
        staleDesktopRecord!.session.secretHash,
        rotated.secretHash,
        new Date(Date.now() + 3600_000).toISOString(),
        new Date().toISOString(),
      ),
    ).toBe(false);

    const sessionRow = context.db
      .prepare("SELECT revoked_at, revoke_reason FROM sessions WHERE id = ?")
      .get(desktopSessionId!) as { revoked_at: string | null; revoke_reason: string | null };
    expect(sessionRow).toEqual({
      revoked_at: revoked.revokedAt,
      revoke_reason: "device_revoked",
    });
    expect(
      context.db
        .prepare("SELECT revoked_at, revoke_reason FROM devices WHERE id = ?")
        .get(mobile.id) as { revoked_at: string | null; revoke_reason: string | null },
    ).toEqual({ revoked_at: null, revoke_reason: null });

    expect(context.service.renewSession(renewedMobile.sessionToken).account.username).toBe("alice");

    context.db.close();
  });

  it("rejects device login context unless it identifies an active owned installation", async () => {
    const context = createContext();
    await context.service.provisionAccount("alice", password);
    await context.service.provisionAccount("bob", password);
    const alice = await context.service.login("alice", password, "127.0.0.1");
    const bob = await context.service.login("bob", password, "127.0.0.2");
    const installationId = randomUUID();
    const foreignInstallationId = randomUUID();

    const aliceDevice = context.deviceService.register(alice.sessionToken, {
      installationId,
      platform: "desktop",
    });
    context.deviceService.register(bob.sessionToken, {
      installationId: foreignInstallationId,
      platform: "mobile",
    });

    const rejectedContexts = [
      { installationId: randomUUID(), platform: "desktop" as const },
      { installationId: foreignInstallationId, platform: "mobile" as const },
      { installationId, platform: "mobile" as const },
    ];
    for (const device of rejectedContexts) {
      try {
        await context.service.login("alice", password, "127.0.0.3", device);
        throw new Error("Expected the device context to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect(error).toMatchObject({ code: "AUTH_DEVICE_REJECTED", statusCode: 401 });
      }
    }

    const deviceLogin = await context.service.login("alice", password, "127.0.0.4", {
      installationId: installationId.toUpperCase(),
      platform: "desktop",
    });
    const deviceSessionId = parseSessionToken(deviceLogin.sessionToken)?.id;
    expect(deviceSessionId).toBeTruthy();
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(deviceSessionId!) as { device_id: string | null },
    ).toEqual({ device_id: aliceDevice.id });

    context.deviceService.revoke(deviceLogin.sessionToken, aliceDevice.id);

    try {
      await context.service.login("alice", password, "127.0.0.5", {
        installationId,
        platform: "desktop",
      });
      throw new Error("Expected the revoked device login to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect(error).toMatchObject({ code: "AUTH_DEVICE_REJECTED", statusCode: 401 });
    }

    const legacyLogin = await context.service.login("alice", password, "127.0.0.6");
    const legacySessionId = parseSessionToken(legacyLogin.sessionToken)?.id;
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(legacySessionId!) as { device_id: string | null },
    ).toEqual({ device_id: null });
    expect(context.service.getSession(legacyLogin.sessionToken).account.username).toBe("alice");

    context.db.close();
  });

  it("fails closed when revoking a device owned by another account", async () => {
    const context = createContext();
    await context.service.provisionAccount("alice", password);
    await context.service.provisionAccount("bob", password);
    const alice = await context.service.login("alice", password, "127.0.0.1");
    const bob = await context.service.login("bob", password, "127.0.0.2");
    const aliceDevice = context.deviceService.register(alice.sessionToken, {
      installationId: randomUUID(),
      platform: "desktop",
    });
    const bobDevice = context.deviceService.register(bob.sessionToken, {
      installationId: randomUUID(),
      platform: "mobile",
    });

    for (const deviceId of [bobDevice.id, randomUUID(), "not-a-device-id"]) {
      try {
        context.deviceService.revoke(alice.sessionToken, deviceId);
        throw new Error("Expected the revoke to fail closed");
      } catch (error) {
        expect(error).toBeInstanceOf(DeviceError);
        expect(error).toMatchObject({ code: "DEVICE_NOT_FOUND", statusCode: 404 });
      }
    }

    expect(context.deviceService.list(alice.sessionToken)).toEqual([
      expect.objectContaining({ id: aliceDevice.id, revokedAt: null }),
    ]);
    expect(context.deviceService.list(bob.sessionToken)).toEqual([
      expect.objectContaining({ id: bobDevice.id, revokedAt: null }),
    ]);
    expect(context.service.getSession(bob.sessionToken).account.username).toBe("bob");

    try {
      context.deviceService.revoke("mcs_v1.invalid.invalid", aliceDevice.id);
      throw new Error("Expected an authentication failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect(error).toMatchObject({ code: "AUTH_REAUTH_REQUIRED", statusCode: 401 });
    }

    context.db.close();
  });

  it("keeps legacy unbound sessions valid and binds them on registration", async () => {
    const context = createContext();
    await context.service.provisionAccount("legacy", password);
    const login = await context.service.login("legacy", password, "127.0.0.1");
    const sessionId = parseSessionToken(login.sessionToken)?.id;
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(sessionId!) as { device_id: string | null },
    ).toEqual({ device_id: null });

    expect(context.service.getSession(login.sessionToken).account.username).toBe("legacy");
    const renewed = context.service.renewSession(login.sessionToken);
    expect(context.service.getSession(renewed.sessionToken).account.username).toBe("legacy");

    const installationId = randomUUID();
    const device = context.deviceService.register(renewed.sessionToken, {
      installationId,
      platform: "mobile",
    });
    const boundSessionId = parseSessionToken(renewed.sessionToken)?.id;
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(boundSessionId!) as { device_id: string | null },
    ).toEqual({ device_id: device.id });

    const again = context.deviceService.register(renewed.sessionToken, {
      installationId,
      platform: "mobile",
      clientName: "Mira Mobile",
    });
    expect(again.id).toBe(device.id);
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(boundSessionId!) as { device_id: string | null },
    ).toEqual({ device_id: device.id });

    const freshLogin = await context.service.login("legacy", password, "127.0.0.2");
    const freshSessionId = parseSessionToken(freshLogin.sessionToken)?.id;
    expect(
      context.db
        .prepare("SELECT device_id FROM sessions WHERE id = ?")
        .get(freshSessionId!) as { device_id: string | null },
    ).toEqual({ device_id: null });

    context.db.close();
  });
});
