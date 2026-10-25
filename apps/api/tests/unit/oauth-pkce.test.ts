import { describe, expect, it } from "vitest";
import { oauthPkceCodeVerifierSchema } from "@uichat-mira/cloud-auth-contracts";
import {
  computePkceS256Challenge,
  verifyPkceS256,
} from "../../src/oauth/pkce.js";

const rfc7636Verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const rfc7636Challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("OAuth PKCE S256 verifier", () => {
  it("derives the RFC 7636 S256 challenge and verifies it in constant time", () => {
    expect(computePkceS256Challenge(rfc7636Verifier)).toBe(rfc7636Challenge);
    expect(verifyPkceS256(rfc7636Verifier, rfc7636Challenge)).toBe(true);
    expect(verifyPkceS256(rfc7636Verifier, "A".repeat(43))).toBe(false);
    expect(verifyPkceS256("wrong-verifier".padEnd(43, "a"), rfc7636Challenge)).toBe(false);
    expect(verifyPkceS256(rfc7636Verifier, "")).toBe(false);
  });

  it("accepts only RFC 7636 verifier material and never a plain challenge", () => {
    expect(oauthPkceCodeVerifierSchema.parse(rfc7636Verifier)).toBe(rfc7636Verifier);
    expect(oauthPkceCodeVerifierSchema.parse("~".repeat(128))).toBe("~".repeat(128));

    for (const invalid of [
      "",
      "a".repeat(42),
      "a".repeat(129),
      `${rfc7636Verifier}=`,
      `${rfc7636Verifier}+`,
      `${rfc7636Verifier}/`,
      `${rfc7636Verifier} `,
      `${rfc7636Verifier}中文`,
    ]) {
      expect(oauthPkceCodeVerifierSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
