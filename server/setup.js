// Prepares a database and storage: `pnpm db:setup`.
// Applies pending migrations and, when Supabase is configured, creates the public photo bucket and the
// private bucket for nightly backups. Safe to run again at any time.
import { migrate } from "./db.js";
import { openScriptDb } from "./cli.js";
import { createStorage } from "./storage.js";

const db = await openScriptDb();
const applied = await migrate(db);
console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database schema is up to date.");
await db.close();

const storage = createStorage({ uploadsDir: "" });
if (storage.kind === "supabase") {
  console.log(`Photo bucket "${storage.bucket}" (public): ${await storage.ensureBucket()}.`);
  console.log(`Backup bucket "${storage.backupBucket}" (private): ${await storage.ensureBackupBucket()}.`);
} else if (process.env.SUPABASE_URL) {
  console.error("SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY isn't, so the storage buckets weren't created. Add the secret key to .env and run this again.");
  process.exit(1);
} else console.log("Supabase Storage isn't configured; photos will be stored locally and there are no nightly backups.");
