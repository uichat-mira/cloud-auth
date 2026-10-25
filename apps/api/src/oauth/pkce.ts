import { createHash, timingSafeEqual } from "node:crypto";

/**
 * RFC 7636 S256: BASE64URL(SHA256(ASCII(code_verifier))) without padding.
 */
export function computePkceS256Challenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

export function verifyPkceS256(
  codeVerifier: string,
  expectedChallenge: string,
): boolean {
  const actual = computePkceS256Challenge(codeVerifier);
  if (actual.length !== expectedChallenge.length) return false;
  return timingSafeEqual(Buffer.from(actual, "utf8"), Buffer.from(expectedChallenge, "utf8"));
}
