import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const CODE_PREFIX = "mca_v1";
const CODE_ID_BYTES = 16;
const CODE_SECRET_BYTES = 32;

export interface IssuedAuthorizationCode {
  id: string;
  code: string;
  secretHash: string;
}

export function issueAuthorizationCode(): IssuedAuthorizationCode {
  const id = randomBytes(CODE_ID_BYTES).toString("base64url");
  const secret = randomBytes(CODE_SECRET_BYTES).toString("base64url");
  return {
    id,
    code: `${CODE_PREFIX}.${id}.${secret}`,
    secretHash: hashAuthorizationCodeSecret(secret),
  };
}

export function parseAuthorizationCode(
  code: string,
): { id: string; secret: string } | null {
  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) return null;
  const [, id, secret] = parts;
  if (!id || !secret) return null;
  if (!/^[A-Za-z0-9_-]{22}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    return null;
  }
  return { id, secret };
}

export function hashAuthorizationCodeSecret(secret: string): string {
  return createHash("sha256")
    .update("mira-cloud-authorization-code\0", "utf8")
    .update(secret, "utf8")
    .digest("hex");
}

export function verifyAuthorizationCodeSecret(secret: string, expectedHash: string): boolean {
  return verifyAuthorizationCodeSecretHash(hashAuthorizationCodeSecret(secret), expectedHash);
}

export function verifyAuthorizationCodeSecretHash(
  actualHash: string,
  expectedHash: string,
): boolean {
  if (!/^[0-9a-f]{64}$/.test(actualHash) || !/^[0-9a-f]{64}$/.test(expectedHash)) {
    return false;
  }
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
