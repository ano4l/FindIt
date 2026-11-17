// Writes a consistent copy of the database. Schedule it (cron / hosting scheduler), e.g. nightly.
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
const dir = process.env.FINDIT_BACKUP_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "backups");
mkdirSync(dir, { recursive: true });
const file = resolve(dir, `findit-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
openDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
console.log(`Backup written: ${file}`);
