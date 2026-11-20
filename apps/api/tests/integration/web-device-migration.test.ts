import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/storage/database.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((x) => rmSync(x, { recursive: true, force: true })));

describe("009_web_devices live-table upgrade", () => {
  it("preserves Desktop/Host/Mobile grants, FKs, and mobile-only grant triggers", () => {
    const root = mkdtempSync(join(tmpdir(), "who-web-migration-"));
    directories.push(root);
    const oldMigrations = join(root, "old-migrations");
    mkdirSync(oldMigrations);
    for (const f of readdirSync(join(process.cwd(), "migrations"))) {
      if (/^00[1-8]_.*\.sql$/.test(f))
        cpSync(join(process.cwd(), "migrations", f), join(oldMigrations, f));
    }
    const path = join(root, "auth.sqlite");
    const old = openDatabase({ databasePath: path, migrationsPath: oldMigrations });
    const account = randomUUID(), desktop = randomUUID(), mobile = randomUUID();
    const host = randomUUID(), session = randomUUID(), now = new Date().toISOString();
    old.prepare(`INSERT INTO accounts (id,username,username_normalized,password_hash) VALUES(?,?,?,?)`)
      .run(account, "alice", "alice", "hash");
    for (const [id, platform] of [[desktop, "desktop"], [mobile, "mobile"]] as const) {
      old.prepare(`INSERT INTO devices (id,account_id,installation_id,platform,created_at,last_seen_at)
        VALUES(?,?,?,?,?,?)`).run(id, account, randomUUID(), platform, now, now);
    }
    old.prepare(`INSERT INTO sessions(id,account_id,device_id,secret_hash,expires_at,created_at,last_seen_at)
      VALUES(?,?,?,?,?,?,?)`).run(session, account, desktop, "hash", now, now, now);
    old.prepare(`INSERT INTO desktop_hosts
      (id,account_id,device_id,session_id,relay_room,created_at,advertised_at,lease_expires_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(host, account, desktop, session,
        "room-test", now, now, now, now);
    old.prepare(`INSERT INTO host_grant_policies
      (host_id,account_id,policy_scopes,revision,created_at,updated_at)
      VALUES(?,?,?,?,?,?)`).run(host, account, '["chat"]', 4, now, now);
    old.prepare(`INSERT INTO host_mobile_grant_overrides
      (host_id,mobile_device_id,account_id,scopes,updated_at)
      VALUES(?,?,?,?,?)`).run(host, mobile, account, '["chat"]', now);
    old.close();

    const current = openDatabase({ databasePath: path, migrationsPath: join(process.cwd(), "migrations") });
    try {
      expect(current.prepare("SELECT count(*) AS n FROM devices").get()).toMatchObject({ n: 2 });
      expect(current.prepare("SELECT device_id FROM desktop_hosts WHERE id = ?").get(host))
        .toMatchObject({ device_id: desktop });
      expect(current.prepare("SELECT mobile_device_id FROM host_mobile_grant_overrides").get())
        .toMatchObject({ mobile_device_id: mobile });
      expect(current.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0);
      expect(current.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
      const web = randomUUID();
      current.prepare(`INSERT INTO devices(id,account_id,installation_id,platform,created_at,last_seen_at)
        VALUES(?,?,?,?,?,?)`).run(web, account, randomUUID(), "web", now, now);
      expect(current.prepare("SELECT platform FROM devices WHERE id = ?").get(web))
        .toMatchObject({ platform: "web" });
      expect(current.prepare("SELECT revision FROM host_grant_policies").get())
        .toMatchObject({ revision: 4 });
      current.prepare("UPDATE devices SET revoked_at=? WHERE id=?").run(now, mobile);
      expect(current.prepare("SELECT revision FROM host_grant_policies").get())
        .toMatchObject({ revision: 5 });
      expect(current.prepare("SELECT count(*) AS n FROM desktop_hosts").get())
        .toMatchObject({ n: 1 });
    } finally { current.close(); }
    const reopened = openDatabase({ databasePath: path, migrationsPath: join(process.cwd(), "migrations") });
    try {
      expect(reopened.prepare("SELECT count(*) AS n FROM host_mobile_grant_overrides").get())
        .toMatchObject({ n: 1 });
      expect(reopened.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0);
    } finally { reopened.close(); }
  });
});
