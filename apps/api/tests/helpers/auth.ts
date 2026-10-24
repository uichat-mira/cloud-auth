import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { AuthRepository } from "../../src/auth/auth-repository.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { DeviceRepository } from "../../src/devices/device-repository.js";
import { DeviceService } from "../../src/devices/device-service.js";
import { LoginGuard } from "../../src/security/login-guard.js";
import { PasswordHasher } from "../../src/security/password.js";
import { openDatabase } from "../../src/storage/database.js";

export interface TestAuthContext {
  db: DatabaseSync;
  repository: AuthRepository;
  service: AuthService;
  deviceService: DeviceService;
}

export function createTestAuth(
  databasePath: string,
  migrationsPath = join(process.cwd(), "migrations"),
): TestAuthContext {
  const db = openDatabase({ databasePath, migrationsPath });
  const repository = new AuthRepository(db);
  const service = new AuthService(
    repository,
    new PasswordHasher(),
    new LoginGuard({
      maxConcurrentHashes: 2,
      perUsernamePerMinute: 50,
      perIpPerMinute: 100,
    }),
    { sessionTtlSeconds: 3600 },
  );
  const deviceService = new DeviceService(new DeviceRepository(db), service);
  return { db, repository, service, deviceService };
}
