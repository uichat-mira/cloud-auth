import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { AuthRepository } from "../../src/auth/auth-repository.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { LoginGuard } from "../../src/security/login-guard.js";
import { PasswordHasher } from "../../src/security/password.js";
import { openDatabase } from "../../src/storage/database.js";

export interface TestAuthContext {
  db: DatabaseSync;
  repository: AuthRepository;
  service: AuthService;
}

export function createTestAuth(databasePath: string): TestAuthContext {
  const db = openDatabase({
    databasePath,
    migrationsPath: join(process.cwd(), "migrations"),
  });
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
  return { db, repository, service };
}
