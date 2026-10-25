import { buildApp } from "./app.js";
import { AuthRepository } from "./auth/auth-repository.js";
import { AuthService } from "./auth/auth-service.js";
import { DeviceRepository } from "./devices/device-repository.js";
import { DeviceService } from "./devices/device-service.js";
import { HostRepository } from "./hosts/host-repository.js";
import { HostService } from "./hosts/host-service.js";
import { loadConfig } from "./config.js";
import { OAuthRepository } from "./oauth/oauth-repository.js";
import { OAuthService } from "./oauth/oauth-service.js";
import { LoginGuard } from "./security/login-guard.js";
import { PasswordHasher } from "./security/password.js";
import { createServiceCredentialKeyRing } from "./service-credentials/keyring.js";
import { ServiceCredentialService } from "./service-credentials/service.js";
import { openDatabase } from "./storage/database.js";

const config = loadConfig();
const db = openDatabase({ databasePath: config.databasePath });
const repository = new AuthRepository(db);
const authService = new AuthService(
  repository,
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
const deviceService = new DeviceService(new DeviceRepository(db), authService);
const hostService = new HostService(new HostRepository(db), authService, {
  leaseTtlSeconds: config.hostLeaseSeconds,
});
const oauthService = new OAuthService(new OAuthRepository(db), authService, {
  codeTtlSeconds: config.oauthAuthorizationCodeTtlSeconds,
  sessionTtlSeconds: config.sessionTtlSeconds,
});
const serviceCredentialService = new ServiceCredentialService(
  repository,
  createServiceCredentialKeyRing(config.serviceCredentials),
);

const app = buildApp({
  db,
  authService,
  deviceService,
  hostService,
  oauthService,
  serviceCredentialService,
  trustProxy: true,
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
