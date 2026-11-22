import express from "express";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, verifyPassword, newToken, hashToken, rateLimit } from "./security.js";
import { sendMail, mailProviderConfigured } from "./mailer.js";
import { pruneExpired, exportTables, BACKUP_TABLES } from "./db.js";
import { createStorage, PHOTO_TYPES } from "./storage.js";
import {
  AMENITIES, AVAILABILITY, AVAILABILITY_RANK, PETS, PAGE_SIZE, CONTACT_TOPICS,
  PROPERTY_REPORT_REASONS, LOCATOR_REPORT_REASONS, STALE_DAYS, isStale, planSummary,
} from "../shared/catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
// Marks a column to be set to the database clock (now()) in insert/update helpers.
const NOW = Symbol("now");
const nowIso = () => new Date().toISOString();
const COOKIE = "findit_session";
// Vercel functions accept request bodies up to 4.5 MB; the staff console shrinks photos before upload.
const MAX_UPLOAD = 4 * 1024 * 1024;

const j = (v, fallback = []) => { try { return JSON.parse(v); } catch { return fallback; } };

const locatorOut = (r) => ({
  id: r.id, name: r.name, company: r.company, area: r.area, radius: r.radius, years: r.years,
  response: r.response, tags: j(r.tags), about: r.about, image: r.image,
  serviceAreas: j(r.service_areas), zipCodes: j(r.zip_codes), languages: j(r.languages),
  contactEmail: r.contact_email || "", contactPhone: r.contact_phone || "",
  rating: r.rating, reviews: r.reviews, featured: !!r.featured, fastResponse: !!r.fast_response,
  verified: !!r.verified, listingsUrl: r.listings_url, source: r.source, status: r.status,
  lastUpdated: r.updated_at,
});
const locatorBrief = (r) => ({ id: r.id, name: r.name, company: r.company, image: r.image, serviceAreas: j(r.service_areas) });

const propertyOut = (r) => {
  const floorPlans = j(r.floor_plans);
  return {
    id: r.id, name: r.name, address: r.address, neighborhood: r.neighborhood, city: r.city, zip: r.zip,
    description: r.description, floorPlans, summary: planSummary(floorPlans),
    amenities: j(r.amenities), photos: j(r.photos), parking: r.parking, pets: r.pets, petDetails: r.pet_details,
    incentives: r.incentives, leaseTerms: r.lease_terms,
    contactName: r.contact_name, contactPhone: r.contact_phone, contactEmail: r.contact_email,
    websiteUrl: r.website_url, tourUrl: r.tour_url, locatorId: r.locator_id || "",
    availability: r.availability, availabilityNote: r.availability_note, availabilityCheckedAt: r.availability_checked_at,
    availabilityStale: isStale(r.availability_checked_at),
    source: r.source, featured: !!r.featured, status: r.status, lastUpdated: r.updated_at,
  };
};
const userOut = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const list = (v, max = 20, len = 60) =>
  (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => clean(x, len)).filter(Boolean).slice(0, max);
const emailOk = (e) => {
  if (typeof e !== "string" || e.length > 254) return false;
  const parts = e.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => label.length > 0 && label.length <= 63 && /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i.test(label)) && /^[A-Z]{2,}$/i.test(labels.at(-1));
};
const urlOk = (u, allowRelative = false) => {
  if (!u) return true;
  if (allowRelative && /^\/(assets|uploads)\/[\w./-]+$/.test(u) && !u.includes("..")) return true;
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};
const passwordProblem = (p) =>
  typeof p !== "string" || p.length < 12 || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)
    ? "Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol."
  : p.length > 200 ? "That password is too long." : null;

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const bad = (msg, code) => new HttpError(400, msg, code);
const notFound = (msg) => new HttpError(404, msg);

/* ------------------------------------------------------------ Locators */
function parseLocator(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => !partial || body[k] !== undefined;
  const set = (k, v) => { if (has(k)) out[k] = v; };
  if (has("name")) { const name = clean(body.name, 120); if (!name) throw bad("Name is required."); out.name = name; }
  set("company", clean(body.company, 120));
  set("area", clean(body.area, 120));
  set("radius", clean(body.radius, 30));
  if (has("years")) {
    const y = body.years === "" || body.years == null ? null : Number(body.years);
    if (y !== null && (!Number.isInteger(y) || y < 0 || y > 80)) throw bad("Years of experience must be a whole number from 0 to 80.");
    out.years = y;
  }
  set("response", clean(body.response, 80));
  if (has("contactEmail")) {
    const email = clean(body.contactEmail, 320);
    if (email && !emailOk(email)) throw bad("Enter a valid contact email address.");
    out.contact_email = email;
  }
  if (has("contactPhone")) out.contact_phone = clean(body.contactPhone, 40);
  set("about", clean(body.about, 1200));
  if (has("tags")) out.tags = JSON.stringify(list(body.tags));
  if (has("serviceAreas")) out.service_areas = JSON.stringify(list(body.serviceAreas));
  if (has("languages")) out.languages = JSON.stringify(list(body.languages, 10, 30));
  if (has("zipCodes")) {
    const zips = list(body.zipCodes, 40, 10);
    if (zips.some((z) => !/^\d{5}$/.test(z))) throw bad("ZIP codes must be 5 digits, separated by commas.");
    out.zip_codes = JSON.stringify(zips);
  }
  if (has("image")) {
    const image = clean(body.image, 500);
    if (!urlOk(image, true)) throw bad("Photo must be an https link or an uploaded photo.");
    out.image = image;
  }
  if (has("listingsUrl")) {
    const url = clean(body.listingsUrl, 500);
    if (!urlOk(url)) throw bad("The listings link must be a full https address.");
    out.listings_url = url;
  }
  if (has("source")) out.source = clean(body.source, 120) || "Not stated";
  if (has("featured")) out.featured = !!body.featured;
  if (has("fastResponse")) out.fast_response = !!body.fastResponse;
  if (has("verified")) out.verified = !!body.verified;
  return out;
}

// Splits a location search into the words that must all appear. "Houston", "TX" and "Texas" are dropped
// because every record is in the Houston area, so "Montrose, Houston" and "Houston, TX 77008" both work.
const searchTerms = (q) => clean(q, 100).toLowerCase().split(/[\s,]+/).filter((t) => t && !["houston", "tx", "texas"].includes(t));

