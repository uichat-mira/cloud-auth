import { mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const source = resolve(process.env.MIRA_AUTH_DB_PATH ?? "./data/auth.sqlite");
const backupDir = resolve(process.env.MIRA_AUTH_BACKUP_DIR ?? "./backups");
mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = resolve(backupDir, basename(source) + "." + stamp + ".backup.sqlite");

const db = new DatabaseSync(source);
db.exec("PRAGMA wal_checkpoint(PASSIVE);");
const escaped = target.replaceAll("'", "''");
db.exec("VACUUM INTO '" + escaped + "'");
db.close();

console.log(target);
console.error("Created consistent SQLite snapshot in " + dirname(target) + ". Copy this artifact to the configured external/object-storage backup target using infrastructure-owned credentials.");
