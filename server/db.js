import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

export function openDb(path = process.env.FINDIT_DB || resolve(here, "data/findit.db")) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','staff')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      -- Reserved for Milestone 2 (paid memberships). Nothing reads this yet.
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL DEFAULT ${NOW}
    );
    CREATE TABLE IF NOT EXISTS tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('verify','reset')),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS locators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      radius TEXT NOT NULL DEFAULT '',
      years INTEGER,
      response TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      about TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      service_areas TEXT NOT NULL DEFAULT '[]',
      zip_codes TEXT NOT NULL DEFAULT '[]',
      languages TEXT NOT NULL DEFAULT '[]',
      contact_email TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      rating TEXT,
      reviews INTEGER,
      featured INTEGER NOT NULL DEFAULT 0,
      fast_response INTEGER NOT NULL DEFAULT 0,
      verified INTEGER NOT NULL DEFAULT 0,
      listings_url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'Not stated',
      status TEXT NOT NULL DEFAULT 'hidden' CHECK (status IN ('published','hidden','removed')),
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW},
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS favourites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      locator_id TEXT NOT NULL REFERENCES locators(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      PRIMARY KEY (user_id, locator_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locator_id TEXT NOT NULL REFERENCES locators(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
      created_at TEXT NOT NULL DEFAULT ${NOW},
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT
    );
    -- Development mail log: used when no SMTP_URL is configured.
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${NOW}
    );
    CREATE INDEX IF NOT EXISTS idx_locators_status ON locators(status);
  `);
  const columns = new Set(db.prepare("PRAGMA table_info(locators)").all().map((c) => c.name));
  if (!columns.has("contact_email")) db.exec("ALTER TABLE locators ADD COLUMN contact_email TEXT NOT NULL DEFAULT ''");
  if (!columns.has("contact_phone")) db.exec("ALTER TABLE locators ADD COLUMN contact_phone TEXT NOT NULL DEFAULT ''");
  migrate(db);
  return db;
}

// Numbered schema changes. PRAGMA user_version records the last one applied.
const MIGRATIONS = [
  // 1: property catalogue, saved properties, reports for either kind of record, staff activity log.
  `
  CREATE TABLE properties (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT 'Houston',
    zip TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    floor_plans TEXT NOT NULL DEFAULT '[]',
    amenities TEXT NOT NULL DEFAULT '[]',
    photos TEXT NOT NULL DEFAULT '[]',
    parking TEXT NOT NULL DEFAULT '',
    pets TEXT NOT NULL DEFAULT 'unknown' CHECK (pets IN ('dogs-and-cats','cats-only','none','unknown')),
    pet_details TEXT NOT NULL DEFAULT '',
    incentives TEXT NOT NULL DEFAULT '',
    lease_terms TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    website_url TEXT NOT NULL DEFAULT '',
    tour_url TEXT NOT NULL DEFAULT '',
    locator_id TEXT REFERENCES locators(id) ON DELETE SET NULL,
    availability TEXT NOT NULL DEFAULT 'unknown'
      CHECK (availability IN ('available','coming_soon','waitlist','unavailable','unknown')),
    availability_note TEXT NOT NULL DEFAULT '',
    availability_checked_at TEXT,
    source TEXT NOT NULL DEFAULT 'Not stated',
    featured INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'hidden' CHECK (status IN ('published','hidden','removed')),
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW},
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX idx_properties_status ON properties(status);
  CREATE TABLE property_favourites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (user_id, property_id)
  );
  CREATE TABLE reports_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    locator_id TEXT REFERENCES locators(id) ON DELETE CASCADE,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
    created_at TEXT NOT NULL DEFAULT ${NOW},
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TEXT,
    CHECK ((locator_id IS NULL) <> (property_id IS NULL))
  );
  INSERT INTO reports_v2 (id, locator_id, user_id, reason, details, status, created_at, resolved_by, resolved_at)
    SELECT id, locator_id, user_id, reason, details, status, created_at, resolved_by, resolved_at FROM reports;
  DROP TABLE reports;
  ALTER TABLE reports_v2 RENAME TO reports;
  CREATE INDEX idx_reports_status ON reports(status);
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);
  `,
];

function migrate(db) {
  const version = db.prepare("PRAGMA user_version").get().user_version;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

// Removes expired sessions and one-time tokens. Safe to run any time.
export function pruneExpired(db) {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM tokens WHERE expires_at <= ?").run(now);
}

export function seedLocators(db) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM locators").get();
  if (n > 0) return 0;
  const seed = JSON.parse(readFileSync(resolve(here, "seed-locators.json"), "utf8"));
  const insert = db.prepare(`INSERT INTO locators
    (id,name,company,area,radius,years,response,tags,about,image,service_areas,zip_codes,languages,
     rating,reviews,featured,fast_response,verified,listings_url,source,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published')`);
  for (const l of seed) {
    insert.run(l.id, l.name, l.company, l.area, l.radius, l.years, l.response,
      JSON.stringify(l.tags), l.about, l.image, JSON.stringify(l.serviceAreas),
      JSON.stringify(l.zipCodes), JSON.stringify(l.languages || []), l.rating, l.reviews,
      l.featured ? 1 : 0, l.fastResponse ? 1 : 0, l.verified ? 1 : 0, l.listingsUrl, "Sample data");
  }
  return seed.length;
}

// Sample listings are clearly labelled "Sample data". Dates are relative to when the seed runs
// so the demo always shows a realistic mix of fresh and stale availability.
export function seedProperties(db, now = Date.now()) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM properties").get();
  if (n > 0) return 0;
  const seed = JSON.parse(readFileSync(resolve(here, "seed-properties.json"), "utf8"));
  const day = 86400000;
  const date = (offsetDays) => new Date(now + offsetDays * day).toISOString().slice(0, 10);
  const locatorIds = new Set(db.prepare("SELECT id FROM locators").all().map((r) => r.id));
  const insert = db.prepare(`INSERT INTO properties
    (id,name,address,neighborhood,city,zip,description,floor_plans,amenities,photos,parking,pets,pet_details,
     incentives,lease_terms,contact_name,contact_phone,contact_email,website_url,tour_url,locator_id,
     availability,availability_note,availability_checked_at,source,featured,status,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published',?)`);
  for (const p of seed) {
    // Same key order the API writes, so an unchanged edit isn't seen as a change.
    const plans = p.floorPlans.map(({ name, beds, baths, sqft, rentMin, rentMax, availableInDays, units }) => ({
      name, beds, baths, sqft, rentMin, rentMax, availableFrom: availableInDays == null ? "" : date(availableInDays), units,
    }));
    const checked = new Date(now - p.checkedDaysAgo * day).toISOString();
    insert.run(p.id, p.name, p.address, p.neighborhood, p.city || "Houston", p.zip, p.description,
      JSON.stringify(plans), JSON.stringify(p.amenities), JSON.stringify(p.photos), p.parking || "",
      p.pets || "unknown", p.petDetails || "", p.incentives || "", p.leaseTerms || "",
      p.contactName || "", p.contactPhone || "", p.contactEmail || "", p.websiteUrl || "", p.tourUrl || "",
      locatorIds.has(p.locatorId) ? p.locatorId : null,
      p.availability, p.availabilityNote || "", checked, "Sample data", p.featured ? 1 : 0, checked);
  }
  return seed.length;
}
