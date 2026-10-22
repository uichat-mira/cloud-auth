import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface OpenDatabaseOptions {
  databasePath: string;
  migrationsPath?: string;
}

export function openDatabase(options: OpenDatabaseOptions): DatabaseSync {
  mkdirSync(dirname(options.databasePath), { recursive: true });

  const db = new DatabaseSync(options.databasePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (" +
      "version TEXT PRIMARY KEY, " +
      "applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP" +
    ");"
  );

  applyMigrations(db, options.migrationsPath ?? join(process.cwd(), "migrations"));
  return db;
}

function applyMigrations(db: DatabaseSync, migrationsPath: string): void {
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => String(row.version)),
  );

  const migrations = readdirSync(migrationsPath)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();

  for (const migration of migrations) {
    if (applied.has(migration)) continue;

    const sql = readFileSync(join(migrationsPath, migration), "utf8");
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(version) VALUES (?)").run(migration);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
}
