// Database access for FindIt.
//
// Production uses Supabase Postgres through postgres.js (DATABASE_URL). Local development and the
// tests use PGlite, an in-process Postgres, so the same SQL runs everywhere and nothing needs
// installing. Queries are written with `?` placeholders; they are numbered ($1, $2, …) here.
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, "migrations");

const numbered = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
// Timestamps come back as Date objects; the app works with ISO strings.
const plain = (row) => {
  if (row) for (const k of Object.keys(row)) if (row[k] instanceof Date) row[k] = row[k].toISOString();
  return row;
};

function wrap(driver) {
  return {
    kind: driver.kind,
    all: async (sql, ...params) => (await driver.query(numbered(sql), params)).rows.map(plain),
    get: async (sql, ...params) => plain((await driver.query(numbered(sql), params)).rows[0]),
    run: async (sql, ...params) => {
      const r = await driver.query(numbered(sql), params);
      return { changes: r.count, rows: r.rows.map(plain) };
    },
    // Several statements, no parameters (migrations).
    exec: (sql) => driver.exec(sql),
    transaction: (fn) => driver.transaction((d) => fn(wrap(d))),
    close: () => driver.close?.(),
  };
}

async function postgresDriver(url) {
  const { default: postgres } = await import("postgres");
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  const sql = postgres(url, {
    // Supabase's transaction pooler (port 6543) doesn't keep prepared statements.
    prepare: false,
    max: Number(process.env.DB_POOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 10,
    ...(/sslmode=/.test(url) ? {} : { ssl: local ? false : "require" }),
    onnotice: () => {},
  });
  const make = (s) => ({
    kind: "postgres",
    query: async (text, params) => {
      const r = await s.unsafe(text, params);
      return { rows: Array.from(r), count: r.count ?? 0 };
    },
    exec: (text) => s.unsafe(text),
    transaction: (fn) => s.begin((tx) => fn(make(tx))),
    close: () => s.end?.({ timeout: 5 }),
  });
  return make(sql);
}

async function pgliteDriver(dataDir) {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create(dataDir);
  const make = (c) => ({
    kind: "pglite",
    query: async (text, params) => {
      const r = await c.query(text, params);
      return { rows: r.rows, count: r.affectedRows ?? 0 };
    },
    exec: (text) => c.exec(text),
    transaction: (fn) => c.transaction((tx) => fn(make(tx))),
    close: () => c.close?.(),
  });
  return make(pg);
}

/**
 * Opens the database.
 * - A postgres:// URL (Supabase) uses postgres.js.
 * - "memory" uses a throwaway in-process PGlite database (tests).
 * - Otherwise a PGlite database stored in FINDIT_PGLITE_DIR (default server/data/pglite) for local development.
 */
export async function openDb(url = process.env.DATABASE_URL) {
  if (url && /^postgres(ql)?:\/\//i.test(url)) return wrap(await postgresDriver(url));
  if (process.env.VERCEL) throw new Error("DATABASE_URL must be set to the Supabase connection string.");
  if (url === "memory") return wrap(await pgliteDriver());
  return wrap(await pgliteDriver(process.env.FINDIT_PGLITE_DIR || resolve(here, "data/pglite")));
}

// The tables worth keeping, in the order they must be restored (a row's references come first).
// Sessions, email links, rate limits and the mail log are left out: they are short-lived.
export const BACKUP_TABLES = ["users", "locators", "properties", "favourites", "property_favourites", "reports", "contact_messages", "audit_log"];

// Reads every backed-up table at one moment in time, so rows never point at something the copy lacks.
export function exportTables(db) {
  return db.transaction(async (tx) => {
    await tx.exec("set transaction isolation level repeatable read read only");
    const data = { exportedAt: new Date().toISOString(), tables: {} };
    for (const t of BACKUP_TABLES) data.tables[t] = await tx.all(`select * from ${t} order by 1`);
    return data;
  });
}

// Loads an export made by exportTables into a database whose tables exist but are empty.
export function restoreTables(db, data) {
  return db.transaction(async (tx) => {
    for (const t of BACKUP_TABLES) {
      if (await tx.get(`select 1 as found from ${t} limit 1`)) throw new Error(`The "${t}" table already has rows. A backup can only be restored into an empty database.`);
    }
    const counts = {};
    for (const t of BACKUP_TABLES) {
      const rows = data?.tables?.[t] || [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.some((c) => !/^[a-z_][a-z0-9_]*$/.test(c))) throw new Error(`Unexpected column name in the "${t}" backup.`);
        await tx.run(`insert into ${t} (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")})`, ...cols.map((c) => row[c]));
      }
      counts[t] = rows.length;
    }
    // Ids were copied as they were, so move each id counter past the highest one in use.
    const identities = await tx.all("select table_name, column_name from information_schema.columns where table_schema = 'public' and is_identity = 'YES'");
    for (const { table_name: t, column_name: c } of identities) {
      if (BACKUP_TABLES.includes(t)) await tx.get(`select setval(pg_get_serial_sequence('${t}', '${c}'), greatest((select coalesce(max(${c}), 0) from ${t}), 1))`);
    }
    return counts;
  });
}

// Applies any SQL files in server/migrations that haven't run yet, each in its own transaction.
export async function migrate(db) {
  await db.exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());
    alter table schema_migrations enable row level security;`);
  const applied = [];
  for (const name of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const ran = await db.transaction(async (tx) => {
      await tx.get("select pg_advisory_xact_lock(724001)"); // one migrator at a time
      if (await tx.get("select 1 from schema_migrations where name = ?", name)) return false;
      await tx.exec(readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"));
      await tx.run("insert into schema_migrations (name) values (?)", name);
      return true;
    });
    if (ran) applied.push(name);
  }
  return applied;
}

// Removes expired sessions and email links, old rate-limit windows and old dev mail. Safe to run any time.
export async function pruneExpired(db) {
  const n = async (sql) => (await db.run(sql)).changes;
  return {
    sessions: await n("delete from sessions where expires_at <= now()"),
    tokens: await n("delete from tokens where expires_at <= now()"),
    rateLimits: await n("delete from rate_limits where window_start < now() - interval '1 day'"),
    outbox: await n("delete from outbox where created_at < now() - interval '30 days'"),
  };
}

export async function seedLocators(db) {
  if ((await db.get("select count(*)::int as n from locators")).n > 0) return 0;
  const seed = JSON.parse(readFileSync(resolve(here, "seed-locators.json"), "utf8"));
  for (const l of seed) {
    await db.run(`insert into locators
      (id,name,company,area,radius,years,response,tags,about,image,service_areas,zip_codes,languages,
       rating,reviews,featured,fast_response,verified,listings_url,source,status)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published')`,
      l.id, l.name, l.company, l.area, l.radius, l.years, l.response,
      JSON.stringify(l.tags), l.about, l.image, JSON.stringify(l.serviceAreas),
      JSON.stringify(l.zipCodes), JSON.stringify(l.languages || []), l.rating, l.reviews,
      !!l.featured, !!l.fastResponse, !!l.verified, l.listingsUrl, "Sample data");
  }
  return seed.length;
}

