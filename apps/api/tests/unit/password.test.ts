import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARGON2_POLICY,
  PasswordHasher,
  describePasswordPolicy,
  validatePassword,
} from "../../src/security/password.js";

describe("password policy and Argon2id", () => {
  it("uses the reviewed OWASP-grade V0 baseline", () => {
    expect(DEFAULT_ARGON2_POLICY).toEqual({
      memoryKiB: 19_456,
      passes: 2,
      parallelism: 1,
      tagLength: 32,
    });
    expect(describePasswordPolicy()).toMatchObject({
      minCharacters: 15,
      maxCharacters: 256,
    });
  });

  it("allows long Unicode passphrases without composition rules", () => {
    expect(() => validatePassword("这是一条足够长的 Mira 云端口令 2026 🌹")).not.toThrow();
    expect(() => validatePassword("short-password")).toThrow(/at least 15/);
  });

  it("hashes and verifies without storing plaintext", async () => {
    const hasher = new PasswordHasher();
    const password = "correct horse battery staple";
    const encoded = await hasher.hash(password);

    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(encoded).not.toContain(password);
    await expect(hasher.verify(password, encoded)).resolves.toBe(true);
    await expect(hasher.verify("definitely wrong password", encoded)).resolves.toBe(false);
  });
});
