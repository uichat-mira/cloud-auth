import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./storage/database.js";

const config = loadConfig();
const db = openDatabase({ databasePath: config.databasePath });
const app = buildApp({
  db,
  logger: {
    level: config.logLevel,
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
