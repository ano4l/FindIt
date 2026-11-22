// Sets a new password for an existing account: pnpm set-password someone@example.com 'a new long password'
// For helping someone back into their account while password-reset emails are switched off. It keeps
// their role and saved places, and signs them out everywhere so only the new password works.
import { openScriptDb } from "./cli.js";
import { hashPassword } from "./security.js";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 12) {
  console.error("Usage: pnpm set-password <email> <new password (12+ chars)>");
  process.exit(1);
}
const db = await openScriptDb();
const e = email.toLowerCase();
const u = await db.get("select id from users where email = ?", e);
if (!u) {
  console.error(`No account uses ${e}. Nothing was changed.`);
  process.exitCode = 1;
} else {
  await db.run("update users set password_hash = ? where id = ?", hashPassword(password), u.id);
  await db.run("delete from sessions where user_id = ?", u.id);
  console.log(`Password updated for ${e}. They have been signed out everywhere.`);
}
await db.close();
