import { openDb, seedLocators, seedProperties, pruneExpired } from "./db.js";
import { createApp } from "./app.js";
import { hashPassword } from "./security.js";

const db = openDb();
const seededLocators = seedLocators(db);
if (seededLocators) console.log(`Loaded ${seededLocators} sample locator profiles.`);
const seededProperties = seedProperties(db);
if (seededProperties) console.log(`Loaded ${seededProperties} sample apartment listings.`);

// Optional first staff account: set ADMIN_EMAIL and ADMIN_PASSWORD, or run `pnpm staff`.
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD && !db.prepare("SELECT 1 FROM users WHERE email = ?").get(ADMIN_EMAIL.toLowerCase())) {
  db.prepare("INSERT INTO users (email, name, password_hash, role, email_verified) VALUES (?,?,?,?,1)")
    .run(ADMIN_EMAIL.toLowerCase(), "FindIt staff", hashPassword(ADMIN_PASSWORD), "staff");
  console.log(`Created staff account ${ADMIN_EMAIL}.`);
}

// Clear out expired sessions and email links now and every hour.
pruneExpired(db);
setInterval(() => pruneExpired(db), 60 * 60000).unref();

const port = Number(process.env.PORT || 3001);
createApp(db).listen(port, () => console.log(`FindIt API listening on :${port}`));
