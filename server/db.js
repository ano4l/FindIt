import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(path = process.env.FINDIT_DB || resolve(here, "data/findit.db")) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
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
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS favourites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      locator_id TEXT NOT NULL REFERENCES locators(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (user_id, locator_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locator_id TEXT NOT NULL REFERENCES locators(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT
    );
    -- Development mail log: used when no SMTP_URL is configured.
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_locators_status ON locators(status);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  `);
  const columns = new Set(db.prepare("PRAGMA table_info(locators)").all().map((c) => c.name));
  if (!columns.has("contact_email")) db.exec("ALTER TABLE locators ADD COLUMN contact_email TEXT NOT NULL DEFAULT ''");
  if (!columns.has("contact_phone")) db.exec("ALTER TABLE locators ADD COLUMN contact_phone TEXT NOT NULL DEFAULT ''");
  return db;
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
