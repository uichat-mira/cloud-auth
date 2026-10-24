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

describe("health contract", () => {
  it("exposes health and readiness without production secrets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-contract-"));
    cleanup.push(dir);
    const db = openDatabase({ databasePath: join(dir, "auth.sqlite") });
    const app = buildApp({ db });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok", service: "mira-cloud-auth" });

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });

    await app.close();
    db.close();
  });
  it("does not serve the retired browser acceptance harness", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-auth-no-legacy-ui-"));
    cleanup.push(dir);
    const db = openDatabase({ databasePath: join(dir, "auth.sqlite") });
    const app = buildApp({ db });

    for (const url of ["/", "/acceptance.js"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain("登录验收");
    }

    await app.close();
    db.close();
  });

});
