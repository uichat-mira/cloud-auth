import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  authErrorEnvelopeSchema,
  cloudSessionSchema,
  issuedCloudSessionSchema,
} from "@uichat-mira/cloud-auth-contracts";
import { buildApp } from "../../src/app.js";
import { createTestAuth } from "../helpers/auth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";
const replacementPassword = "another strong replacement passphrase";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("Mira Cloud Account HTTP contract", () => {
  it("signs in once, restores, rotates and revokes an opaque Cloud Session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-contract-"));
    cleanup.push(dir);
    const context = createTestAuth(join(dir, "auth.sqlite"));
    await context.service.provisionAccount("Alice", password);
    const app = buildApp({ db: context.db, authService: context.service });

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "alice", password },
    });
    expect(login.statusCode).toBe(200);
    const loginBody = issuedCloudSessionSchema.parse(login.json());
    expect(loginBody.sessionToken).toMatch(/^mcs_v1\./);
    expect(loginBody.account.username).toBe("Alice");
    expect(JSON.stringify(loginBody)).not.toContain(password);

    const restored = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${loginBody.sessionToken}` },
    });
    expect(restored.statusCode).toBe(200);
    const restoredBody = cloudSessionSchema.parse(restored.json());
    expect(restoredBody.account).toEqual(loginBody.account);

    const renewed = await app.inject({
      method: "POST",
      url: "/v1/auth/session/renew",
      headers: { authorization: `Bearer ${loginBody.sessionToken}` },
    });
    expect(renewed.statusCode).toBe(200);
    const renewedBody = issuedCloudSessionSchema.parse(renewed.json());
    expect(renewedBody.sessionToken).not.toBe(loginBody.sessionToken);

    const oldAfterRotation = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${loginBody.sessionToken}` },
    });
    expect(oldAfterRotation.statusCode).toBe(401);
    expect(authErrorEnvelopeSchema.parse(oldAfterRotation.json()).error.code).toBe("AUTH_REAUTH_REQUIRED");

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${renewedBody.sessionToken}` },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${renewedBody.sessionToken}` },
    });
    expect(afterLogout.statusCode).toBe(401);

    const accountRow = context.db
      .prepare("SELECT password_hash FROM accounts WHERE username_normalized = ?")
      .get("alice") as { password_hash: string };
    const sessionRows = context.db
      .prepare("SELECT secret_hash FROM sessions")
      .all() as Array<{ secret_hash: string }>;

    expect(accountRow.password_hash).toMatch(/^\$argon2id\$/);
    expect(accountRow.password_hash).not.toContain(password);
    for (const row of sessionRows) {
      expect(row.secret_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(loginBody.sessionToken).not.toContain(row.secret_hash);
      expect(renewedBody.sessionToken).not.toContain(row.secret_hash);
    }

    await app.close();
    context.db.close();
  });

  it("does not reveal whether a login failure was unknown, wrong, denied or disabled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-failure-"));
    cleanup.push(dir);
    const context = createTestAuth(join(dir, "auth.sqlite"));
    await context.service.provisionAccount("wrongpass", password);
    await context.service.provisionAccount("denied", password);
    context.service.setAllowed("denied", false);
    await context.service.provisionAccount("disabled", password);
    context.service.setDisabled("disabled", true);
    const app = buildApp({ db: context.db, authService: context.service });

    const cases = [
      { username: "missing", password },
      { username: "wrongpass", password: "a different wrong password" },
      { username: "denied", password },
      { username: "disabled", password },
    ];

    for (const payload of cases) {
      const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload });
      expect(response.statusCode).toBe(401);
      expect(authErrorEnvelopeSchema.parse(response.json())).toEqual({
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Invalid account or password",
        },
      });
      expect(response.body).not.toContain(payload.password);
    }

    await app.close();
    context.db.close();
  });

  it("administrator password reset revokes old sessions and replaces the root secret", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-reset-"));
    cleanup.push(dir);
    const context = createTestAuth(join(dir, "auth.sqlite"));
    await context.service.provisionAccount("resetme", password);
    const app = buildApp({ db: context.db, authService: context.service });

    const firstLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "resetme", password },
    });
    const oldToken = (firstLogin.json() as { sessionToken: string }).sessionToken;

    await context.service.resetPassword("resetme", replacementPassword);

    const oldSession = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${oldToken}` },
    });
    expect(oldSession.statusCode).toBe(401);

    const oldPasswordLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "resetme", password },
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "resetme", password: replacementPassword },
    });
    expect(newPasswordLogin.statusCode).toBe(200);

    await app.close();
    context.db.close();
  });

  it("disabling an account immediately invalidates existing and future Cloud Sessions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-disable-"));
    cleanup.push(dir);
    const context = createTestAuth(join(dir, "auth.sqlite"));
    await context.service.provisionAccount("disableme", password);
    const app = buildApp({ db: context.db, authService: context.service });

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "disableme", password },
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { sessionToken: string }).sessionToken;

    context.service.setDisabled("disableme", true);

    const restored = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(restored.statusCode).toBe(401);

    const relogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "disableme", password },
    });
    expect(relogin.statusCode).toBe(401);

    await app.close();
    context.db.close();
  });

  it("rejects malformed bearer credentials without exposing token material", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-bearer-"));
    cleanup.push(dir);
    const context = createTestAuth(join(dir, "auth.sqlite"));
    const app = buildApp({ db: context.db, authService: context.service });

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: "Bearer definitely-not-a-session" },
    });

    expect(response.statusCode).toBe(401);
    expect(authErrorEnvelopeSchema.parse(response.json())).toEqual({
      error: { code: "AUTH_REAUTH_REQUIRED", message: "Re-authentication is required" },
    });
    expect(response.body).not.toContain("definitely-not-a-session");

    await app.close();
    context.db.close();
  });
});
