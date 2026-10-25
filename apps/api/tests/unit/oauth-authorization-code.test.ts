import { describe, expect, it } from "vitest";
import {
  hashAuthorizationCodeSecret,
  issueAuthorizationCode,
  parseAuthorizationCode,
  verifyAuthorizationCodeSecret,
  verifyAuthorizationCodeSecretHash,
} from "../../src/oauth/authorization-code.js";

describe("opaque authorization code generation", () => {
  it("issues a 256-bit secret code while only retaining its domain-separated hash", () => {
    const issued = issueAuthorizationCode();
    const parsed = parseAuthorizationCode(issued.code);

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe(issued.id);
    expect(parsed?.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.code).toMatch(/^mca_v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(issued.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.code).not.toContain(issued.secretHash);
    expect(hashAuthorizationCodeSecret(parsed!.secret)).toBe(issued.secretHash);
    expect(verifyAuthorizationCodeSecret(parsed!.secret, issued.secretHash)).toBe(true);
    expect(verifyAuthorizationCodeSecretHash(issued.secretHash, issued.secretHash)).toBe(true);
  });

  it("generates distinct ids and secrets and rejects malformed or mismatched codes", () => {
    const first = issueAuthorizationCode();
    const second = issueAuthorizationCode();
    expect(first.id).not.toBe(second.id);
    expect(first.code).not.toBe(second.code);
    expect(first.secretHash).not.toBe(second.secretHash);

    const parsed = parseAuthorizationCode(first.code);
    expect(parsed).not.toBeNull();
    expect(verifyAuthorizationCodeSecret("a".repeat(43), first.secretHash)).toBe(false);
    expect(verifyAuthorizationCodeSecretHash("not-a-hash", first.secretHash)).toBe(false);

    for (const invalid of [
      "",
      "mca_v1",
      "mca_v1.abc.def",
      `mca_v2.${"a".repeat(22)}.${"b".repeat(43)}`,
      `mca_v1.${"a".repeat(23)}.${"b".repeat(43)}`,
      `mca_v1.${"a".repeat(22)}.${"b".repeat(44)}`,
      `mca_v1.${"a".repeat(22)}.${"b".repeat(43)}.extra`,
      `mca_v1.${"a".repeat(22)}.${"b".repeat(42)}=`,
    ]) {
      expect(parseAuthorizationCode(invalid)).toBeNull();
    }
  });
});
