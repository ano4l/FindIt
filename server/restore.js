// Loads a backup into an empty database: `pnpm restore path/to/backup.json` (or a nightly .json.gz file
// downloaded from the private "findit-backups" bucket in Supabase Storage).
// It refuses to run if the database already has accounts, listings or any other backed-up rows.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { migrate, restoreTables } from "./db.js";
import { openScriptDb } from "./cli.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: pnpm restore <backup.json | backup.json.gz>");
  process.exit(1);
}
const raw = readFileSync(file);
const data = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
const db = await openScriptDb();
await migrate(db);
try {
  const counts = await restoreTables(db, data);
  console.log(`Restored the backup from ${data.exportedAt}: ${Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join(", ")}`);
} catch (e) {
  console.error(`Nothing was restored. ${e.message}`);
  process.exitCode = 1;
}
await db.close();
