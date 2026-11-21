// Usage: pnpm staff you@example.com 'a long password' "Full Name"
// Uses DATABASE_URL (Supabase) from the environment or .env when set, otherwise the local PGlite database.
import { migrate } from "./db.js";
import { openScriptDb } from "./cli.js";
import { hashPassword } from "./security.js";

const [email, password, name = "FindIt staff"] = process.argv.slice(2);
if (!email || !password || password.length < 12) {
  console.error("Usage: pnpm staff <email> <password (12+ chars)> [name]");
  process.exit(1);
}
const db = await openScriptDb();
await migrate(db);
const e = email.toLowerCase();
const u = await db.get("select id from users where email = ?", e);
if (u) await db.run("update users set role = 'staff', email_verified = true, password_hash = ? where id = ?", hashPassword(password), u.id);
else await db.run("insert into users (email, name, password_hash, role, email_verified) values (?,?,?,'staff',true)", e, name, hashPassword(password));
console.log(`Staff account ready: ${e}`);
await db.close();
