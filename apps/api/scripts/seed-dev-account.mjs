#!/usr/bin/env node
/**
 * Seed the local development Cloud Account from the gitignored repo-root .env.
 *
 * This is local tooling only. It never prints the password and it never accepts
 * one on the command line: the password travels over stdin to admin-cli, which
 * is the same contract maintainers use in production.
 *
 * Idempotent: provisions the account when it does not exist, otherwise resets
 * its password, then guarantees the account is allowed and enabled so that a
 * documented local login always works.
 *
 * Usage (from the repository root):  pnpm run seed:dev
 * Requires Node >= 24 because admin-cli needs node:sqlite and crypto.argon2.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(apiRoot, "..", "..");
const envPath = join(repoRoot, ".env");

// Mirror the API's own password floor (apps/api/src/security/password.ts).
const MIN_PASSWORD_CODE_POINTS = 15;

if (!existsSync(envPath)) {
  fail(`missing ${envPath}; copy .env.example and set MIRA_AUTH_SEED_USERNAME / MIRA_AUTH_SEED_PASSWORD`);
}

// Explicit process env wins over the file, matching Node's --env-file behavior.
if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const username = (process.env.MIRA_AUTH_SEED_USERNAME ?? "").trim();
const password = process.env.MIRA_AUTH_SEED_PASSWORD ?? "";

if (username === "") {
  fail("MIRA_AUTH_SEED_USERNAME is empty in .env");
}
if ([...password].length < MIN_PASSWORD_CODE_POINTS) {
  fail(
    `MIRA_AUTH_SEED_PASSWORD must be at least ${MIN_PASSWORD_CODE_POINTS} characters ` +
      `(current length: ${[...password].length})`,
  );
}

const databasePath = process.env.MIRA_AUTH_DB_PATH ?? "./data/auth.sqlite";
const resolvedDatabase = resolve(apiRoot, databasePath);

// admin-cli resolves the database path against its own cwd (apps/api), which is
// also the API dev server cwd, so both processes agree on one SQLite file.
const env = { ...process.env };
delete env.NODE_OPTIONS; // avoid colored/telemetry wrappers polluting stderr parsing

const provision = run("provision", password);

let action;
if (provision.status === 0) {
  action = "provisioned";
} else if (provision.status === 2 && provision.stderr.includes("AUTH_ACCOUNT_EXISTS")) {
  const reset = run("reset-password", password);
  if (reset.status !== 0) failUsage(`reset-password failed for ${username}`, reset);
  action = "password reset";
} else {
  failUsage(`provision failed for ${username}`, provision);
}

// provision defaults to allowed, but a previously denied/disabled account would
// still refuse login; normalize both flags so the seed is always usable.
for (const command of ["allow", "enable"]) {
  const result = run(command, "");
  if (result.status !== 0) failUsage(`${command} failed for ${username}`, result);
}

console.log(
  JSON.stringify(
    {
      username,
      action,
      allowed: true,
      disabled: false,
      passwordSource: "MIRA_AUTH_SEED_PASSWORD (.env)",
      database: resolvedDatabase,
    },
    null,
    2,
  ),
);
console.log("Seed account ready. Password is not printed by design.");

function run(command, input) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/admin-cli.ts", command, username],
    { cwd: apiRoot, env, input, encoding: "utf8" },
  );
}

function failUsage(message, result) {
  const detail = (result.stderr || result.stdout || "").trim();
  fail(`${message}\n${detail}`.trim());
}

function fail(message) {
  console.error(`seed:dev: ${message}`);
  process.exit(1);
}
