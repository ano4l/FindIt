// Writes a consistent copy of the database plus the uploaded photos.
// Schedule it (cron / hosting scheduler), e.g. nightly, and copy the results off the server.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.env.FINDIT_BACKUP_DIR || resolve(here, "backups");
const uploads = process.env.FINDIT_UPLOADS || resolve(here, "data/uploads");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = resolve(dir, `findit-${stamp}.db`);
openDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
console.log(`Database backup written: ${file}`);
if (existsSync(uploads)) {
  const target = resolve(dir, `uploads-${stamp}`);
  cpSync(uploads, target, { recursive: true });
  console.log(`Photo backup written: ${target}`);
}
