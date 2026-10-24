import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthError } from "../../src/auth/auth-service.js";
import { DeviceError } from "../../src/devices/device-service.js";
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

  it("refuses to reactivate a revoked installation", async () => {
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

    expect(() =>
      context.deviceService.register(session.sessionToken, {
        installationId,
        platform: "mobile",
        clientName: "Mira Mobile",
        clientVersion: "2.0.1",
      }),
    ).toThrowError(DeviceError);

    try {
      context.deviceService.register(session.sessionToken, {
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
});
