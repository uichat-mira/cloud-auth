import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("uses safe bootstrap defaults", () => {
    expect(loadConfig({})).toEqual({
      host: "0.0.0.0",
      port: 8788,
      databasePath: "./data/auth.sqlite",
      logLevel: "info",
    });
  });

  it("rejects invalid ports", () => {
    expect(() => loadConfig({ PORT: "70000" })).toThrow(/PORT/);
  });
});
