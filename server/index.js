import { openDb, seedLocators } from "./db.js";
import { createApp } from "./app.js";
import { hashPassword } from "./security.js";

const db = openDb();
const seeded = seedLocators(db);
if (seeded) console.log(`Loaded ${seeded} sample locator profiles.`);

// Optional first staff account: set ADMIN_EMAIL and ADMIN_PASSWORD, or run `pnpm staff`.
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD && !db.prepare("SELECT 1 FROM users WHERE email = ?").get(ADMIN_EMAIL.toLowerCase())) {
  db.prepare("INSERT INTO users (email, name, password_hash, role, email_verified) VALUES (?,?,?,?,1)")
    .run(ADMIN_EMAIL.toLowerCase(), "FindIt staff", hashPassword(ADMIN_PASSWORD), "staff");
  console.log(`Created staff account ${ADMIN_EMAIL}.`);
}

const port = Number(process.env.PORT || 3001);
createApp(db).listen(port, () => console.log(`FindIt API listening on :${port}`));
