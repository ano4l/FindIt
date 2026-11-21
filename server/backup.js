// Exports every table to a timestamped JSON file on this computer: `pnpm backup`.
// The hosted site also saves a copy to a private Supabase Storage bucket every night (/api/cron/backup);
// this command is for an extra copy on demand, e.g. before a risky change. Photos aren't included.
// The file contains password hashes and email addresses: store it somewhere private.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKUP_TABLES, exportTables } from "./db.js";
import { openScriptDb } from "./cli.js";

const dir = process.env.FINDIT_BACKUP_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "backups");
mkdirSync(dir, { recursive: true });
const db = await openScriptDb();
const data = await exportTables(db);
const file = resolve(dir, `findit-${data.exportedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`Backup written: ${file} (${BACKUP_TABLES.map((t) => `${t}: ${data.tables[t].length}`).join(", ")})`);
await db.close();
