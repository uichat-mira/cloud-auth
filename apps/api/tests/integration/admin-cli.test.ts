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
  it("enrolls and rotates a trusted application with a digest-only persisted key", () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-app-admin-"));
    cleanup.push(dir);
    const databasePath = join(dir, "auth.sqlite");
    const env = { ...process.env, MIRA_AUTH_DB_PATH: databasePath };
    const metadata = JSON.stringify({
      projectId:"test-app", displayName:"Test App", redirectUri:"https://app.example/callback",
      endpointOrigins:["https://app.example"],
    });
    const enroll = runAdmin(["application-enroll", "test-app-web"], metadata, env);
    expect(enroll.status).toBe(0);
    const first = JSON.parse(enroll.stdout).managementToken as string;
    expect(first).toMatch(/^mca_admin_v1\.test-app-web\.[A-Za-z0-9_-]{43}$/);
    expect(runAdmin(["application-enroll", "test-app-web"], metadata, env).status).toBe(2);
    const rotate = runAdmin(["application-rotate", "test-app-web"], "", env);
    expect(rotate.status).toBe(0);
    const second = JSON.parse(rotate.stdout).managementToken as string;
    expect(second).not.toBe(first);
    const context = createTestAuth(databasePath);
    const row = context.db.prepare("SELECT management_key_hash FROM oauth_cloud_applications WHERE client_id=?").get("test-app-web") as {management_key_hash:string};
    expect(row.management_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.management_key_hash).not.toContain(second);
    context.db.close();
    const disabled = runAdmin(["application-disable","test-app-web"],"",env);
    expect(disabled.status).toBe(0);
    expect(JSON.parse(disabled.stdout)).toEqual({clientId:"test-app-web",disabled:true});
    expect(runAdmin(["application-rotate","test-app-web"],"",env).status).toBe(2);
    const enabled = runAdmin(["application-enable","test-app-web"],"",env);
    expect(enabled.status).toBe(0);
    expect(JSON.parse(enabled.stdout).managementToken).not.toBe(second);
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
