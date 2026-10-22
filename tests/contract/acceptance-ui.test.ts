import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { openDatabase } from "../../src/storage/database.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function createDb() {
  const dir = mkdtempSync(join(tmpdir(), "mira-auth-acceptance-ui-"));
  cleanup.push(dir);
  return openDatabase({ databasePath: join(dir, "auth.sqlite") });
}

describe("test-only acceptance UI", () => {
  it("is disabled by default", async () => {
    const db = createDb();
    const app = buildApp({ db });

    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(404);

    await app.close();
    db.close();
  });

  it("serves a no-store login harness only when explicitly enabled", async () => {
    const db = createDb();
    const app = buildApp({ db, acceptanceUi: true });

    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["cache-control"]).toBe("no-store");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page.body).toContain("登录验收");
    expect(page.body).toContain("不是管理员后台");
    expect(page.body).toContain("./acceptance.js");

    const script = await app.inject({ method: "GET", url: "/acceptance.js" });
    expect(script.statusCode).toBe(200);
    expect(script.headers["cache-control"]).toBe("no-store");
    expect(script.body).toContain("sessionStorage");
    expect(script.body).toContain("v1/auth/login");
    expect(script.body).toContain("v1/auth/logout");

    await app.close();
    db.close();
  });
});
