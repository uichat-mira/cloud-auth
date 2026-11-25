import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createTestAuth } from "../helpers/auth.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("maintainer admin CLI", () => {
  it("provisions and resets an account without accepting a password argument", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-admin-"));
    cleanup.push(dir);
    const databasePath = join(dir, "auth.sqlite");
    const env = { ...process.env, MIRA_AUTH_DB_PATH: databasePath };

    const provision = runAdmin(["provision", "pilot"], "first strong pilot passphrase", env);
    expect(provision.status).toBe(0);
    expect(provision.stdout).toContain('"username":"pilot"');
    expect(provision.stdout).not.toContain("first strong pilot passphrase");

    const context = createTestAuth(databasePath);
    await expect(context.service.login("pilot", "first strong pilot passphrase", "127.0.0.1")).resolves.toMatchObject({
      account: { username: "pilot" },
    });
    context.db.close();

    const reset = runAdmin(["reset-password", "pilot"], "second strong pilot passphrase", env);
    expect(reset.status).toBe(0);
    expect(reset.stdout).not.toContain("second strong pilot passphrase");

    const afterReset = createTestAuth(databasePath);
    await expect(
      afterReset.service.login("pilot", "first strong pilot passphrase", "127.0.0.1"),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    await expect(
      afterReset.service.login("pilot", "second strong pilot passphrase", "127.0.0.2"),
    ).resolves.toMatchObject({ account: { username: "pilot" } });
    afterReset.db.close();
  });
  it("rejects retired registration, grant and management commands without mutation", () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-app-admin-"));
    cleanup.push(dir);
    const databasePath = join(dir, "auth.sqlite");
    const env = { ...process.env, MIRA_AUTH_DB_PATH: databasePath };
    const context = createTestAuth(databasePath);
    context.db.prepare("INSERT INTO oauth_cloud_applications(client_id,project_id,display_name,redirect_uri,management_key_hash) VALUES(?,?,?,?,?)")
      .run("test-app-web","test-app","Test App","https://app.example/callback","historical-digest-fixture");
    context.db.close();
    for (const args of [
      ["application-enroll","other-app-web"],["application-rotate","test-app-web"],
      ["application-disable","test-app-web"],["application-enable","test-app-web"],
      ["service-register","account-fixture"],["service-revoke","account-fixture","mail","1"],
    ]) {
      const result = runAdmin(args, "{}", env);
      expect(result.status, args[0]).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Usage:");
    }
    const after = createTestAuth(databasePath);
    expect(after.db.prepare("SELECT client_id,management_key_hash,disabled_at FROM oauth_cloud_applications").all())
      .toEqual([{client_id:"test-app-web",management_key_hash:"historical-digest-fixture",disabled_at:null}]);
    expect(after.db.prepare("SELECT COUNT(*) AS n FROM service_registrations").get()).toEqual({n:0});
    after.db.close();
  });

});

function runAdmin(args: string[], input: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/admin-cli.ts", ...args], {
    cwd: process.cwd(),
    env,
    input,
    encoding: "utf8",
  });
}