// Sample listings are clearly labelled "Sample data". Dates are relative to when the seed runs
// so the demo always shows a realistic mix of fresh and stale availability.
export async function seedProperties(db, now = Date.now()) {
  if ((await db.get("select count(*)::int as n from properties")).n > 0) return 0;
  const seed = JSON.parse(readFileSync(resolve(here, "seed-properties.json"), "utf8"));
  const day = 86400000;
  const date = (offsetDays) => new Date(now + offsetDays * day).toISOString().slice(0, 10);
  const locatorIds = new Set((await db.all("select id from locators")).map((r) => r.id));
  for (const p of seed) {
    // Same key order the API writes, so an unchanged edit isn't seen as a change.
    const plans = p.floorPlans.map(({ name, beds, baths, sqft, rentMin, rentMax, availableInDays, units }) => ({
      name, beds, baths, sqft, rentMin, rentMax, availableFrom: availableInDays == null ? "" : date(availableInDays), units,
    }));
    const checked = new Date(now - p.checkedDaysAgo * day).toISOString();
    await db.run(`insert into properties
      (id,name,address,neighborhood,city,zip,description,floor_plans,amenities,photos,parking,pets,pet_details,
       incentives,lease_terms,contact_name,contact_phone,contact_email,website_url,tour_url,locator_id,
       availability,availability_note,availability_checked_at,source,featured,status,updated_at)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::timestamptz,?,?,'published',?::timestamptz)`,
      p.id, p.name, p.address, p.neighborhood, p.city || "Houston", p.zip, p.description,
      JSON.stringify(plans), JSON.stringify(p.amenities), JSON.stringify(p.photos), p.parking || "",
      p.pets || "unknown", p.petDetails || "", p.incentives || "", p.leaseTerms || "",
      p.contactName || "", p.contactPhone || "", p.contactEmail || "", p.websiteUrl || "", p.tourUrl || "",
      locatorIds.has(p.locatorId) ? p.locatorId : null,
      p.availability, p.availabilityNote || "", checked, "Sample data", !!p.featured, checked);
  }
  return seed.length;
}
