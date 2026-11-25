import { KeyObject, createPublicKey, verify } from "node:crypto";
import {
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
  applicationIdSchema,
  applicationServiceClaimsSchema,
  applicationServiceResourceSchema,
  relayTicketContextSchema,
  serviceCredentialAudienceSchema,
  serviceCredentialClaimsSchema,
  serviceCredentialJwtHeaderSchema,
  serviceIdSchema,
  type ApplicationServiceClaims,
  type ApplicationServiceResource,
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

/**
 * Exact instance-scoped service identity the verifier accepts. The resource is
 * both the credential audience and the expected protected resource; appId and
 * serviceId are matched against the signed claims.
 */
export interface ExpectedApplicationServiceContext {
  appId: string;
  serviceId: string;
  resource: ApplicationServiceResource;
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
  /** Required for Relay transport tickets; invalid for other audiences. */
  expectedRelay?: ExpectedRelayContext;
}

/**
 * Application service credentials have their own verification entry point so a
 * canonical/registered-service verifier can never silently accept an
 * instance-scoped credential merely because its audience is an HTTPS URL.
 */
export interface ApplicationServiceVerifierConfig {
  issuer: string;
  expectedApplication: ExpectedApplicationServiceContext;
  publicKeys: ReadonlyMap<string, Ed25519PublicKeyInput>;
  maxTtlSeconds?: number;
  clockSkewSeconds?: number;
  now?: () => Date;
}

export interface VerifiedServiceCredential {
  claims: ServiceCredentialClaims;
  keyId: string;
  expiresAt: Date;
}

export interface VerifiedApplicationServiceCredential {
  claims: ApplicationServiceClaims;
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

interface CoreVerifierConfig {
  issuer: string;
  publicKeys: ReadonlyMap<string, Ed25519PublicKeyInput>;
  maxTtlSeconds?: number;
  clockSkewSeconds?: number;
  now?: () => Date;
}

function validateCoreConfig(config: CoreVerifierConfig): void {
  if (typeof config.issuer !== "string" || config.issuer.length === 0) {
    fail("INVALID_VERIFIER_CONFIG", "Verifier issuer must be configured explicitly");
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
}

function validateConfig(config: ServiceCredentialVerifierConfig): void {
  validateCoreConfig(config);
  if (!serviceCredentialAudienceSchema.safeParse(config.audience).success) {
    fail("INVALID_VERIFIER_CONFIG", "Verifier audience is not supported");
  }
  if (config.audience === CLOUD_RELAY_TRANSPORT_AUDIENCE && config.expectedRelay === undefined) {
    fail("INVALID_VERIFIER_CONFIG", "Relay verifier must specify the expected room and role");
  }
  if (config.expectedRelay !== undefined) {
    if (config.audience !== CLOUD_RELAY_TRANSPORT_AUDIENCE) {
      fail("INVALID_VERIFIER_CONFIG", "Expected Relay context is only valid for Relay tickets");
    }
    if (!relayTicketContextSchema.safeParse(config.expectedRelay).success) {
      fail("INVALID_VERIFIER_CONFIG", "Expected Relay context is malformed");
    }
  }
}

function validateApplicationConfig(config: ApplicationServiceVerifierConfig): void {
  validateCoreConfig(config);
  if (
    !applicationIdSchema.safeParse(config.expectedApplication.appId).success ||
    !serviceIdSchema.safeParse(config.expectedApplication.serviceId).success ||
    !applicationServiceResourceSchema.safeParse(config.expectedApplication.resource).success
  ) {
    fail("INVALID_VERIFIER_CONFIG", "Expected application service identity is malformed");
  }
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

function decodeClaims(parsed: ParsedCompactJwt): unknown {
  try {
    return decodeJsonSegment(parsed.payloadSegment);
  } catch {
    fail("INVALID_CLAIMS", "JWT payload is not valid JSON");
  }
}

function parseClaims(parsed: ParsedCompactJwt): ServiceCredentialClaims {
  const result = serviceCredentialClaimsSchema.safeParse(decodeClaims(parsed));
  if (!result.success) {
    fail("INVALID_CLAIMS", "JWT payload does not satisfy the canonical claims contract");
  }
  return result.data;
}

function parseApplicationClaims(parsed: ParsedCompactJwt): ApplicationServiceClaims {
  const result = applicationServiceClaimsSchema.safeParse(decodeClaims(parsed));
  if (!result.success) {
    fail(
      "INVALID_CLAIMS",
      "JWT payload does not satisfy the application service claims contract",
    );
  }
  return result.data;
}

interface CoreClaims {
  iss: string;
  aud: string;
  iat: number;
  nbf: number;
  exp: number;
}

function verifyCore<C extends CoreClaims>(
  token: string,
  config: CoreVerifierConfig,
  expectedAudience: string,
  parse: (parsed: ParsedCompactJwt) => C,
): { claims: C; keyId: string; expiresAt: Date } {
  validateCoreConfig(config);

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

  const claims = parse(parsed);

  if (claims.iss !== config.issuer) {
    fail("ISSUER_MISMATCH", "Service credential issuer is not trusted");
  }
  if (claims.aud !== expectedAudience) {
    fail("AUDIENCE_MISMATCH", "Service credential audience is not accepted by this verifier");
  }

  const nowSeconds = Math.floor((config.now?.() ?? new Date()).getTime() / 1000);
  if (!Number.isFinite(nowSeconds)) {
    fail("INVALID_VERIFIER_CONFIG", "Verifier clock must provide a valid time");
  }
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
  const maxTtl = config.maxTtlSeconds ?? MAX_SERVICE_CREDENTIAL_TTL_SECONDS;
  if (claims.exp - claims.iat > maxTtl) {
    fail("TTL_EXCEEDED", "Service credential lifetime exceeds the verifier limit");
  }

  return {
    claims,
    keyId: header.kid,
    expiresAt: new Date(claims.exp * 1000),
  };
}

export function verifyServiceCredential(
  token: string,
  config: ServiceCredentialVerifierConfig,
): VerifiedServiceCredential {
  validateConfig(config);
  const verified = verifyCore(token, config, config.audience, parseClaims);

  if (verified.claims.aud === CLOUD_RELAY_TRANSPORT_AUDIENCE) {
    if (config.expectedRelay !== undefined) {
      if (
        verified.claims.relay.room !== config.expectedRelay.room ||
        verified.claims.relay.role !== config.expectedRelay.role
      ) {
        fail("RELAY_CONTEXT_MISMATCH", "Relay ticket does not match the requested connection");
      }
    }
  }

  return verified;
}

export function verifyApplicationServiceCredential(
  token: string,
  config: ApplicationServiceVerifierConfig,
): VerifiedApplicationServiceCredential {
  validateApplicationConfig(config);
  const expected = config.expectedApplication;
  const verified = verifyCore(token, config, expected.resource, parseApplicationClaims);
  if (
    verified.claims.app_id !== expected.appId ||
    verified.claims.service_id !== expected.serviceId ||
    verified.claims.resource !== expected.resource
  ) {
    fail(
      "APPLICATION_MISMATCH",
      "Service credential does not belong to the expected application service",
    );
  }
  return verified;
}
