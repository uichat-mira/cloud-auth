import { describe, expect, it } from "vitest";
import {
  issueSessionToken,
  parseSessionToken,
  verifySessionSecret,
} from "../../src/security/session-token.js";

describe("Cloud Session token", () => {
  it("issues a high-entropy opaque token while keeping only a secret hash", () => {
    const issued = issueSessionToken();
    const parsed = parseSessionToken(issued.token);

    expect(parsed?.id).toBe(issued.id);
    expect(issued.token).toMatch(/^mcs_v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(issued.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.secretHash).not.toContain(parsed?.secret ?? "impossible");
    expect(verifySessionSecret(parsed!.secret, issued.secretHash)).toBe(true);
    expect(verifySessionSecret("wrong-secret", issued.secretHash)).toBe(false);
  });

  it("can rotate the secret while preserving the session id", () => {
    const first = issueSessionToken();
    const rotated = issueSessionToken(first.id);
    expect(rotated.id).toBe(first.id);
    expect(rotated.token).not.toBe(first.token);
    expect(rotated.secretHash).not.toBe(first.secretHash);
  });
});
