import { describe, expect, it } from "vitest";
import { LoginGuard } from "../../src/security/login-guard.js";

describe("LoginGuard", () => {
  it("bounds concurrent password hashing instead of queueing without limit", () => {
    const guard = new LoginGuard({
      maxConcurrentHashes: 2,
      perUsernamePerMinute: 20,
      perIpPerMinute: 20,
    });

    const first = guard.begin("one", "127.0.0.1", 0);
    const second = guard.begin("two", "127.0.0.1", 0);
    const third = guard.begin("three", "127.0.0.1", 0);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third).toMatchObject({ allowed: false, code: "busy" });

    if (first.allowed) first.releaseHashSlot();
    const afterRelease = guard.begin("four", "127.0.0.1", 0);
    expect(afterRelease.allowed).toBe(true);
    if (second.allowed) second.releaseHashSlot();
    if (afterRelease.allowed) afterRelease.releaseHashSlot();
  });

  it("limits both per-username brute force and per-IP spraying", () => {
    const guard = new LoginGuard({
      maxConcurrentHashes: 1,
      perUsernamePerMinute: 2,
      perIpPerMinute: 3,
    });

    for (let index = 0; index < 2; index += 1) {
      const decision = guard.begin("alice", `10.0.0.${index + 1}`, 0);
      expect(decision.allowed).toBe(true);
      if (decision.allowed) decision.releaseHashSlot();
    }
    expect(guard.begin("alice", "10.0.0.9", 0)).toMatchObject({
      allowed: false,
      code: "rate_limited",
    });

    const ipGuard = new LoginGuard({
      maxConcurrentHashes: 1,
      perUsernamePerMinute: 20,
      perIpPerMinute: 2,
    });
    for (const username of ["one", "two"]) {
      const decision = ipGuard.begin(username, "10.0.0.1", 0);
      expect(decision.allowed).toBe(true);
      if (decision.allowed) decision.releaseHashSlot();
    }
    expect(ipGuard.begin("three", "10.0.0.1", 0)).toMatchObject({
      allowed: false,
      code: "rate_limited",
    });
  });
});