function searchLocators(rows, q) {
  const terms = searchTerms(q.q);
  const area = clean(q.area, 80), specialty = clean(q.specialty, 80), filter = clean(q.filter, 40), sort = clean(q.sort, 40);
  let out = rows.filter((l) => {
    const hay = `${l.name} ${l.area} ${l.company} ${l.zipCodes.join(" ")} ${l.serviceAreas.join(" ")} ${l.tags.join(" ")}`.toLowerCase();
    const queryMatch = terms.every((t) => hay.includes(t));
    const areaMatch = !area || area === "All Houston areas" || l.serviceAreas.includes(area);
    const specialtyMatch = !specialty || specialty === "All specialties" || l.tags.some((t) => t.toLowerCase() === specialty.toLowerCase());
    const filterMatch = !filter || filter === "All locators" || filter === "No fee to you" ||
      (filter === "Fast response" && l.fastResponse) ||
      (filter === "Speaks Spanish" && l.languages.includes("Spanish")) ||
      (filter === "Top rated" && Number(l.rating) >= 4.9) ||
      l.tags.some((t) => t.toLowerCase() === filter.toLowerCase());
    return queryMatch && areaMatch && specialtyMatch && filterMatch;
  });
  if (filter === "Top rated" || sort === "Highest rated") out = [...out].sort((a, b) => Number(b.rating) - Number(a.rating));
  if (sort === "Most experienced" || sort === "experience") out = [...out].sort((a, b) => (b.years ?? -1) - (a.years ?? -1));
  if (sort === "name") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/* ---------------------------------------------------------- Properties */
const intOrNull = (v, label, min, max) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
};
const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

function parseFloorPlans(value) {
  if (!Array.isArray(value)) throw bad("Floor plans must be a list.");
  if (value.length > 30) throw bad("A listing can have at most 30 floor plans.");
  return value.map((p, i) => {
    const n = `Floor plan ${i + 1}`;
    const beds = intOrNull(p?.beds, `${n}: bedrooms`, 0, 10);
    if (beds === null) throw bad(`${n}: enter the number of bedrooms (0 for a studio).`);
    const baths = p?.baths === "" || p?.baths == null ? null : Number(p.baths);
    if (baths !== null && (!(baths >= 0.5 && baths <= 10) || (baths * 2) % 1 !== 0)) throw bad(`${n}: bathrooms must be between 0.5 and 10, in steps of 0.5.`);
    const rentMin = intOrNull(p?.rentMin, `${n}: lowest rent`, 100, 50000);
    let rentMax = intOrNull(p?.rentMax, `${n}: highest rent`, 100, 50000);
    if (rentMin !== null && rentMax !== null && rentMax < rentMin) throw bad(`${n}: the highest rent can't be below the lowest rent.`);
    if (rentMax === null) rentMax = rentMin;
    const availableFrom = clean(p?.availableFrom, 10);
    if (availableFrom && !dateOk(availableFrom)) throw bad(`${n}: the available-from date isn't valid.`);
    return {
      name: clean(p?.name, 60) || (beds === 0 ? "Studio" : `${beds} bedroom`),
      beds, baths, sqft: intOrNull(p?.sqft, `${n}: square feet`, 100, 20000),
      rentMin: rentMin ?? null, rentMax: rentMin === null && rentMax === null ? null : rentMax,
      availableFrom, units: intOrNull(p?.units, `${n}: available units`, 0, 2000),
    };
  });
}

// The linked locator is checked against the database by the route.
function parseProperty(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => !partial || body[k] !== undefined;
  const text = (k, col, max) => { if (has(k)) out[col] = clean(body[k], max); };
  if (has("name")) { const name = clean(body.name, 120); if (!name) throw bad("Property name is required."); out.name = name; }
  text("address", "address", 160);
  text("neighborhood", "neighborhood", 80);
  if (has("city")) out.city = clean(body.city, 80) || "Houston";
  if (has("zip")) {
    const zip = clean(body.zip, 10);
    if (zip && !/^\d{5}$/.test(zip)) throw bad("ZIP code must be 5 digits.");
    out.zip = zip;
  }
  text("description", "description", 2000);
  if (has("floorPlans")) out.floor_plans = JSON.stringify(parseFloorPlans(body.floorPlans ?? []));
  if (has("amenities")) {
    const amenities = list(body.amenities, 40, 60);
    out.amenities = JSON.stringify([...new Set(amenities)]);
  }
  if (has("photos")) {
    const photos = list(body.photos, 12, 500);
    const badPhoto = photos.find((p) => !urlOk(p, true));
    if (badPhoto) throw bad("Photos must be uploaded files or full https links.");
    out.photos = JSON.stringify(photos);
  }
  text("parking", "parking", 300);
  if (has("pets")) {
    const pets = clean(body.pets, 20) || "unknown";
    if (!(pets in PETS)) throw bad("Choose a pet policy.");
    out.pets = pets;
  }
  text("petDetails", "pet_details", 300);
  text("incentives", "incentives", 300);
  text("leaseTerms", "lease_terms", 120);
  text("contactName", "contact_name", 120);
  text("contactPhone", "contact_phone", 40);
  if (has("contactEmail")) {
    const email = clean(body.contactEmail, 320);
    if (email && !emailOk(email)) throw bad("Enter a valid contact email address.");
    out.contact_email = email;
  }
  for (const [k, col, label] of [["websiteUrl", "website_url", "Website"], ["tourUrl", "tour_url", "Tour link"]]) {
    if (!has(k)) continue;
    const url = clean(body[k], 500);
    if (!urlOk(url)) throw bad(`${label} must be a full https address.`);
    out[col] = url;
  }
  if (has("locatorId")) {
    out.locator_id = clean(body.locatorId, 80) || null;
  }
  if (has("availability")) {
    const a = clean(body.availability, 20) || "unknown";
    if (!(a in AVAILABILITY)) throw bad("Choose an availability status.");
    out.availability = a;
  }
  text("availabilityNote", "availability_note", 300);
  if (has("source")) out.source = clean(body.source, 120) || "Not stated";
  if (has("featured")) out.featured = !!body.featured;
  return out;
}

const num = (v) => (v === undefined || v === "" || v === null || Number.isNaN(Number(v)) ? null : Number(v));

