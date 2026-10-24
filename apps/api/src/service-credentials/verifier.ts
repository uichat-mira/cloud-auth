import { KeyObject, createPublicKey, verify } from "node:crypto";
import {
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
  relayTicketContextSchema,
  serviceCredentialAudienceSchema,
  serviceCredentialClaimsSchema,
  serviceCredentialJwtHeaderSchema,
  type RelayConnectionRole,
  type ServiceCredentialAudience,
  type ServiceCredentialClaims,
  type ServiceCredentialJwtHeader,
} from "@uichat-mira/cloud-auth-contracts";
import {
  ServiceCredentialVerificationError,
  type ServiceCredentialVerificationErrorCode,
} from "./errors.js";
import { decodeJsonSegment, parseCompactJwt, type ParsedCompactJwt } from "./jwt.js";
import { MAX_SERVICE_CREDENTIAL_TTL_SECONDS } from "./signer.js";

export type Ed25519PublicKeyInput = KeyObject | string | Buffer;

export interface ExpectedRelayContext {
  room: string;
  role: RelayConnectionRole;
}

export interface ServiceCredentialVerifierConfig {
  /** Explicitly trusted issuer value. Never taken from the token. */
  issuer: string;
  /** The single audience this verifier accepts. */
  audience: ServiceCredentialAudience;
  /** Explicit trusted key set indexed by key id. Never fetched from the token. */
  publicKeys: ReadonlyMap<string, Ed25519PublicKeyInput>;
  /** Upper bound on the accepted credential lifetime. */
  maxTtlSeconds?: number;
  /** Allowed clock skew for temporal checks. Defaults to zero. */
  clockSkewSeconds?: number;
  now?: () => Date;
  /** Optional expected connection context, only valid for Relay transport tickets. */
  expectedRelay?: ExpectedRelayContext;
}

export interface VerifiedServiceCredential {
  claims: ServiceCredentialClaims;
  keyId: string;
  expiresAt: Date;
}

const MAX_CLOCK_SKEW_SECONDS = 60;

function fail(code: ServiceCredentialVerificationErrorCode, message: string): never {
  throw new ServiceCredentialVerificationError(code, message);
}

function resolvePublicKey(input: Ed25519PublicKeyInput): KeyObject {
  let key: KeyObject;
  try {
    const base = input instanceof KeyObject ? input : createPublicKey(input);
    key = base.type === "private" ? createPublicKey(base) : base;
  } catch {
    fail("INVALID_VERIFIER_CONFIG", "Trusted verification key could not be loaded");
  }
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
    fail("INVALID_VERIFIER_CONFIG", "Trusted verification key must be Ed25519");
  }
  return key;
}

function validateConfig(config: ServiceCredentialVerifierConfig): number {
  if (typeof config.issuer !== "string" || config.issuer.length === 0) {
    fail("INVALID_VERIFIER_CONFIG", "Verifier issuer must be configured explicitly");
  }
  if (!serviceCredentialAudienceSchema.safeParse(config.audience).success) {
    fail("INVALID_VERIFIER_CONFIG", "Verifier audience is not supported");
  }
  if (config.publicKeys.size === 0) {
    fail("INVALID_VERIFIER_CONFIG", "Verifier must be configured with at least one trusted key");
  }

  const maxTtl = config.maxTtlSeconds ?? MAX_SERVICE_CREDENTIAL_TTL_SECONDS;
  if (!Number.isInteger(maxTtl) || maxTtl <= 0 || maxTtl > MAX_SERVICE_CREDENTIAL_TTL_SECONDS) {
    fail(
      "INVALID_VERIFIER_CONFIG",
      `maxTtlSeconds must be an integer between 1 and ${MAX_SERVICE_CREDENTIAL_TTL_SECONDS}`,
    );
  }

  const clockSkew = config.clockSkewSeconds ?? 0;
  if (
    !Number.isInteger(clockSkew) ||
    clockSkew < 0 ||
    clockSkew > MAX_CLOCK_SKEW_SECONDS
  ) {
    fail(
      "INVALID_VERIFIER_CONFIG",
      `clockSkewSeconds must be an integer between 0 and ${MAX_CLOCK_SKEW_SECONDS}`,
    );
  }

  if (config.expectedRelay !== undefined) {
    if (config.audience !== CLOUD_RELAY_TRANSPORT_AUDIENCE) {
      fail("INVALID_VERIFIER_CONFIG", "Expected Relay context is only valid for Relay tickets");
    }
    if (!relayTicketContextSchema.safeParse(config.expectedRelay).success) {
      fail("INVALID_VERIFIER_CONFIG", "Expected Relay context is malformed");
    }
  }

  return maxTtl;
}

