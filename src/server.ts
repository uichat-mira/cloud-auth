import { buildApp } from "./app.js";
import { AuthRepository } from "./auth/auth-repository.js";
import { AuthService } from "./auth/auth-service.js";
import { loadConfig } from "./config.js";
import { LoginGuard } from "./security/login-guard.js";
import { PasswordHasher } from "./security/password.js";
import { openDatabase } from "./storage/database.js";

const config = loadConfig();
const db = openDatabase({ databasePath: config.databasePath });
const authService = new AuthService(
  new AuthRepository(db),
  new PasswordHasher({
    memoryKiB: config.argon2MemoryKiB,
    passes: config.argon2Passes,
    parallelism: config.argon2Parallelism,
    tagLength: 32,
  }),
  new LoginGuard({
    maxConcurrentHashes: config.passwordMaxConcurrency,
    perUsernamePerMinute: config.loginPerUsernamePerMinute,
    perIpPerMinute: config.loginPerIpPerMinute,
  }),
  { sessionTtlSeconds: config.sessionTtlSeconds },
);

const app = buildApp({
  db,
  authService,
  trustProxy: true,
  acceptanceUi: config.acceptanceUi,
  logger: {
    level: config.logLevel,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: "[REDACTED]",
    },
  },
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  db.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  db.close();
  process.exit(1);
}