// Parses search filters from a query string. Unknown values are ignored rather than rejected.
export function propertyFilters(q) {
  const date = clean(q.moveIn, 10);
  const beds = num(q.beds);
  return {
    q: clean(q.q, 100).toLowerCase().replace(/,?\s*(tx|texas)$/, "").trim(),
    beds: beds !== null && Number.isInteger(beds) && beds >= 0 ? Math.min(beds, 3) : null,
    baths: num(q.baths),
    minRent: num(q.minRent),
    maxRent: num(q.maxRent),
    moveIn: dateOk(date) ? date : "",
    availability: ["available", "upcoming"].includes(q.availability) ? q.availability : "",
    amenities: list(q.amenities, 20, 60).filter((a) => AMENITIES.includes(a)),
    pets: ["dogs", "cats"].includes(q.pets) ? q.pets : "",
    sort: ["recommended", "price-asc", "price-desc", "updated", "size"].includes(q.sort) ? q.sort : "recommended",
  };
}

export function searchProperties(rows, f, today = nowIso().slice(0, 10)) {
  const terms = searchTerms(f.q);
  const planFilter = f.beds !== null || f.baths !== null || f.minRent !== null || f.maxRent !== null || !!f.moveIn;
  const planMatches = (p, availability) => {
    if (f.beds !== null && (f.beds >= 3 ? p.beds < 3 : p.beds !== f.beds)) return false;
    if (f.baths !== null && (p.baths ?? 0) < f.baths) return false;
    const low = p.rentMin ?? p.rentMax, high = p.rentMax ?? p.rentMin;
    if (f.minRent !== null && (high == null || high < f.minRent)) return false;
    if (f.maxRent !== null && (low == null || low > f.maxRent)) return false;
    if (f.moveIn) {
      if (availability !== "available" && availability !== "coming_soon") return false;
      if (p.units === 0) return false;
      const from = p.availableFrom || (availability === "available" ? today : "");
      if (!from || from > f.moveIn) return false;
    }
    return true;
  };
  const out = [];
  for (const p of rows) {
    if (terms.length) {
      const hay = `${p.name} ${p.address} ${p.neighborhood} ${p.city} ${p.zip}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
    }
    if (f.availability === "available" && p.availability !== "available") continue;
    if (f.availability === "upcoming" && !["available", "coming_soon"].includes(p.availability)) continue;
    if (f.amenities.length && !f.amenities.every((a) => p.amenities.includes(a))) continue;
    if (f.pets === "dogs" && p.pets !== "dogs-and-cats") continue;
    if (f.pets === "cats" && !["dogs-and-cats", "cats-only"].includes(p.pets)) continue;
    const matching = planFilter ? p.floorPlans.filter((plan) => planMatches(plan, p.availability)) : p.floorPlans;
    if (planFilter && !matching.length) continue;
    const rents = matching.map((x) => x.rentMin ?? x.rentMax).filter((n) => n != null);
    out.push({ ...p, match: planFilter ? { plans: matching.length, rentFrom: rents.length ? Math.min(...rents) : null } : null });
  }
  const fromPrice = (p) => p.match?.rentFrom ?? p.summary.rent?.[0] ?? null;
  const byNullLast = (a, b, dir) => (a == null ? 1 : b == null ? -1 : (a - b) * dir);
  const sorters = {
    recommended: (a, b) => (b.featured - a.featured) || (AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability]) || b.lastUpdated.localeCompare(a.lastUpdated),
    "price-asc": (a, b) => byNullLast(fromPrice(a), fromPrice(b), 1),
    "price-desc": (a, b) => byNullLast(fromPrice(a), fromPrice(b), -1),
    updated: (a, b) => (b.availabilityCheckedAt || "").localeCompare(a.availabilityCheckedAt || ""),
    size: (a, b) => byNullLast(a.summary.sqft?.[1], b.summary.sqft?.[1], -1),
  };
  return out.sort(sorters[f.sort] || sorters.recommended);
}

/* ------------------------------------------------------------- Uploads */
function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}


export function createApp(db, {
  distDir = resolve(here, "../dist"),
  uploadsDir = process.env.FINDIT_UPLOADS || resolve(here, "data/uploads"),
  storage = createStorage({ uploadsDir }),
  emailEnabled, // tests can force email on or off; normally it follows the configuration (see emailOn)
} = {}) {
  const app = express();
  // Vercel always counts as production, so the development-only helpers can never be exposed there.
  const prod = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (prod) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000");
      res.setHeader("Content-Security-Policy",
        "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Mutations must come from our own front end (custom header cannot be sent cross-site without CORS approval).
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.get("x-requested-with") !== "findit") return res.status(403).json({ error: "Request blocked." });
    next();
  });

  const cookies = (req) => {
    const out = {};
    for (const part of (req.headers.cookie || "").split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (!k) continue;
      try { out[k] = decodeURIComponent(v.join("=")); } catch { /* ignore malformed cookie */ }
    }
    return out;
  };
  const setCookie = (res, value, maxAgeMs) =>
    res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}${prod ? "; Secure" : ""}`);

  app.use(async (req, _res, next) => {
    const t = cookies(req)[COOKIE];
    req.user = null;
    if (t && req.path.startsWith("/api/")) {
      req.user = (await db.get(`select u.* from sessions s join users u on u.id = s.user_id
        where s.token_hash = ? and s.expires_at > now()`, hashToken(t))) || null;
    }
    next();
  });
  const needUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, "Please sign in to continue.", "auth_required")));
  const needStaff = (req, _res, next) => (!req.user ? next(new HttpError(401, "Please sign in to continue.", "auth_required"))
    : req.user.role !== "staff" ? next(new HttpError(403, "Staff access only.")) : next());
  const limit = (opts) => rateLimit(db, opts);

  // Whether confirmation and reset emails can reach people. On the hosted site this is off until an email
  // provider is configured (RESEND_API_KEY or SMTP_URL): accounts then work without confirming an address
  // and password reset by email is unavailable. Local development counts as on, because emails are
  // written to the outbox where their links can be read.
  const emailOn = () => (emailEnabled !== undefined ? emailEnabled : mailProviderConfigured() || !prod);
  const ADMIN_LOCK = "select pg_advisory_xact_lock(724002)";
  const noAdminYet = async (tx) => !(await tx.get("select 1 as found from users where role = 'staff' limit 1"));
  const recordFirstAdmin = (tx, userId, email, detail) => tx.run(
    "insert into audit_log (user_id, action, target_type, target_id, detail) values (?,?,?,?,?)", userId, "admin", "account", email, detail);

  const origin = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
  const startSession = async (res, userId) => {
    const t = newToken();
    await db.run("insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?::timestamptz)", hashToken(t), userId, iso(14 * DAY));
    setCookie(res, t, 14 * DAY);
  };
  const issueToken = async (userId, kind, ttl) => {
    await db.run("delete from tokens where user_id = ? and kind = ?", userId, kind);
    const t = newToken();
    await db.run("insert into tokens (token_hash, user_id, kind, expires_at) values (?, ?, ?, ?::timestamptz)", hashToken(t), userId, kind, iso(ttl));
    return t;
  };
  // Email failures become a clear, retryable error instead of a generic 500.
  const mail = async (message) => {
    try { await sendMail(db, message); }
    catch (e) { console.error(e); throw new HttpError(502, "We couldn't send the email just now. Please try again in a few minutes.", "mail_failed"); }
  };
  const sendVerify = async (req, user) => mail({
    to: user.email, subject: "Confirm your FindIt email address",
    text: `Hi ${user.name},\n\nConfirm your email to finish creating your FindIt account:\n${origin(req)}/verify-email?token=${await issueToken(user.id, "verify", 2 * DAY)}\n\nThis link works for 48 hours. If you didn't sign up, you can ignore this email.`,
  });
  // Marks an account's email as confirmed. While the site has no admin, the account being confirmed
  // becomes the admin (the staff role); everyone after that stays a member. The lock makes confirmations
  // that arrive together take turns, so only one can be first. Returns true when this account became admin.
  const confirmEmail = (userId) => db.transaction(async (tx) => {
    await tx.get(ADMIN_LOCK);
    const u = await tx.get("select email, email_verified from users where id = ?", userId);
    if (!u || u.email_verified) return false;
    const first = await noAdminYet(tx);
    await tx.run(first ? "update users set email_verified = true, role = 'staff' where id = ?" : "update users set email_verified = true where id = ?", userId);
    if (first) await recordFirstAdmin(tx, userId, u.email, "First confirmed account on the site");
    return first;
  });
  const audit = (req, action, targetType, targetId, detail = "") =>
    db.run("insert into audit_log (user_id, action, target_type, target_id, detail) values (?,?,?,?,?)",
      req.user?.id ?? null, action, targetType, String(targetId), clean(detail, 300));

  const authLimit = limit({ windowMs: 15 * 60000, max: 20 });

  // ---------- Auth ----------
  app.post("/api/auth/signup", authLimit, async (req, res) => {
    const name = clean(req.body.name, 80), email = clean(req.body.email, 320).toLowerCase(), password = req.body.password;
    if (name.split(/\s+/).filter(Boolean).length < 2) throw bad("Enter your full name, including at least a first and last name.");
    if (!emailOk(email)) throw bad("Please enter a valid email address.");
    const pw = passwordProblem(password); if (pw) throw bad(pw);
    const existing = await db.get("select * from users where email = ?", email);
    if (!emailOn()) {
      // No email provider yet, so nobody can be sent a confirmation link: the account works straight
      // away and the person is signed in. The first account on the site becomes the admin.
      const taken = new HttpError(409, "An account with this email already exists. Sign in instead.", "account_exists");
      if (existing) throw taken;
      let made;
      try {
        made = await db.transaction(async (tx) => {
          await tx.get(ADMIN_LOCK);
          const first = await noAdminYet(tx);
          const row = await tx.get("insert into users (email, name, password_hash, role, email_verified) values (?,?,?,?,true) returning id",
            email, name, hashPassword(password), first ? "staff" : "member");
          if (first) await recordFirstAdmin(tx, row.id, email, "First account on the site");
          return { id: row.id, role: first ? "staff" : "member" };
        });
      } catch (e) { if (e.code === "23505") throw taken; throw e; } // two sign-ups with the same address at once
      await startSession(res, made.id);
      return res.status(201).json({ ok: true, firstAdmin: made.role === "staff", user: userOut({ id: made.id, email, name, role: made.role }) });
    }
    if (!existing) {
      const created = await db.get("insert into users (email, name, password_hash) values (?,?,?) returning id", email, name, hashPassword(password));
      await sendVerify(req, { id: created.id, email, name });
    } else if (!existing.email_verified) {
      // Not confirmed yet, so nobody has proved they own this address: the newest sign-up replaces the
      // earlier name and password. Otherwise someone could register another person's email with a
      // password of their own and wait for the real owner to confirm it.
      await db.run("update users set name = ?, password_hash = ? where id = ?", name, hashPassword(password), existing.id);
      await sendVerify(req, { id: existing.id, email, name });
    }
    else await mail({ to: email, subject: "You already have a FindIt account", text: `Hi,\n\nSomeone tried to sign up with this email, but you already have an account. You can sign in or reset your password at ${origin(req)}.` });
    // Same answer either way so the form can't be used to discover who has an account.
    res.status(201).json({ ok: true, message: "Check your email for a link to confirm your address." });
  });

  app.post("/api/auth/verify", authLimit, async (req, res) => {
    const row = await db.get("select * from tokens where token_hash = ? and kind = 'verify' and expires_at > now()", hashToken(req.body.token));
    if (!row) throw bad("This confirmation link is invalid or has expired. Enter your email to get a new one.", "bad_token");
    const firstAdmin = await confirmEmail(row.user_id);
    await db.run("delete from tokens where user_id = ? and kind = 'verify'", row.user_id);
    res.json({ ok: true, firstAdmin });
  });

  app.post("/api/auth/resend", authLimit, async (req, res) => {
    if (!emailOn()) return res.json({ ok: true, message: "Email confirmation is switched off at the moment, so you can sign in straight away." });
    const u = await db.get("select * from users where email = ?", clean(req.body.email, 320).toLowerCase());
    if (u && !u.email_verified) await sendVerify(req, u);
    res.json({ ok: true, message: "If that account needs confirming, a new link is on its way." });
  });

  app.post("/api/auth/login", authLimit, async (req, res) => {
    const u = await db.get("select * from users where email = ?", clean(req.body.email, 320).toLowerCase());
    const ok = u ? verifyPassword(String(req.body.password ?? ""), u.password_hash) : (verifyPassword("x", hashPassword("y")), false);
    if (!ok) throw new HttpError(401, "Email or password is incorrect.", "bad_credentials");
    if (!u.email_verified) {
      if (emailOn()) throw new HttpError(403, "Please confirm your email address first. Check your inbox for the link.", "email_not_verified");
      await confirmEmail(u.id); // no email provider: there is no link to wait for
    }
    await startSession(res, u.id);
    res.json({ user: userOut(await db.get("select * from users where id = ?", u.id)) });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const t = cookies(req)[COOKIE];
    if (t) await db.run("delete from sessions where token_hash = ?", hashToken(t));
    setCookie(res, "", 0);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => res.json({ user: req.user ? userOut(req.user) : null, emailOn: emailOn() }));

  app.post("/api/auth/forgot", authLimit, async (req, res) => {
    if (!emailOn()) throw new HttpError(503, "Password reset by email isn't switched on yet. Send us a message through the contact page and we'll help you get back in.", "email_off");
    const u = await db.get("select * from users where email = ?", clean(req.body.email, 320).toLowerCase());
    if (u) await mail({
      to: u.email, subject: "Reset your FindIt password",
      text: `Hi ${u.name},\n\nChoose a new password here:\n${origin(req)}/reset-password?token=${await issueToken(u.id, "reset", 60 * 60000)}\n\nThis link works for 1 hour. If you didn't ask for this, ignore this email.`,
    });
    res.json({ ok: true, message: "If an account exists for that email, a reset link is on its way." });
  });

  app.post("/api/auth/reset", authLimit, async (req, res) => {
    const pw = passwordProblem(req.body.password); if (pw) throw bad(pw);
    const row = await db.get("select * from tokens where token_hash = ? and kind = 'reset' and expires_at > now()", hashToken(req.body.token));
    if (!row) throw bad("This reset link is invalid or has expired. Request a new one.", "bad_token");
    await db.run("update users set password_hash = ? where id = ?", hashPassword(req.body.password), row.user_id);
    await confirmEmail(row.user_id); // a reset link proves the address too
    await db.run("delete from tokens where user_id = ?", row.user_id);
    await db.run("delete from sessions where user_id = ?", row.user_id); // sign out everywhere
    res.json({ ok: true });
  });

  app.post("/api/auth/password", authLimit, needUser, async (req, res) => {
    const current = String(req.body.currentPassword ?? "");
    if (!verifyPassword(current, req.user.password_hash)) throw new HttpError(401, "Current password is incorrect.", "bad_credentials");
    const pw = passwordProblem(req.body.password); if (pw) throw bad(pw);
    await db.run("update users set password_hash = ? where id = ?", hashPassword(req.body.password), req.user.id);
    await db.run("delete from sessions where user_id = ?", req.user.id);
    await startSession(res, req.user.id);
    res.json({ ok: true, message: "Password changed." });
  });

  app.post("/api/contact", limit({ name: "contact", windowMs: 60 * 60000, max: 5 }), async (req, res) => {
    const name = clean(req.body.name, 80), email = clean(req.body.email, 320).toLowerCase(), message = clean(req.body.message, 2000);
    const topic = CONTACT_TOPICS.includes(req.body.topic) ? req.body.topic : CONTACT_TOPICS[0];
    if (name.length < 2) throw bad("Please enter your name.");
    if (!emailOk(email)) throw bad("Please enter a valid email address.");
    if (message.length < 10) throw bad("Please enter a message of at least 10 characters.");
    // Every message is kept for staff to read in the console. Email, when it is on, is only a heads-up,
    // so a mail problem never loses a message or shows the visitor an error.
    await db.run("insert into contact_messages (name, email, topic, message) values (?,?,?,?)", name, email, topic, message);
    const to = process.env.CONTACT_EMAIL || (!prod ? "findit-inbox@localhost" : "");
    if (to && emailOn()) {
      try { await sendMail(db, { to, replyTo: email, subject: `FindIt enquiry (${topic}) from ${name}`, text: `From: ${name} <${email}>\nTopic: ${topic}\n\n${message}` }); }
      catch (e) { console.error(e); }
    }
    res.status(201).json({ ok: true, message: "Thanks. Your message has been sent to the FindIt team. We usually reply within two working days." });
  });

  // ---------- Public catalogue ----------
  const publishedProperties = async () => (await db.all("select * from properties where status = 'published'")).map(propertyOut);
  const publishedLocatorIds = async () => new Set((await db.all("select id from locators where status = 'published'")).map((r) => r.id));
  // Drops staff-only fields, and the linked locator unless that profile is public too.
  const publicProperty = (p, locators) => { const { status, ...rest } = p; return { ...rest, locatorId: locators.has(p.locatorId) ? p.locatorId : "" }; };

  app.get("/api/properties", async (req, res) => {
    const filters = propertyFilters(req.query);
    const results = searchProperties(await publishedProperties(), filters);
    const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize, 10) || PAGE_SIZE, 1), 48);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const locators = await publishedLocatorIds();
    res.json({
      properties: results.slice((page - 1) * pageSize, page * pageSize).map((p) => publicProperty(p, locators)),
      total: results.length, page, pageSize,
    });
  });
  app.get("/api/properties/:id", async (req, res) => {
    const r = await db.get("select * from properties where id = ? and status = 'published'", req.params.id);
    if (!r) throw notFound("That listing isn't available.");
    const loc = r.locator_id ? await db.get("select * from locators where id = ? and status = 'published'", r.locator_id) : null;
    res.json({ property: publicProperty(propertyOut(r), new Set(loc ? [loc.id] : [])), locator: loc ? locatorBrief(loc) : null });
  });
  app.get("/api/catalog", (_req, res) => res.json({
    amenities: AMENITIES, availability: AVAILABILITY, pets: PETS,
    reportReasons: { property: PROPERTY_REPORT_REASONS, locator: LOCATOR_REPORT_REASONS }, contactTopics: CONTACT_TOPICS,
  }));

  app.get("/api/locators", async (req, res) => {
    const rows = (await db.all("select * from locators where status = 'published' order by featured desc, name")).map(locatorOut);
    res.json({ locators: searchLocators(rows, req.query) });
  });
  app.get("/api/locators/:id", async (req, res) => {
    const r = await db.get("select * from locators where id = ? and status = 'published'", req.params.id);
    if (!r) throw notFound("That locator profile isn't available.");
    const properties = (await db.all("select * from properties where locator_id = ? and status = 'published' order by name", r.id)).map((p) => publicProperty(propertyOut(p), new Set([r.id])));
    res.json({ locator: locatorOut(r), properties });
  });

  // ---------- Reports ----------
  const reportLimit = limit({ name: "report", windowMs: 60 * 60000, max: 10 });
  const fileReport = (kind, table, reasons) => async (req, res) => {
    const r = await db.get(`select id from ${table} where id = ? and status = 'published'`, req.params.id);
    if (!r) throw notFound(kind === "property" ? "That listing isn't available." : "That locator profile isn't available.");
    const reason = clean(req.body.reason, 80);
    if (!reasons.includes(reason)) throw bad("Please choose a reason.");
    await db.run(`insert into reports (${kind === "property" ? "property_id" : "locator_id"}, user_id, reason, details) values (?,?,?,?)`,
      r.id, req.user?.id ?? null, reason, clean(req.body.details, 1000));
    res.status(201).json({ ok: true, message: "Thanks. Our team will review this and correct it if needed." });
  };
  app.post("/api/properties/:id/report", reportLimit, fileReport("property", "properties", PROPERTY_REPORT_REASONS));
  app.post("/api/locators/:id/report", reportLimit, fileReport("locator", "locators", LOCATOR_REPORT_REASONS));
  app.get("/api/report-reasons", (_req, res) => res.json({ reasons: LOCATOR_REPORT_REASONS, property: PROPERTY_REPORT_REASONS }));

  // ---------- Favourites ----------
  app.get("/api/favourites", needUser, async (req, res) => {
    const locators = (await db.all(`select l.* from favourites f join locators l on l.id = f.locator_id
      where f.user_id = ? and l.status = 'published' order by f.created_at desc`, req.user.id)).map(locatorOut);
    const publicLocators = await publishedLocatorIds();
    const properties = (await db.all(`select p.* from property_favourites f join properties p on p.id = f.property_id
      where f.user_id = ? and p.status = 'published' order by f.created_at desc`, req.user.id)).map((p) => publicProperty(propertyOut(p), publicLocators));
    res.json({ locators, properties });
  });
  const favouriteRoutes = (kind, table, favTable, col, missing) => {
    app.put(`/api/favourites/${kind}/:id`, needUser, async (req, res) => {
      const r = await db.get(`select id from ${table} where id = ? and status = 'published'`, req.params.id);
      if (!r) throw notFound(missing);
      await db.run(`insert into ${favTable} (user_id, ${col}) values (?,?) on conflict do nothing`, req.user.id, r.id);
      res.json({ ok: true });
    });
    app.delete(`/api/favourites/${kind}/:id`, needUser, async (req, res) => {
      await db.run(`delete from ${favTable} where user_id = ? and ${col} = ?`, req.user.id, req.params.id);
      res.json({ ok: true });
    });
  };
  favouriteRoutes("locators", "locators", "favourites", "locator_id", "That locator profile isn't available.");
  favouriteRoutes("properties", "properties", "property_favourites", "property_id", "That listing isn't available.");

  // ---------- Staff tools ----------
  const slug = (s, fallback) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || fallback;
  const uniqueId = async (table, name, fallback) => {
    let id = slug(name, fallback);
    while (await db.get(`select 1 from ${table} where id = ?`, id)) id = `${slug(name, fallback)}-${newToken().slice(0, 4).toLowerCase()}`;
    return id;
  };
  // Column names come from the parse* functions, never from the request.
  const insertRow = (table, id, data, status, userId) => {
    const cols = Object.keys(data);
    const values = cols.map((c) => (data[c] === NOW ? "now()" : "?"));
    return db.run(`insert into ${table} (id, ${cols.join(",")}, status, updated_by) values (?, ${values.join(",")}, ?, ?)`,
      id, ...cols.filter((c) => data[c] !== NOW).map((c) => data[c]), status, userId);
  };
  const updateRow = (table, id, data, userId) => {
    const cols = Object.keys(data);
    if (!cols.length) return null;
    return db.run(`update ${table} set ${cols.map((c) => `${c} = ${data[c] === NOW ? "now()" : "?"}`).join(",")}, updated_at = now(), updated_by = ? where id = ?`,
      ...cols.filter((c) => data[c] !== NOW).map((c) => data[c]), userId, id);
  };
  // Keeps only the columns whose value actually differs from the stored row.
  const changedOnly = (existing, data) => Object.fromEntries(Object.entries(data).filter(([c, v]) => (existing[c] ?? null) !== (v ?? null)));
  const fieldNames = (cols) => cols.map((c) => c.replace(/_/g, " ")).join(", ");
  const staffRows = (table, out) => async (where, ...params) =>
    (await db.all(`select t.*, u.name as updated_by_name from ${table} t left join users u on u.id = t.updated_by where ${where} order by t.updated_at desc`, ...params))
      .map((r) => ({ ...out(r), updatedBy: r.updated_by_name || "" }));
  const staffLocators = staffRows("locators", locatorOut);
  const staffProperties = staffRows("properties", propertyOut);
  const staffLocator = async (id) => (await staffLocators("t.id = ?", id))[0];
  const staffProperty = async (id) => (await staffProperties("t.id = ?", id))[0];
  const statusRoute = (path, table, targetType) => app.post(path, needStaff, async (req, res) => {
    const status = req.body.status;
    if (!["published", "hidden", "removed"].includes(status)) throw bad("Unknown status.");
    const r = await db.run(`update ${table} set status = ?, updated_at = now(), updated_by = ? where id = ? and status != 'removed'`, status, req.user.id, req.params.id);
    if (!r.changes) throw notFound("Record not found.");
    // A removed locator can't be chosen again, so listings that pointed at it go back to "no locator".
    if (table === "locators" && status === "removed") await db.run("update properties set locator_id = null where locator_id = ?", req.params.id);
    await audit(req, status === "published" ? "published" : status === "hidden" ? "hid" : "removed", targetType, req.params.id);
    res.json({ ok: true });
  });

  // Locator profiles
  app.get("/api/admin/locators", needStaff, async (_req, res) => res.json({ locators: await staffLocators("t.status != 'removed'") }));
  app.post("/api/admin/locators", needStaff, async (req, res) => {
    const data = parseLocator(req.body);
    const id = await uniqueId("locators", data.name, "locator");
    await insertRow("locators", id, data, req.body.publish ? "published" : "hidden", req.user.id);
    await audit(req, "created", "locator", id, data.name);
    res.status(201).json({ locator: await staffLocator(id) });
  });
  app.put("/api/admin/locators/:id", needStaff, async (req, res) => {
    const existing = await db.get("select * from locators where id = ? and status != 'removed'", req.params.id);
    if (!existing) throw notFound("Profile not found.");
    const data = changedOnly(existing, parseLocator(req.body, { partial: true }));
    if (Object.keys(data).length) {
      await updateRow("locators", req.params.id, data, req.user.id);
      await audit(req, "edited", "locator", req.params.id, fieldNames(Object.keys(data)));
    }
    res.json({ locator: await staffLocator(req.params.id) });
  });
  statusRoute("/api/admin/locators/:id/status", "locators", "locator");

  // Property listings
  const locatorExists = async (id) => !!(await db.get("select 1 from locators where id = ? and status != 'removed'", id));
  // `current` is the locator already saved on the listing: leaving it as it is never blocks a save.
  const checkLocator = async (data, current = null) => {
    if (data.locator_id && data.locator_id !== current && !(await locatorExists(data.locator_id))) throw bad("The linked locator doesn't exist.");
    return data;
  };
  app.get("/api/admin/properties", needStaff, async (_req, res) => res.json({ properties: await staffProperties("t.status != 'removed'") }));
  app.get("/api/admin/properties/:id", needStaff, async (req, res) => {
    const p = await staffProperty(req.params.id);
    if (!p || p.status === "removed") throw notFound("Listing not found.");
    const history = (await db.all(`select a.action, a.detail, a.created_at, u.name from audit_log a left join users u on u.id = a.user_id
      where a.target_type = 'property' and a.target_id = ? order by a.id desc limit 20`, req.params.id))
      .map((h) => ({ action: h.action, detail: h.detail, at: h.created_at, by: h.name || "" }));
    res.json({ property: p, history });
  });
  app.post("/api/admin/properties", needStaff, async (req, res) => {
    const data = await checkLocator(parseProperty(req.body));
    // "Not confirmed" means nobody has checked yet, so only a real status counts as a check.
    if (data.availability && data.availability !== "unknown") data.availability_checked_at = NOW;
    const id = await uniqueId("properties", data.name, "listing");
    await insertRow("properties", id, data, req.body.publish ? "published" : "hidden", req.user.id);
    await audit(req, "created", "property", id, data.name);
    res.status(201).json({ property: await staffProperty(id) });
  });
  app.put("/api/admin/properties/:id", needStaff, async (req, res) => {
    const existing = await db.get("select * from properties where id = ? and status != 'removed'", req.params.id);
    if (!existing) throw notFound("Listing not found.");
    const data = changedOnly(existing, await checkLocator(parseProperty(req.body, { partial: true }), existing.locator_id));
    const fields = Object.keys(data);
    // A new availability status or note, or an explicit "I checked today", counts as a fresh check.
    if ("availability" in data || "availability_note" in data || req.body.confirmAvailability) data.availability_checked_at = NOW;
    if (Object.keys(data).length) {
      await updateRow("properties", req.params.id, data, req.user.id);
      await audit(req, fields.length ? "edited" : "availability", "property", req.params.id, fields.length ? fieldNames(fields) : "Confirmed unchanged");
    }
    res.json({ property: await staffProperty(req.params.id) });
  });
  // Quick availability update; also used to confirm that unchanged availability is still correct.
  app.post("/api/admin/properties/:id/availability", needStaff, async (req, res) => {
    const availability = clean(req.body.availability, 20);
    if (!(availability in AVAILABILITY)) throw bad("Choose an availability status.");
    const existing = await db.get("select availability, availability_note from properties where id = ? and status != 'removed'", req.params.id);
    if (!existing) throw notFound("Listing not found.");
    // Without a new note: keep the note when only confirming the same status, clear it when the status
    // changes (a note such as "Seven homes available now" would contradict "No current availability").
    const note = req.body.note !== undefined ? clean(req.body.note, 300) : availability === existing.availability ? existing.availability_note : "";
    await db.run(`update properties set availability = ?, availability_note = ?,
      availability_checked_at = now(), updated_at = now(), updated_by = ? where id = ? and status != 'removed'`,
      availability, note, req.user.id, req.params.id);
    await audit(req, "availability", "property", req.params.id, AVAILABILITY[availability]);
    res.json({ property: await staffProperty(req.params.id) });
  });
  statusRoute("/api/admin/properties/:id/status", "properties", "property");

  // Photo uploads (JPEG, PNG or WebP, sent as the raw request body). The content is checked, not just the header.
  app.post("/api/admin/uploads", needStaff, express.raw({ type: Object.values(PHOTO_TYPES), limit: MAX_UPLOAD }), async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const ext = imageType(body);
    if (!ext) throw bad("Upload a JPEG, PNG or WebP image under 4 MB.");
    const name = `${newToken().slice(0, 24)}.${ext}`;
    let url;
    try { url = await storage.put(name, body, PHOTO_TYPES[ext]); }
    catch (e) { console.error(e); throw new HttpError(e.status || 502, e.status ? e.message : "The photo couldn't be stored. Please try again."); }
    await audit(req, "uploaded", "photo", name);
    res.status(201).json({ url });
  });

  // Reports
  app.get("/api/admin/reports", needStaff, async (req, res) => {
    const status = ["open", "resolved", "dismissed"].includes(req.query.status) ? req.query.status : null;
    const rows = await db.all(`select r.*, l.name as locator_name, l.status as locator_status, p.name as property_name, p.status as property_status, u.email as reporter_email
      from reports r left join locators l on l.id = r.locator_id left join properties p on p.id = r.property_id left join users u on u.id = r.user_id
      ${status ? "where r.status = ?" : ""} order by r.created_at desc limit 200`, ...(status ? [status] : []));
    res.json({
      reports: rows.map((r) => {
        const property = !!r.property_id;
        return {
          id: r.id, targetType: property ? "property" : "locator", targetId: property ? r.property_id : r.locator_id,
          targetName: property ? r.property_name : r.locator_name, targetStatus: property ? r.property_status : r.locator_status,
          // Kept for older clients.
          locatorId: r.locator_id, locatorName: r.locator_name, locatorStatus: r.locator_status,
          reason: r.reason, details: r.details, status: r.status, reporter: r.reporter_email, createdAt: r.created_at, resolvedAt: r.resolved_at,
        };
      }),
    });
  });
  app.post("/api/admin/reports/:id", needStaff, async (req, res) => {
    if (!["resolved", "dismissed", "open"].includes(req.body.status)) throw bad("Unknown status.");
    const reportId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(reportId)) throw notFound("Report not found.");
    const r = await db.run(`update reports set status = ?, resolved_by = ?, resolved_at = ${req.body.status === "open" ? "null" : "now()"} where id = ?`,
      req.body.status, req.user.id, reportId);
    if (!r.changes) throw notFound("Report not found.");
    await audit(req, req.body.status === "open" ? "reopened" : req.body.status, "report", reportId);
    res.json({ ok: true });
  });

  app.get("/api/admin/summary", needStaff, async (_req, res) => {
    const c = async (sql, ...args) => (await db.get(sql, ...args)).n;
    res.json({
      listingsPublished: await c("select count(*)::int as n from properties where status='published'"),
      listingsHidden: await c("select count(*)::int as n from properties where status='hidden'"),
      staleListings: await c("select count(*)::int as n from properties where status='published' and (availability_checked_at is null or availability_checked_at < now() - make_interval(days => ?))", STALE_DAYS),
      published: await c("select count(*)::int as n from locators where status='published'"),
      hidden: await c("select count(*)::int as n from locators where status='hidden'"),
      openReports: await c("select count(*)::int as n from reports where status='open'"),
      openMessages: await c("select count(*)::int as n from contact_messages where not handled"),
      members: await c("select count(*)::int as n from users where role='member'"),
      emailOn: emailOn(),
    });
  });

  // Contact-form messages
  app.get("/api/admin/messages", needStaff, async (req, res) => {
    const rows = await db.all(`select m.*, u.name as handled_by_name from contact_messages m left join users u on u.id = m.handled_by
      where m.handled = ? order by m.id desc limit 200`, req.query.status === "done");
    res.json({ messages: rows.map((m) => ({ id: m.id, name: m.name, email: m.email, topic: m.topic, message: m.message, handled: !!m.handled,
      handledBy: m.handled_by_name || "", handledAt: m.handled_at, createdAt: m.created_at })) });
  });
  app.post("/api/admin/messages/:id", needStaff, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10), handled = !!req.body.handled;
    if (!Number.isInteger(id)) throw notFound("Message not found.");
    const r = handled
      ? await db.run("update contact_messages set handled = true, handled_by = ?, handled_at = now() where id = ?", req.user.id, id)
      : await db.run("update contact_messages set handled = false, handled_by = null, handled_at = null where id = ?", id);
    if (!r.changes) throw notFound("Message not found.");
    await audit(req, handled ? "resolved" : "reopened", "message", id);
    res.json({ ok: true });
  });
  app.get("/api/admin/activity", needStaff, async (_req, res) => {
    const rows = await db.all(`select a.*, u.name as user_name, p.name as property_name, l.name as locator_name
      from audit_log a left join users u on u.id = a.user_id
      left join properties p on a.target_type = 'property' and p.id = a.target_id
      left join locators l on a.target_type = 'locator' and l.id = a.target_id
      order by a.id desc limit 100`);
    res.json({ activity: rows.map((a) => ({ id: a.id, action: a.action, targetType: a.target_type, targetId: a.target_id, targetName: a.property_name || a.locator_name || a.target_id, detail: a.detail, by: a.user_name || "", at: a.created_at })) });
  });

  // Scheduled jobs. Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; anything else gets a 404.
  const needCron = (req, _res, next) => {
    const secret = process.env.CRON_SECRET;
    next(!secret || req.get("authorization") !== `Bearer ${secret}` ? notFound("Not found.") : undefined);
  };
  // Daily clean-up of expired sessions, email links and rate-limit records.
  app.get("/api/cron/prune", needCron, async (_req, res) => res.json({ ok: true, removed: await pruneExpired(db) }));
  // Nightly backup: a compressed copy of the data in the private storage bucket. The file is named after
  // the day of the month, so each night replaces last month's copy and about 30 days are always kept.
  app.get("/api/cron/backup", needCron, async (_req, res) => {
    if (!storage.putBackup) return res.json({ ok: true, skipped: "Backups are kept in Supabase Storage, which isn't configured here." });
    const data = await exportTables(db);
    const body = gzipSync(JSON.stringify(data));
    const file = `findit-day-${data.exportedAt.slice(8, 10)}.json.gz`;
    await storage.putBackup(file, body);
    res.json({ ok: true, file, bytes: body.length, rows: Object.fromEntries(BACKUP_TABLES.map((t) => [t, data.tables[t].length])) });
  });

  // Dev/test only: read the mail log to find verification and reset links.
  if (!prod) app.get("/api/dev/outbox", async (_req, res) => res.json({ mail: await db.all("select * from outbox order by id desc limit 20") }));

  app.get("/api/health", async (_req, res) => { await db.get("select 1"); res.json({ ok: true, storage: storage.kind }); });
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  // Uploaded photos in local development. Served with a locked-down CSP so a file can never run as a page.
  if (storage.kind === "local") {
    app.use("/uploads", (_req, res, next) => { res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"); next(); },
      express.static(storage.dir, { index: false, dotfiles: "deny", maxAge: "30d", immutable: true, fallthrough: false }));
  }

  // Built front end when the API serves it itself (not on Vercel, where the CDN serves dist/).
  if (distDir && existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(resolve(distDir, "index.html")));
  }

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid request." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "That file or request is too large." });
    if (err.status === 404 || err.statusCode === 404) return res.status(404).json({ error: "Not found." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  });
  return app;
}
