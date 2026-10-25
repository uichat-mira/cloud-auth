import { KeyObject, createPrivateKey, createPublicKey } from "node:crypto";
import {
  serviceCredentialJwksSchema,
  serviceCredentialJwtHeaderSchema,
  serviceCredentialPublicJwkSchema,
  type ServiceCredentialJwks,
} from "@uichat-mira/cloud-auth-contracts";
import {
  MAX_SERVICE_CREDENTIAL_TTL_SECONDS,
  type ServiceCredentialSignerConfig,
} from "./signer.js";

export interface ServiceCredentialRetiringKeyMaterial {
  keyId: string;
  publicKey: string;
}

export interface ServiceCredentialKeyMaterialConfig {
  activeKeyId: string;
  activePrivateKey: string;
  retiringPublicKeys: readonly ServiceCredentialRetiringKeyMaterial[];
  ttlSeconds: number;
}

export interface ServiceCredentialKeyRing {
  readonly activeKeyId: string;
  readonly ttlSeconds: number;
  readonly signer: ServiceCredentialSignerConfig;
  readonly jwks: ServiceCredentialJwks;
}

function normalizePem(input: string): string {
  return input.includes("\\n") ? input.replace(/\\n/g, "\n") : input;
}

function resolveEd25519PrivateKey(input: string): KeyObject | null {
  try {
    const key = createPrivateKey(normalizePem(input));
    if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") return null;
    return key;
  } catch {
    return null;
  }
}

function resolveEd25519PublicKey(input: string): KeyObject | null {
  // createPublicKey() also accepts private PEM and derives its public part.
  // These JWKS-only slots must never retain private signing material.
  const pem = normalizePem(input).trim();
  if (!pem.startsWith("-----BEGIN PUBLIC KEY-----") ||
      !pem.endsWith("-----END PUBLIC KEY-----")) {
    return null;
  }
  try {
    const key = createPublicKey(pem);
    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") return null;
    return key;
  } catch {
    return null;
  }
}

function publicJwk(keyId: string, key: KeyObject) {
  const exported = key.export({ format: "jwk" });
  const parsed = serviceCredentialPublicJwkSchema.safeParse({
    kty: exported.kty,
    crv: exported.crv,
    use: "sig",
    alg: "EdDSA",
    kid: keyId,
    x: exported.x,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Builds an explicit, injected V0 key ring. Invalid or incomplete material
 * returns null so issuance and JWKS fail closed without disabling account login.
 */
export function createServiceCredentialKeyRing(
  config: ServiceCredentialKeyMaterialConfig | null,
): ServiceCredentialKeyRing | null {
  if (!config) return null;

  if (
    !Number.isInteger(config.ttlSeconds) ||
    config.ttlSeconds <= 0 ||
    config.ttlSeconds > MAX_SERVICE_CREDENTIAL_TTL_SECONDS
  ) {
    return null;
  }

  if (!serviceCredentialJwtHeaderSchema.safeParse({
    alg: "EdDSA",
    typ: "JWT",
    kid: config.activeKeyId,
  }).success) {
    return null;
  }

  const privateKey = resolveEd25519PrivateKey(config.activePrivateKey);
  if (!privateKey) return null;

  const activeJwk = publicJwk(config.activeKeyId, createPublicKey(privateKey));
  if (!activeJwk) return null;

  const keys = [activeJwk];
  const seen = new Set([config.activeKeyId]);

  for (const retiring of config.retiringPublicKeys) {
    if (
      !serviceCredentialJwtHeaderSchema.safeParse({
        alg: "EdDSA",
        typ: "JWT",
        kid: retiring.keyId,
      }).success
    ) {
      return null;
    }
    if (seen.has(retiring.keyId)) return null;
    seen.add(retiring.keyId);

    const publicKey = resolveEd25519PublicKey(retiring.publicKey);
    if (!publicKey) return null;
    const jwk = publicJwk(retiring.keyId, publicKey);
    if (!jwk) return null;
    keys.push(jwk);
  }

  const jwks = serviceCredentialJwksSchema.parse({ keys });

  return {
    activeKeyId: config.activeKeyId,
    ttlSeconds: config.ttlSeconds,
    signer: {
      privateKey,
      keyId: config.activeKeyId,
      ttlSeconds: config.ttlSeconds,
    },
    jwks,
  };
}
