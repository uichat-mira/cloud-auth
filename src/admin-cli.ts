import { readFileSync } from "node:fs";
import { loadConfig } from "./config.js";
import { openDatabase } from "./storage/database.js";
import { AuthRepository } from "./auth/auth-repository.js";
import { AuthService, AuthError } from "./auth/auth-service.js";
import { PasswordHasher } from "./security/password.js";
import { LoginGuard } from "./security/login-guard.js";

const [, , command, username] = process.argv;

if (!command || !username) {
  printUsageAndExit();
}

const config = loadConfig();
const db = openDatabase({ databasePath: config.databasePath });
const repository = new AuthRepository(db);
const hasher = new PasswordHasher({
  memoryKiB: config.argon2MemoryKiB,
  passes: config.argon2Passes,
  parallelism: config.argon2Parallelism,
  tagLength: 32,
});
const service = new AuthService(
  repository,
  hasher,
  new LoginGuard({
    maxConcurrentHashes: config.passwordMaxConcurrency,
    perUsernamePerMinute: config.loginPerUsernamePerMinute,
    perIpPerMinute: config.loginPerIpPerMinute,
  }),
  { sessionTtlSeconds: config.sessionTtlSeconds },
);

try {
  switch (command) {
    case "provision": {
      const password = readPasswordFromStdin();
      const account = await service.provisionAccount(username, password);
      console.log(JSON.stringify({ id: account.id, username: account.username, allowed: account.isAllowed }));
      break;
    }
    case "reset-password":
      await service.resetPassword(username, readPasswordFromStdin());
      console.log(JSON.stringify({ username, passwordReset: true, sessionsRevoked: true }));
      break;
    case "allow":
      service.setAllowed(username, true);
      console.log(JSON.stringify({ username, allowed: true }));
      break;
    case "deny":
      service.setAllowed(username, false);
      console.log(JSON.stringify({ username, allowed: false, sessionsRevoked: true }));
      break;
    case "enable":
      service.setDisabled(username, false);
      console.log(JSON.stringify({ username, disabled: false }));
      break;
    case "disable":
      service.setDisabled(username, true);
      console.log(JSON.stringify({ username, disabled: true, sessionsRevoked: true }));
      break;
    default:
      printUsageAndExit();
  }
} catch (error) {
  if (error instanceof AuthError) {
    console.error(`${error.code}: ${error.message}`);
    process.exitCode = 2;
  } else {
    console.error("Admin operation failed");
    process.exitCode = 1;
  }
} finally {
  db.close();
}

function readPasswordFromStdin(): string {
  if (process.stdin.isTTY) {
    console.error("Password must be provided on stdin; plaintext command-line password arguments are not supported.");
    process.exit(2);
  }
  return readFileSync(0, "utf8");
}

function printUsageAndExit(): never {
  console.error(
    "Usage: npm run admin -- <provision|reset-password|allow|deny|enable|disable> <username>\n" +
      "provision/reset-password read the password from stdin.",
  );
  process.exit(2);
}
