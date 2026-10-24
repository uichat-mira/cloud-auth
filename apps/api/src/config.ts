export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  logLevel: string;
  sessionTtlSeconds: number;
  passwordMaxConcurrency: number;
  loginPerUsernamePerMinute: number;
  loginPerIpPerMinute: number;
  argon2MemoryKiB: number;
  argon2Passes: number;
  argon2Parallelism: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = readInteger(env, "PORT", 8788, 1, 65_535);
  const sessionTtlSeconds = readInteger(env, "MIRA_AUTH_SESSION_TTL_SECONDS", 2_592_000, 3_600, 7_776_000);
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
    passwordMaxConcurrency,
    loginPerUsernamePerMinute,
    loginPerIpPerMinute,
    argon2MemoryKiB,
    argon2Passes,
    argon2Parallelism,
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

