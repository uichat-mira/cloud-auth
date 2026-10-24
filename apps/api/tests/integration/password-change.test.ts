import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthError } from "../../src/auth/auth-service.js";
import { createTestAuth, type TestAuthContext } from "../helpers/auth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";
const replacementPassword = "another strong replacement passphrase";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function createContext(): TestAuthContext {
  const dir = mkdtempSync(join(tmpdir(), "mira-auth-password-change-"));
  cleanup.push(dir);
  return createTestAuth(join(dir, "auth.sqlite"));
}

function accountRow(context: TestAuthContext, username: string) {
  const row = context.db
    .prepare(
      "SELECT password_hash, password_version, password_changed_at FROM accounts WHERE username_normalized = ?",
    )
    .get(username) as
    | { password_hash: string; password_version: number; password_changed_at: string }
    | undefined;
  if (!row) throw new Error(`Missing account ${username}`);
  return row;
}

function sessionsFor(context: TestAuthContext, username: string) {
  return context.db
    .prepare(
      `SELECT s.revoked_at, s.revoke_reason
         FROM sessions s
         JOIN accounts a ON a.id = s.account_id
        WHERE a.username_normalized = ?
        ORDER BY s.created_at`,
    )
    .all(username) as Array<{ revoked_at: string | null; revoke_reason: string | null }>;
}

async function expectAuthError(
  action: Promise<unknown>,
  code: string,
  statusCode: number,
): Promise<void> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({ code, statusCode });
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("self-service password change", () => {
  it("stores the new password through Argon2 and revokes every Cloud Session", async () => {
    const context = createContext();
    await context.service.provisionAccount("selfservice", password);
    const before = accountRow(context, "selfservice");

    const currentSession = await context.service.login("selfservice", password, "127.0.0.1");
    const otherSession = await context.service.login("selfservice", password, "127.0.0.2");

    await context.service.changePassword(
      currentSession.sessionToken,
      password,
      replacementPassword,
      "127.0.0.1",
    );

    const after = accountRow(context, "selfservice");
    expect(after.password_hash).not.toBe(before.password_hash);
    expect(after.password_hash).toMatch(/^\$argon2id\$/);
    expect(after.password_hash).not.toContain(replacementPassword);
    expect(after.password_version).toBe(before.password_version + 1);
    expect(after.password_changed_at >= before.password_changed_at).toBe(true);

    expect(sessionsFor(context, "selfservice")).toEqual([
      { revoked_at: expect.any(String), revoke_reason: "password_changed" },
      { revoked_at: expect.any(String), revoke_reason: "password_changed" },
    ]);
    for (const token of [currentSession.sessionToken, otherSession.sessionToken]) {
      expect(() => context.service.getSession(token)).toThrowError(AuthError);
    }

    await expectAuthError(
      context.service.login("selfservice", password, "127.0.0.1"),
      "AUTH_INVALID_CREDENTIALS",
      401,
    );
    const newLogin = await context.service.login(
      "selfservice",
      replacementPassword,
      "127.0.0.1",
    );
    expect(newLogin.account.username).toBe("selfservice");

    context.db.close();
  });

  it("does not mutate credentials or revoke the active session on a wrong current password", async () => {
    const context = createContext();
    await context.service.provisionAccount("wrongcurrent", password);
    const before = accountRow(context, "wrongcurrent");
    const session = await context.service.login("wrongcurrent", password, "127.0.0.1");

    await expectAuthError(
      context.service.changePassword(
        session.sessionToken,
        "not the current password",
        replacementPassword,
        "127.0.0.1",
      ),
      "AUTH_INVALID_CREDENTIALS",
      401,
    );

    expect(accountRow(context, "wrongcurrent")).toEqual(before);
    expect(sessionsFor(context, "wrongcurrent")).toEqual([
      { revoked_at: null, revoke_reason: null },
    ]);
    expect(context.service.getSession(session.sessionToken).account.username).toBe(
      "wrongcurrent",
    );
    const existingPassword = await context.service.login(
      "wrongcurrent",
      password,
      "127.0.0.1",
    );
    expect(existingPassword.account.username).toBe("wrongcurrent");

    context.db.close();
  });

  it("rejects a policy-invalid new password without changing credentials or sessions", async () => {
    const context = createContext();
    await context.service.provisionAccount("policychange", password);
    const before = accountRow(context, "policychange");
    const session = await context.service.login("policychange", password, "127.0.0.1");

    await expectAuthError(
      context.service.changePassword(
        session.sessionToken,
        password,
        "too short",
        "127.0.0.1",
      ),
      "AUTH_INVALID_PASSWORD",
      400,
    );

    expect(accountRow(context, "policychange")).toEqual(before);
    expect(sessionsFor(context, "policychange")).toEqual([
      { revoked_at: null, revoke_reason: null },
    ]);
    expect(context.service.getSession(session.sessionToken).account.username).toBe(
      "policychange",
    );

    context.db.close();
  });

  it("keeps the new password valid after the database is reopened", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-password-reopen-"));
    cleanup.push(dir);
    const databasePath = join(dir, "auth.sqlite");

    const first = createTestAuth(databasePath);
    await first.service.provisionAccount("reopenchange", password);
    const session = await first.service.login("reopenchange", password, "127.0.0.1");
    await first.service.changePassword(
      session.sessionToken,
      password,
      replacementPassword,
      "127.0.0.1",
    );
    first.db.close();

    const second = createTestAuth(databasePath);
    await expectAuthError(
      second.service.login("reopenchange", password, "127.0.0.1"),
      "AUTH_INVALID_CREDENTIALS",
      401,
    );
    const login = await second.service.login(
      "reopenchange",
      replacementPassword,
      "127.0.0.1",
    );
    expect(login.account.username).toBe("reopenchange");
    second.db.close();
  });
});
