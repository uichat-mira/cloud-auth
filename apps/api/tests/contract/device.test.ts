import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  authErrorEnvelopeSchema,
  deviceErrorEnvelopeSchema,
  deviceListResponseSchema,
  miraDeviceSchema,
} from "@uichat-mira/cloud-auth-contracts";
import { buildApp } from "../../src/app.js";
import { createTestAuth, type TestAuthContext } from "../helpers/auth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function createContext(): TestAuthContext {
  const dir = mkdtempSync(join(tmpdir(), "mira-device-contract-"));
  cleanup.push(dir);
  return createTestAuth(join(dir, "auth.sqlite"));
}

async function buildDeviceApp(context: TestAuthContext) {
  return buildApp({
    db: context.db,
    authService: context.service,
    deviceService: context.deviceService,
  });
}

describe("Mira Device HTTP contract", () => {
  it("registers and lists only the caller account's devices", async () => {
    const context = createContext();
    await context.service.provisionAccount("alice", password);
    await context.service.provisionAccount("bob", password);
    const alice = await context.service.login("alice", password, "127.0.0.1");
    const bob = await context.service.login("bob", password, "127.0.0.2");
    const app = await buildDeviceApp(context);

    const aliceDesktopInstallation = randomUUID();
    const aliceMobileInstallation = randomUUID();
    const bobInstallation = randomUUID();

    const register = async (token: string, payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/v1/devices",
        headers: { authorization: `Bearer ${token}` },
        payload,
      });

    const desktop = await register(alice.sessionToken, {
      installationId: aliceDesktopInstallation,
      platform: "desktop",
      clientName: "Mira Desktop",
      clientVersion: "1.0.0",
    });
    expect(desktop.statusCode).toBe(200);
    const desktopDevice = miraDeviceSchema.parse(desktop.json());
    expect(desktopDevice).toMatchObject({
      platform: "desktop",
      clientName: "Mira Desktop",
      clientVersion: "1.0.0",
      revokedAt: null,
    });

    const desktopAgain = await register(alice.sessionToken, {
      installationId: aliceDesktopInstallation,
      platform: "desktop",
      clientName: "Mira Desktop",
      clientVersion: "1.0.1",
    });
    expect(desktopAgain.statusCode).toBe(200);
    expect(miraDeviceSchema.parse(desktopAgain.json()).id).toBe(desktopDevice.id);

    const desktopBeforeConflict = miraDeviceSchema.parse(desktopAgain.json());
    const platformMismatch = await register(alice.sessionToken, {
      installationId: aliceDesktopInstallation,
      platform: "mobile",
      clientName: "Mira Mobile",
      clientVersion: "99.0.0",
    });
    expect(platformMismatch.statusCode).toBe(409);
    expect(deviceErrorEnvelopeSchema.parse(platformMismatch.json())).toEqual({
      error: {
        code: "DEVICE_PLATFORM_MISMATCH",
        message: "Mira Device platform cannot change",
      },
    });

    const mobile = await register(alice.sessionToken, {
      installationId: aliceMobileInstallation,
      platform: "mobile",
    });
    expect(mobile.statusCode).toBe(200);
    const mobileDevice = miraDeviceSchema.parse(mobile.json());

    const bobDevice = await register(bob.sessionToken, {
      installationId: bobInstallation,
      platform: "desktop",
    });
    expect(bobDevice.statusCode).toBe(200);
    const bobDeviceBody = miraDeviceSchema.parse(bobDevice.json());

    const aliceList = await app.inject({
      method: "GET",
      url: "/v1/devices",
      headers: { authorization: `Bearer ${alice.sessionToken}` },
    });
    expect(aliceList.statusCode).toBe(200);
    const aliceDevices = deviceListResponseSchema.parse(aliceList.json()).devices;
    expect(aliceDevices.map((device) => device.id).sort()).toEqual(
      [desktopDevice.id, mobileDevice.id].sort(),
    );
    expect(aliceDevices.map((device) => device.id)).not.toContain(bobDeviceBody.id);
    expect(aliceDevices.find((device) => device.id === desktopDevice.id)?.clientVersion).toBe(
      "1.0.1",
    );
    expect(aliceDevices.find((device) => device.id === desktopDevice.id)).toEqual(
      desktopBeforeConflict,
    );

    const bobList = await app.inject({
      method: "GET",
      url: "/v1/devices",
      headers: { authorization: `Bearer ${bob.sessionToken}` },
    });
    expect(bobList.statusCode).toBe(200);
    expect(deviceListResponseSchema.parse(bobList.json()).devices).toEqual([bobDeviceBody]);

    const accountSecrets = context.db
      .prepare("SELECT password_hash FROM accounts")
      .all() as Array<{ password_hash: string }>;
    const sessionSecrets = context.db
      .prepare("SELECT secret_hash FROM sessions")
      .all() as Array<{ secret_hash: string }>;
    for (const response of [desktop, mobile, aliceList, bobList]) {
      for (const secret of [
        ...accountSecrets.map((row) => row.password_hash),
        ...sessionSecrets.map((row) => row.secret_hash),
        alice.sessionToken,
        bob.sessionToken,
        aliceDesktopInstallation,
        aliceMobileInstallation,
        bobInstallation,
      ]) {
        expect(response.body).not.toContain(secret);
      }
      expect(response.body).not.toContain("password_hash");
      expect(response.body).not.toContain("secret_hash");
    }

    await app.close();
    context.db.close();
  });

  it("fails closed for cross-account registration attempts and malformed payloads", async () => {
    const context = createContext();
    const aliceAccount = await context.service.provisionAccount("alice", password);
    await context.service.provisionAccount("bob", password);
    const alice = await context.service.login("alice", password, "127.0.0.1");
    const app = await buildDeviceApp(context);
    const installationId = randomUUID();

    const attempts = [
      { platform: "desktop" },
      { installationId: "not-a-uuid", platform: "desktop" },
      { installationId: "550e8400-e29b-11d4-a716-446655440000", platform: "desktop" },
      { installationId: "01890f6e-4f3c-7cc8-9dbc-55116c2f3a8a", platform: "mobile" },
      { installationId, platform: "server" },
      { installationId, platform: "desktop", accountId: aliceAccount.id },
      { installationId, platform: "desktop", extra: true },
      { installationId, platform: "desktop", clientName: "   " },
      { installationId, platform: "desktop", clientVersion: "v".repeat(65) },
    ];

    for (const payload of attempts) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/devices",
        headers: { authorization: `Bearer ${alice.sessionToken}` },
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }

    const crossAccountAttempt = await app.inject({
      method: "POST",
      url: "/v1/devices",
      headers: { authorization: `Bearer ${alice.sessionToken}` },
      payload: { installationId, platform: "desktop", accountId: aliceAccount.id },
    });
    expect(crossAccountAttempt.statusCode).toBe(400);
    expect(deviceErrorEnvelopeSchema.parse(crossAccountAttempt.json()).error.code).toBe(
      "DEVICE_INVALID_REQUEST",
    );

    expect(context.db.prepare("SELECT COUNT(*) AS count FROM devices").get()).toMatchObject({
      count: 0,
    });

    const unauthorizedRegister = await app.inject({
      method: "POST",
      url: "/v1/devices",
      payload: { installationId, platform: "desktop" },
    });
    expect(unauthorizedRegister.statusCode).toBe(401);
    expect(authErrorEnvelopeSchema.parse(unauthorizedRegister.json()).error.code).toBe(
      "AUTH_REAUTH_REQUIRED",
    );

    const unauthorizedList = await app.inject({ method: "GET", url: "/v1/devices" });
    expect(unauthorizedList.statusCode).toBe(401);
    expect(authErrorEnvelopeSchema.parse(unauthorizedList.json()).error.code).toBe(
      "AUTH_REAUTH_REQUIRED",
    );

    await app.close();
    context.db.close();
  });

  it("does not reactivate a revoked device through registration", async () => {
    const context = createContext();
    await context.service.provisionAccount("revoked", password);
    const session = await context.service.login("revoked", password, "127.0.0.1");
    const app = await buildDeviceApp(context);
    const installationId = randomUUID();

    const registered = await app.inject({
      method: "POST",
      url: "/v1/devices",
      headers: { authorization: `Bearer ${session.sessionToken}` },
      payload: { installationId, platform: "mobile" },
    });
    const device = miraDeviceSchema.parse(registered.json());
    context.db
      .prepare("UPDATE devices SET revoked_at = ?, revoke_reason = ? WHERE id = ?")
      .run("2026-10-24T08:00:00.000Z", "user_revoked", device.id);

    const rejected = await app.inject({
      method: "POST",
      url: "/v1/devices",
      headers: { authorization: `Bearer ${session.sessionToken}` },
      payload: { installationId, platform: "mobile" },
    });
    expect(rejected.statusCode).toBe(409);
    expect(deviceErrorEnvelopeSchema.parse(rejected.json())).toEqual({
      error: {
        code: "DEVICE_REVOKED",
        message: "This Mira Device has been revoked",
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/v1/devices",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect(deviceListResponseSchema.parse(list.json()).devices).toEqual([
      { ...device, revokedAt: "2026-10-24T08:00:00.000Z" },
    ]);

    await app.close();
    context.db.close();
  });
});
