import { loadConfig } from "./config.js";
import { openDatabase } from "./storage/database.js";

const config = loadConfig();
const db = openDatabase({ databasePath: config.databasePath });
db.close();
console.log("Migrations applied.");
