export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? "8788");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    databasePath: env.MIRA_AUTH_DB_PATH ?? "./data/auth.sqlite",
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