function parseHeader(parsed: ParsedCompactJwt): ServiceCredentialJwtHeader {
  let raw: unknown;
  try {
    raw = decodeJsonSegment(parsed.headerSegment);
  } catch {
    fail("INVALID_HEADER", "JWT header is not valid JSON");
  }
  const result = serviceCredentialJwtHeaderSchema.safeParse(raw);
  if (!result.success) {
    fail("INVALID_HEADER", "JWT header must be EdDSA/JWT with a bounded kid");
  }
  return result.data;
}

function parseClaims(parsed: ParsedCompactJwt): ServiceCredentialClaims {
  let raw: unknown;
  try {
    raw = decodeJsonSegment(parsed.payloadSegment);
  } catch {
    fail("INVALID_CLAIMS", "JWT payload is not valid JSON");
  }
  const result = serviceCredentialClaimsSchema.safeParse(raw);
  if (!result.success) {
    fail("INVALID_CLAIMS", "JWT payload does not satisfy the canonical claims contract");
  }
  return result.data;
}

export function verifyServiceCredential(
  token: string,
  config: ServiceCredentialVerifierConfig,
): VerifiedServiceCredential {
  const maxTtlSeconds = validateConfig(config);

  let parsed: ParsedCompactJwt;
  try {
    parsed = parseCompactJwt(token);
  } catch {
    fail("MALFORMED_TOKEN", "Service credential is not a compact JWS");
  }

  const header = parseHeader(parsed);
  const trustedKey = config.publicKeys.get(header.kid);
  if (trustedKey === undefined) {
    fail("UNKNOWN_KEY", "Service credential was signed with an unknown key id");
  }
  const publicKey = resolvePublicKey(trustedKey);

  const signatureValid = verify(
    null,
    Buffer.from(parsed.signingInput, "ascii"),
    publicKey,
    parsed.signature,
  );
  if (!signatureValid) {
    fail("INVALID_SIGNATURE", "Service credential signature is invalid");
  }

  const claims = parseClaims(parsed);

  if (claims.iss !== config.issuer) {
    fail("ISSUER_MISMATCH", "Service credential issuer is not trusted");
  }
  if (claims.aud !== config.audience) {
    fail("AUDIENCE_MISMATCH", "Service credential audience is not accepted by this verifier");
  }

  const nowSeconds = Math.floor((config.now?.() ?? new Date()).getTime() / 1000);
  const clockSkew = config.clockSkewSeconds ?? 0;

  if (claims.iat > nowSeconds + clockSkew) {
    fail("IAT_IN_FUTURE", "Service credential was issued in the future");
  }
  if (claims.nbf > nowSeconds + clockSkew) {
    fail("NOT_YET_VALID", "Service credential is not valid yet");
  }
  if (claims.exp <= nowSeconds - clockSkew) {
    fail("EXPIRED", "Service credential has expired");
  }
  if (claims.exp - claims.iat > maxTtlSeconds) {
    fail("TTL_EXCEEDED", "Service credential lifetime exceeds the verifier limit");
  }

  if (claims.aud === CLOUD_RELAY_TRANSPORT_AUDIENCE) {
    if (config.expectedRelay !== undefined) {
      if (
        claims.relay.room !== config.expectedRelay.room ||
        claims.relay.role !== config.expectedRelay.role
      ) {
        fail("RELAY_CONTEXT_MISMATCH", "Relay ticket does not match the requested connection");
      }
    }
  }

  return {
    claims,
    keyId: header.kid,
    expiresAt: new Date(claims.exp * 1000),
  };
}
