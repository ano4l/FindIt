// Shared by the command-line scripts (db:setup, db:seed, staff, backup), which read a local .env file.
// Says which database a script is about to change, and stops instead of quietly using the local
// database when Supabase is only half configured.
import { openDb } from "./db.js";

export async function openScriptDb() {
  const url = process.env.DATABASE_URL;
  if (!url && process.env.SUPABASE_URL) {
    console.error("SUPABASE_URL is set but DATABASE_URL isn't. Add the Supabase Transaction pooler connection string to .env (see .env.example).");
    process.exit(1);
  }
  const db = await openDb(url);
  console.log(url ? `Database: Postgres at ${url.split("@").pop().split(/[/?]/)[0]}` : "Database: local PGlite (DATABASE_URL isn't set)");
  return db;
}
