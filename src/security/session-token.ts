import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "mcs_v1";
const SESSION_ID_BYTES = 16;
const SESSION_SECRET_BYTES = 32;

export interface IssuedSessionToken {
  id: string;
  token: string;
  secretHash: string;
}

export function issueSessionToken(existingId?: string): IssuedSessionToken {
  const id = existingId ?? randomBytes(SESSION_ID_BYTES).toString("base64url");
  const secret = randomBytes(SESSION_SECRET_BYTES).toString("base64url");
  return {
    id,
    token: `${TOKEN_PREFIX}.${id}.${secret}`,
    secretHash: hashSessionSecret(secret),
  };
}

export function parseSessionToken(token: string): { id: string; secret: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, id, secret] = parts;
  if (!id || !secret) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !/^[A-Za-z0-9_-]+$/.test(secret)) return null;
  return { id, secret };
}

export function hashSessionSecret(secret: string): string {
  return createHash("sha256").update("mira-cloud-session\0", "utf8").update(secret, "utf8").digest("hex");
}

export function verifySessionSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSessionSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
