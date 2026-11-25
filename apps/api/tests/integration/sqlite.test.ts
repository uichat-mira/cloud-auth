import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/storage/database.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("SQLite runtime", () => {
  it("enables WAL and applies migrations once", () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-db-"));
    cleanup.push(dir);
    const path = join(dir, "auth.sqlite");

    const first = openDatabase({ databasePath: path });
    const journal = first.prepare("PRAGMA journal_mode").get() as { journal_mode?: string };
    expect(journal.journal_mode?.toLowerCase()).toBe("wal");
    expect(first.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 16 });
    first.close();

    const second = openDatabase({ databasePath: path });
    expect(second.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 16 });
    second.close();
  });

  it("revokes previously issued open-application Cloud Sessions on upgrade without touching native or direct sessions", () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-v0-upgrade-"));
    cleanup.push(dir);
    const path = join(dir, "auth.sqlite");
    const oldMigrations = join(dir, "migrations");
    mkdirSync(oldMigrations);
    for (const name of readdirSync(join(process.cwd(), "migrations")).filter(name => /^0(?:0[1-9]|1[0-4])_/.test(name))) {
      copyFileSync(join(process.cwd(), "migrations", name), join(oldMigrations, name));
    }
    const old = openDatabase({ databasePath: path, migrationsPath: oldMigrations });
    old.prepare("INSERT INTO accounts (id, username, username_normalized, password_hash) VALUES (?, ?, ?, ?)").run("fixture-account", "fixture", "fixture", "fixture-digest");
    for (const id of ["web-session", "mobile-session", "direct-session"]) {
      old.prepare("INSERT INTO sessions (id, account_id, secret_hash, expires_at) VALUES (?, ?, ?, ?)").run(id, "fixture-account", "fixture-digest", "2099-01-01T00:00:00.000Z");
    }
    for (const [id, client, session] of [["web-code", "who-you-web", "web-session"], ["mobile-code", "mira-mobile", "mobile-session"], ["pending-web-code", "who-you-web", null]] as const) {
      old.prepare("INSERT INTO oauth_authorization_codes (id, account_id, client_id, redirect_uri, code_challenge, code_challenge_method, secret_hash, expires_at, consumed_at, consumed_by_session_id) VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, ?, ?)").run(
        id, "fixture-account", client, "https://fixture.example/callback", "fixture-challenge", "fixture-digest", "2099-01-01T00:00:00.000Z", session ? "2026-01-01T00:00:00.000Z" : null, session);
    }
    old.close();
    const migrated = openDatabase({ databasePath: path });
    expect(migrated.prepare("SELECT id FROM sessions WHERE revoked_at IS NULL ORDER BY id").all()).toEqual([{ id: "direct-session" }, { id: "mobile-session" }]);
    expect(migrated.prepare("SELECT revoke_reason FROM sessions WHERE id = 'web-session'").get()).toMatchObject({ revoke_reason: "open_application_oauth_retired" });
    expect(migrated.prepare("SELECT consume_reason FROM oauth_authorization_codes WHERE id = 'pending-web-code'").get()).toMatchObject({ consume_reason: "open_application_oauth_retired" });
    migrated.close();
  });
});
