// Local server: runs the API (and the built site, if present) as one long-running process.
// On Vercel the API runs from api/index.js instead.
import { openDb, migrate, seedLocators, seedProperties, pruneExpired } from "./db.js";
import { createApp } from "./app.js";
import { hashPassword } from "./security.js";

const db = await openDb();
const applied = await migrate(db);
if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);

// Sample content loads automatically only into the local PGlite database. Use `pnpm db:seed` for Supabase.
if (db.kind === "pglite" || process.env.FINDIT_SEED === "true") {
  const locators = await seedLocators(db);
  if (locators) console.log(`Loaded ${locators} sample locator profiles.`);
  const properties = await seedProperties(db);
  if (properties) console.log(`Loaded ${properties} sample apartment listings.`);
}

// Optional first staff account: set ADMIN_EMAIL and ADMIN_PASSWORD, or run `pnpm staff`.
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD && !(await db.get("select 1 from users where email = ?", ADMIN_EMAIL.toLowerCase()))) {
  await db.run("insert into users (email, name, password_hash, role, email_verified) values (?,?,?,'staff',true)",
    ADMIN_EMAIL.toLowerCase(), "FindIt staff", hashPassword(ADMIN_PASSWORD));
  console.log(`Created staff account ${ADMIN_EMAIL}.`);
}

// Clear out expired sessions and email links now and every hour (Vercel uses a daily cron instead).
await pruneExpired(db);
setInterval(() => pruneExpired(db).catch((e) => console.error(e)), 60 * 60000).unref();

const port = Number(process.env.PORT || 3001);
createApp(db).listen(port, () => console.log(`FindIt API listening on :${port} (${db.kind} database)`));
