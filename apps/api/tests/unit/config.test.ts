import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("uses safe bootstrap/auth defaults", () => {
    expect(loadConfig({})).toEqual({
      host: "0.0.0.0",
      port: 8788,
      databasePath: "./data/auth.sqlite",
      logLevel: "info",
      sessionTtlSeconds: 2_592_000,
      passwordMaxConcurrency: 2,
      loginPerUsernamePerMinute: 5,
      loginPerIpPerMinute: 20,
      argon2MemoryKiB: 19_456,
      argon2Passes: 2,
      argon2Parallelism: 1,
      acceptanceUi: false,
    });
  });

  it("rejects unsafe or invalid runtime values", () => {
    expect(() => loadConfig({ PORT: "70000" })).toThrow(/PORT/);
    expect(() => loadConfig({ MIRA_AUTH_PASSWORD_MAX_CONCURRENCY: "9" })).toThrow(/CONCURRENCY/);
    expect(() => loadConfig({ MIRA_AUTH_ARGON2_MEMORY_KIB: "1024" })).toThrow(/ARGON2_MEMORY/);
    expect(() => loadConfig({ MIRA_AUTH_SESSION_TTL_SECONDS: "60" })).toThrow(/SESSION_TTL/);
    expect(loadConfig({ MIRA_AUTH_ACCEPTANCE_UI: "true" }).acceptanceUi).toBe(true);
    expect(() => loadConfig({ MIRA_AUTH_ACCEPTANCE_UI: "yes" })).toThrow(/ACCEPTANCE_UI/);
  });
});
