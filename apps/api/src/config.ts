import {
  OAUTH_AUTHORIZATION_CODE_DEFAULT_TTL_SECONDS,
  OAUTH_AUTHORIZATION_CODE_MAX_TTL_SECONDS,
} from "@uichat-mira/cloud-auth-contracts";
import { MAX_SERVICE_CREDENTIAL_TTL_SECONDS } from "./service-credentials/signer.js";
import type {
  ServiceCredentialKeyMaterialConfig,
  ServiceCredentialRetiringKeyMaterial,
} from "./service-credentials/keyring.js";

const DEFAULT_SERVICE_CREDENTIAL_TTL_SECONDS = 300;
const OAUTH_AUTHORIZATION_CODE_MIN_TTL_SECONDS = 60;
const SERVICE_CREDENTIAL_KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  logLevel: string;
  sessionTtlSeconds: number;
  oauthAuthorizationCodeTtlSeconds: number;
  passwordMaxConcurrency: number;
  loginPerUsernamePerMinute: number;
  loginPerIpPerMinute: number;
  argon2MemoryKiB: number;
  argon2Passes: number;
  argon2Parallelism: number;
  serviceCredentials: ServiceCredentialKeyMaterialConfig | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = readInteger(env, "PORT", 8788, 1, 65_535);
  const sessionTtlSeconds = readInteger(env, "MIRA_AUTH_SESSION_TTL_SECONDS", 2_592_000, 3_600, 7_776_000);
  const oauthAuthorizationCodeTtlSeconds = readInteger(
    env,
    "MIRA_AUTH_OAUTH_CODE_TTL_SECONDS",
    OAUTH_AUTHORIZATION_CODE_DEFAULT_TTL_SECONDS,
    OAUTH_AUTHORIZATION_CODE_MIN_TTL_SECONDS,
    OAUTH_AUTHORIZATION_CODE_MAX_TTL_SECONDS,
  );
  const passwordMaxConcurrency = readInteger(env, "MIRA_AUTH_PASSWORD_MAX_CONCURRENCY", 2, 1, 4);
  const loginPerUsernamePerMinute = readInteger(env, "MIRA_AUTH_LOGIN_PER_USERNAME_PER_MINUTE", 5, 1, 60);
  const loginPerIpPerMinute = readInteger(env, "MIRA_AUTH_LOGIN_PER_IP_PER_MINUTE", 20, 1, 300);
  const argon2MemoryKiB = readInteger(env, "MIRA_AUTH_ARGON2_MEMORY_KIB", 19_456, 19_456, 262_144);
  const argon2Passes = readInteger(env, "MIRA_AUTH_ARGON2_PASSES", 2, 2, 10);
  const argon2Parallelism = readInteger(env, "MIRA_AUTH_ARGON2_PARALLELISM", 1, 1, 4);

  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    databasePath: env.MIRA_AUTH_DB_PATH ?? "./data/auth.sqlite",
    logLevel: env.LOG_LEVEL ?? "info",
    sessionTtlSeconds,
    oauthAuthorizationCodeTtlSeconds,
    passwordMaxConcurrency,
    loginPerUsernamePerMinute,
    loginPerIpPerMinute,
    argon2MemoryKiB,
    argon2Passes,
    argon2Parallelism,
    serviceCredentials: readServiceCredentialConfig(env),
  };
}

/**
 * Service-credential signing is optional. Missing or malformed material
 * disables issuance/JWKS (fail closed) without preventing account login,
 * /health, or /ready from starting.
 */
function readServiceCredentialConfig(
  env: NodeJS.ProcessEnv,
): ServiceCredentialKeyMaterialConfig | null {
  const activeKeyId = env.MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID?.trim();
  const activePrivateKey = env.MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_PRIVATE_KEY;
  const retiringRaw = env.MIRA_AUTH_SERVICE_CREDENTIAL_RETIRING_PUBLIC_KEYS?.trim();
  const ttlRaw = env.MIRA_AUTH_SERVICE_CREDENTIAL_TTL_SECONDS?.trim();

  const anyConfigured = Boolean(activeKeyId || activePrivateKey || retiringRaw || ttlRaw);
  if (!anyConfigured) return null;

  if (
    !activeKeyId ||
    !SERVICE_CREDENTIAL_KEY_ID_PATTERN.test(activeKeyId) ||
    !activePrivateKey ||
    activePrivateKey.trim().length === 0
  ) {
    return null;
  }

  let ttlSeconds = DEFAULT_SERVICE_CREDENTIAL_TTL_SECONDS;
  if (ttlRaw !== undefined && ttlRaw !== "") {
    const parsed = Number(ttlRaw);
    if (
      !Number.isInteger(parsed) ||
      parsed <= 0 ||
      parsed > MAX_SERVICE_CREDENTIAL_TTL_SECONDS
    ) {
      return null;
    }
    ttlSeconds = parsed;
  }

  let retiringPublicKeys: ServiceCredentialRetiringKeyMaterial[] = [];
  if (retiringRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(retiringRaw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const entries = Object.entries(parsed as Record<string, unknown>);
    const seen = new Set<string>();
    for (const [keyId, publicKey] of entries) {
      if (
        !SERVICE_CREDENTIAL_KEY_ID_PATTERN.test(keyId) ||
        typeof publicKey !== "string" ||
        publicKey.trim().length === 0 ||
        seen.has(keyId)
      ) {
        return null;
      }
      seen.add(keyId);
      retiringPublicKeys.push({ keyId, publicKey });
    }
  }

  return {
    activeKeyId,
    activePrivateKey,
    retiringPublicKeys,
    ttlSeconds,
  };
}

function readInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(env[key] ?? String(fallback));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

