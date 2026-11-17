// Usage: pnpm staff you@example.com 'a long password' "Full Name"
import { openDb } from "./db.js";
import { hashPassword } from "./security.js";
const [email, password, name = "FindIt staff"] = process.argv.slice(2);
if (!email || !password || password.length < 8) { console.error("Usage: pnpm staff <email> <password (8+ chars)> [name]"); process.exit(1); }
const db = openDb();
const e = email.toLowerCase();
const u = db.prepare("SELECT id FROM users WHERE email = ?").get(e);
if (u) db.prepare("UPDATE users SET role='staff', email_verified=1, password_hash=? WHERE id=?").run(hashPassword(password), u.id);
else db.prepare("INSERT INTO users (email,name,password_hash,role,email_verified) VALUES (?,?,?,'staff',1)").run(e, name, hashPassword(password));
console.log(`Staff account ready: ${e}`);
