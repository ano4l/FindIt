import express from "express";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, verifyPassword, newToken, hashToken, rateLimit } from "./security.js";
import { sendMail } from "./mailer.js";
import {
  AMENITIES, AVAILABILITY, AVAILABILITY_RANK, PETS, PAGE_SIZE, CONTACT_TOPICS,
  PROPERTY_REPORT_REASONS, LOCATOR_REPORT_REASONS, STALE_DAYS, isStale, planSummary,
} from "../shared/catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const nowIso = () => new Date().toISOString();
const COOKIE = "findit_session";
const MAX_UPLOAD = 5 * 1024 * 1024;

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
  if (has("featured")) out.featured = body.featured ? 1 : 0;
  if (has("fastResponse")) out.fast_response = body.fastResponse ? 1 : 0;
  if (has("verified")) out.verified = body.verified ? 1 : 0;
  return out;
}

function searchLocators(rows, q) {
  const query = clean(q.q, 100).toLowerCase().replace(/,?\s*tx$/, "").trim();
  const area = clean(q.area, 80), specialty = clean(q.specialty, 80), filter = clean(q.filter, 40), sort = clean(q.sort, 40);
  let out = rows.filter((l) => {
    const hay = `${l.name} ${l.area} ${l.company} ${l.zipCodes.join(" ")} ${l.serviceAreas.join(" ")} ${l.tags.join(" ")}`.toLowerCase();
    const queryMatch = !query || query === "houston" || hay.includes(query);
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

function parseProperty(body, { partial = false, locatorExists } = {}) {
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
    const id = clean(body.locatorId, 80);
    if (id && !locatorExists(id)) throw bad("The linked locator doesn't exist.");
    out.locator_id = id || null;
  }
  if (has("availability")) {
    const a = clean(body.availability, 20) || "unknown";
    if (!(a in AVAILABILITY)) throw bad("Choose an availability status.");
    out.availability = a;
  }
  text("availabilityNote", "availability_note", 300);
  if (has("source")) out.source = clean(body.source, 120) || "Not stated";
  if (has("featured")) out.featured = body.featured ? 1 : 0;
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
    if (f.q && f.q !== "houston") {
      const hay = `${p.name} ${p.address} ${p.neighborhood} ${p.city} ${p.zip}`.toLowerCase();
      if (!hay.includes(f.q)) continue;
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

export function createApp(db, { distDir = resolve(here, "../dist"), uploadsDir = process.env.FINDIT_UPLOADS || resolve(here, "data/uploads") } = {}) {
  const app = express();
  const prod = process.env.NODE_ENV === "production";
  mkdirSync(uploadsDir, { recursive: true });
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

  app.use((req, _res, next) => {
    const t = cookies(req)[COOKIE];
    req.user = null;
    if (t) {
      const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`).get(hashToken(t), nowIso());
      if (row) req.user = row;
    }
    next();
  });
  const needUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, "Please sign in to continue.", "auth_required")));
  const needStaff = (req, _res, next) => (!req.user ? next(new HttpError(401, "Please sign in to continue.", "auth_required"))
    : req.user.role !== "staff" ? next(new HttpError(403, "Staff access only.")) : next());

  const origin = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  const startSession = (res, userId) => {
    const t = newToken();
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)").run(hashToken(t), userId, iso(14 * DAY));
    setCookie(res, t, 14 * DAY);
  };
  const issueToken = (userId, kind, ttl) => {
    db.prepare("DELETE FROM tokens WHERE user_id = ? AND kind = ?").run(userId, kind);
    const t = newToken();
    db.prepare("INSERT INTO tokens (token_hash, user_id, kind, expires_at) VALUES (?,?,?,?)").run(hashToken(t), userId, kind, iso(ttl));
    return t;
  };
  const sendVerify = (req, user) => sendMail(db, {
    to: user.email, subject: "Confirm your FindIt email address",
    text: `Hi ${user.name},\n\nConfirm your email to finish creating your FindIt account:\n${origin(req)}/verify-email?token=${issueToken(user.id, "verify", 2 * DAY)}\n\nThis link works for 48 hours. If you didn't sign up, you can ignore this email.`,
  });
  const audit = (req, action, targetType, targetId, detail = "") =>
    db.prepare("INSERT INTO audit_log (user_id, action, target_type, target_id, detail) VALUES (?,?,?,?,?)")
      .run(req.user?.id ?? null, action, targetType, String(targetId), clean(detail, 300));

  const authLimit = rateLimit({ windowMs: 15 * 60000, max: 20 });

  // ---------- Auth ----------
  app.post("/api/auth/signup", authLimit, async (req, res) => {
    const name = clean(req.body.name, 80), email = clean(req.body.email, 320).toLowerCase(), password = req.body.password;
    if (name.split(/\s+/).filter(Boolean).length < 2) throw bad("Enter your full name, including at least a first and last name.");
    if (!emailOk(email)) throw bad("Please enter a valid email address.");
    const pw = passwordProblem(password); if (pw) throw bad(pw);
    const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!existing) {
      const r = db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?,?,?)").run(email, name, hashPassword(password));
      await sendVerify(req, { id: Number(r.lastInsertRowid), email, name });
    } else if (!existing.email_verified) await sendVerify(req, existing);
    else await sendMail(db, { to: email, subject: "You already have a FindIt account", text: `Hi,\n\nSomeone tried to sign up with this email, but you already have an account. You can sign in or reset your password at ${origin(req)}.` });
    // Same answer either way so the form can't be used to discover who has an account.
    res.status(201).json({ ok: true, message: "Check your email for a link to confirm your address." });
  });

  app.post("/api/auth/verify", authLimit, (req, res) => {
    const row = db.prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'verify' AND expires_at > ?").get(hashToken(req.body.token), nowIso());
    if (!row) throw bad("This confirmation link is invalid or has expired. Request a new one from the sign-in page.", "bad_token");
    db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(row.user_id);
    db.prepare("DELETE FROM tokens WHERE user_id = ? AND kind = 'verify'").run(row.user_id);
    res.json({ ok: true });
  });

  app.post("/api/auth/resend", authLimit, async (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE email = ?").get(clean(req.body.email, 320).toLowerCase());
    if (u && !u.email_verified) await sendVerify(req, u);
    res.json({ ok: true, message: "If that account needs confirming, a new link is on its way." });
  });

  app.post("/api/auth/login", authLimit, (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE email = ?").get(clean(req.body.email, 320).toLowerCase());
    const ok = u ? verifyPassword(String(req.body.password ?? ""), u.password_hash) : (verifyPassword("x", hashPassword("y")), false);
    if (!ok) throw new HttpError(401, "Email or password is incorrect.", "bad_credentials");
    if (!u.email_verified) throw new HttpError(403, "Please confirm your email address first. Check your inbox for the link.", "email_not_verified");
    startSession(res, u.id);
    res.json({ user: userOut(u) });
  });

  app.post("/api/auth/logout", (req, res) => {
    const t = cookies(req)[COOKIE];
    if (t) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(t));
    setCookie(res, "", 0);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => res.json({ user: req.user ? userOut(req.user) : null }));

  app.post("/api/auth/forgot", authLimit, async (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE email = ?").get(clean(req.body.email, 320).toLowerCase());
    if (u) await sendMail(db, {
      to: u.email, subject: "Reset your FindIt password",
      text: `Hi ${u.name},\n\nChoose a new password here:\n${origin(req)}/reset-password?token=${issueToken(u.id, "reset", 60 * 60000)}\n\nThis link works for 1 hour. If you didn't ask for this, ignore this email.`,
    });
    res.json({ ok: true, message: "If an account exists for that email, a reset link is on its way." });
  });

  app.post("/api/auth/reset", authLimit, (req, res) => {
    const pw = passwordProblem(req.body.password); if (pw) throw bad(pw);
    const row = db.prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'reset' AND expires_at > ?").get(hashToken(req.body.token), nowIso());
    if (!row) throw bad("This reset link is invalid or has expired. Request a new one.", "bad_token");
    db.prepare("UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?").run(hashPassword(req.body.password), row.user_id);
    db.prepare("DELETE FROM tokens WHERE user_id = ?").run(row.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id); // sign out everywhere
    res.json({ ok: true });
  });

  app.post("/api/auth/password", authLimit, needUser, (req, res) => {
    const current = String(req.body.currentPassword ?? "");
    if (!verifyPassword(current, req.user.password_hash)) throw new HttpError(401, "Current password is incorrect.", "bad_credentials");
    const pw = passwordProblem(req.body.password); if (pw) throw bad(pw);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(req.body.password), req.user.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.user.id);
    startSession(res, req.user.id);
    res.json({ ok: true, message: "Password changed." });
  });

  app.post("/api/contact", rateLimit({ name: "contact", windowMs: 60 * 60000, max: 5 }), async (req, res) => {
    const name = clean(req.body.name, 80), email = clean(req.body.email, 320).toLowerCase(), message = clean(req.body.message, 2000);
    const topic = CONTACT_TOPICS.includes(req.body.topic) ? req.body.topic : CONTACT_TOPICS[0];
    if (name.length < 2) throw bad("Please enter your name.");
    if (!emailOk(email)) throw bad("Please enter a valid email address.");
    if (message.length < 10) throw bad("Please enter a message of at least 10 characters.");
    const to = process.env.CONTACT_EMAIL || (!prod ? "findit-inbox@localhost" : "");
    if (!to) throw new HttpError(503, "The contact form is temporarily unavailable. Please try again later.");
    await sendMail(db, { to, subject: `FindIt enquiry (${topic}) from ${name}`, text: `From: ${name} <${email}>\nTopic: ${topic}\n\n${message}` });
    res.status(201).json({ ok: true, message: "Thanks. Your message has been sent to the FindIt team. We usually reply within two working days." });
  });

  // ---------- Public catalogue ----------
  const publishedProperties = () => db.prepare("SELECT * FROM properties WHERE status = 'published'").all().map(propertyOut);
  const publicProperty = (p) => { const { status, ...rest } = p; return rest; };

  app.get("/api/properties", (req, res) => {
    const filters = propertyFilters(req.query);
    const results = searchProperties(publishedProperties(), filters);
    const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize, 10) || PAGE_SIZE, 1), 48);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    res.json({
      properties: results.slice((page - 1) * pageSize, page * pageSize).map(publicProperty),
      total: results.length, page, pageSize,
    });
  });
  app.get("/api/properties/:id", (req, res) => {
    const r = db.prepare("SELECT * FROM properties WHERE id = ? AND status = 'published'").get(req.params.id);
    if (!r) throw notFound("That listing isn't available.");
    const loc = r.locator_id ? db.prepare("SELECT * FROM locators WHERE id = ? AND status = 'published'").get(r.locator_id) : null;
    res.json({ property: publicProperty(propertyOut(r)), locator: loc ? locatorBrief(loc) : null });
  });
  app.get("/api/catalog", (_req, res) => res.json({
    amenities: AMENITIES, availability: AVAILABILITY, pets: PETS,
    reportReasons: { property: PROPERTY_REPORT_REASONS, locator: LOCATOR_REPORT_REASONS }, contactTopics: CONTACT_TOPICS,
  }));

  const published = () => db.prepare("SELECT * FROM locators WHERE status = 'published' ORDER BY featured DESC, name").all().map(locatorOut);
  app.get("/api/locators", (req, res) => res.json({ locators: searchLocators(published(), req.query) }));
  app.get("/api/locators/:id", (req, res) => {
    const r = db.prepare("SELECT * FROM locators WHERE id = ? AND status = 'published'").get(req.params.id);
    if (!r) throw notFound("That locator profile isn't available.");
    const properties = db.prepare("SELECT * FROM properties WHERE locator_id = ? AND status = 'published' ORDER BY name").all(r.id).map((p) => publicProperty(propertyOut(p)));
    res.json({ locator: locatorOut(r), properties });
  });

  // ---------- Reports ----------
  const reportLimit = rateLimit({ name: "report", windowMs: 60 * 60000, max: 10 });
  const fileReport = (kind, table, reasons) => (req, res) => {
    const r = db.prepare(`SELECT id FROM ${table} WHERE id = ? AND status = 'published'`).get(req.params.id);
    if (!r) throw notFound(kind === "property" ? "That listing isn't available." : "That locator profile isn't available.");
    const reason = clean(req.body.reason, 80);
    if (!reasons.includes(reason)) throw bad("Please choose a reason.");
    db.prepare(`INSERT INTO reports (${kind === "property" ? "property_id" : "locator_id"}, user_id, reason, details) VALUES (?,?,?,?)`)
      .run(r.id, req.user?.id ?? null, reason, clean(req.body.details, 1000));
    res.status(201).json({ ok: true, message: "Thanks. Our team will review this and correct it if needed." });
  };
  app.post("/api/properties/:id/report", reportLimit, fileReport("property", "properties", PROPERTY_REPORT_REASONS));
  app.post("/api/locators/:id/report", reportLimit, fileReport("locator", "locators", LOCATOR_REPORT_REASONS));
  app.get("/api/report-reasons", (_req, res) => res.json({ reasons: LOCATOR_REPORT_REASONS, property: PROPERTY_REPORT_REASONS }));

  // ---------- Favourites ----------
  app.get("/api/favourites", needUser, (req, res) => {
    const locators = db.prepare(`SELECT l.* FROM favourites f JOIN locators l ON l.id = f.locator_id
      WHERE f.user_id = ? AND l.status = 'published' ORDER BY f.created_at DESC`).all(req.user.id).map(locatorOut);
    const properties = db.prepare(`SELECT p.* FROM property_favourites f JOIN properties p ON p.id = f.property_id
      WHERE f.user_id = ? AND p.status = 'published' ORDER BY f.created_at DESC`).all(req.user.id).map((p) => publicProperty(propertyOut(p)));
    res.json({ locators, properties });
  });
  const favouriteRoutes = (kind, table, favTable, col, missing) => {
    app.put(`/api/favourites/${kind}/:id`, needUser, (req, res) => {
      const r = db.prepare(`SELECT id FROM ${table} WHERE id = ? AND status = 'published'`).get(req.params.id);
      if (!r) throw notFound(missing);
      db.prepare(`INSERT OR IGNORE INTO ${favTable} (user_id, ${col}) VALUES (?,?)`).run(req.user.id, r.id);
      res.json({ ok: true });
    });
    app.delete(`/api/favourites/${kind}/:id`, needUser, (req, res) => {
      db.prepare(`DELETE FROM ${favTable} WHERE user_id = ? AND ${col} = ?`).run(req.user.id, req.params.id);
      res.json({ ok: true });
    });
  };
  favouriteRoutes("locators", "locators", "favourites", "locator_id", "That locator profile isn't available.");
  favouriteRoutes("properties", "properties", "property_favourites", "property_id", "That listing isn't available.");

  // ---------- Staff tools ----------
  const slug = (s, fallback) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || fallback;
  const uniqueId = (table, name, fallback) => {
    let id = slug(name, fallback);
    while (db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) id = `${slug(name, fallback)}-${newToken().slice(0, 4).toLowerCase()}`;
    return id;
  };
  const insertRow = (table, id, data, status, userId) => {
    const cols = Object.keys(data);
    db.prepare(`INSERT INTO ${table} (id, ${cols.join(",")}, status, updated_by) VALUES (?, ${cols.map(() => "?").join(",")}, ?, ?)`)
      .run(id, ...cols.map((c) => data[c]), status, userId);
  };
  // Keeps only the columns whose value actually differs from the stored row.
  const changedOnly = (existing, data) => Object.fromEntries(Object.entries(data).filter(([c, v]) => (existing[c] ?? null) !== (v ?? null)));
  const fieldNames = (cols) => cols.map((c) => c.replace(/_/g, " ")).join(", ");
  const updateRow = (table, id, data, userId) => {
    const cols = Object.keys(data);
    if (!cols.length) return;
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(",")}, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(...cols.map((c) => data[c]), nowIso(), userId, id);
  };
  const staffRow = (table, out) => (id) => {
    const r = db.prepare(`SELECT t.*, u.name AS updated_by_name FROM ${table} t LEFT JOIN users u ON u.id = t.updated_by WHERE t.id = ?`).get(id);
    return r && { ...out(r), updatedBy: r.updated_by_name || "" };
  };
  const staffLocator = staffRow("locators", locatorOut);
  const staffProperty = staffRow("properties", propertyOut);
  const statusRoute = (path, table, targetType) => app.post(path, needStaff, (req, res) => {
    const status = req.body.status;
    if (!["published", "hidden", "removed"].includes(status)) throw bad("Unknown status.");
    const r = db.prepare(`UPDATE ${table} SET status = ?, updated_at = ?, updated_by = ? WHERE id = ? AND status != 'removed'`).run(status, nowIso(), req.user.id, req.params.id);
    if (!r.changes) throw notFound("Record not found.");
    audit(req, status === "published" ? "published" : status === "hidden" ? "hid" : "removed", targetType, req.params.id);
    res.json({ ok: true });
  });

  // Locator profiles
  app.get("/api/admin/locators", needStaff, (_req, res) =>
    res.json({ locators: db.prepare("SELECT id FROM locators WHERE status != 'removed' ORDER BY updated_at DESC").all().map((r) => staffLocator(r.id)) }));
  app.post("/api/admin/locators", needStaff, (req, res) => {
    const data = parseLocator(req.body);
    const id = uniqueId("locators", data.name, "locator");
    insertRow("locators", id, data, req.body.publish ? "published" : "hidden", req.user.id);
    audit(req, "created", "locator", id, data.name);
    res.status(201).json({ locator: staffLocator(id) });
  });
  app.put("/api/admin/locators/:id", needStaff, (req, res) => {
    const existing = db.prepare("SELECT * FROM locators WHERE id = ? AND status != 'removed'").get(req.params.id);
    if (!existing) throw notFound("Profile not found.");
    const data = changedOnly(existing, parseLocator(req.body, { partial: true }));
    if (Object.keys(data).length) {
      updateRow("locators", req.params.id, data, req.user.id);
      audit(req, "edited", "locator", req.params.id, fieldNames(Object.keys(data)));
    }
    res.json({ locator: staffLocator(req.params.id) });
  });
  statusRoute("/api/admin/locators/:id/status", "locators", "locator");

  // Property listings
  const locatorExists = (id) => !!db.prepare("SELECT 1 FROM locators WHERE id = ? AND status != 'removed'").get(id);
  app.get("/api/admin/properties", needStaff, (_req, res) =>
    res.json({ properties: db.prepare("SELECT id FROM properties WHERE status != 'removed' ORDER BY updated_at DESC").all().map((r) => staffProperty(r.id)) }));
  app.get("/api/admin/properties/:id", needStaff, (req, res) => {
    const p = staffProperty(req.params.id);
    if (!p || p.status === "removed") throw notFound("Listing not found.");
    const history = db.prepare(`SELECT a.action, a.detail, a.created_at, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.target_type = 'property' AND a.target_id = ? ORDER BY a.id DESC LIMIT 20`).all(req.params.id)
      .map((h) => ({ action: h.action, detail: h.detail, at: h.created_at, by: h.name || "" }));
    res.json({ property: p, history });
  });
  app.post("/api/admin/properties", needStaff, (req, res) => {
    const data = parseProperty(req.body, { locatorExists });
    if ("availability" in data) data.availability_checked_at = nowIso();
    const id = uniqueId("properties", data.name, "listing");
    insertRow("properties", id, data, req.body.publish ? "published" : "hidden", req.user.id);
    audit(req, "created", "property", id, data.name);
    res.status(201).json({ property: staffProperty(id) });
  });
  app.put("/api/admin/properties/:id", needStaff, (req, res) => {
    const existing = db.prepare("SELECT * FROM properties WHERE id = ? AND status != 'removed'").get(req.params.id);
    if (!existing) throw notFound("Listing not found.");
    const data = changedOnly(existing, parseProperty(req.body, { partial: true, locatorExists }));
    const fields = Object.keys(data);
    // A new availability status or note, or an explicit "I checked today", counts as a fresh check.
    if ("availability" in data || "availability_note" in data || req.body.confirmAvailability) data.availability_checked_at = nowIso();
    if (Object.keys(data).length) {
      updateRow("properties", req.params.id, data, req.user.id);
      audit(req, fields.length ? "edited" : "availability", "property", req.params.id,
        fields.length ? fieldNames(fields) : "Confirmed unchanged");
    }
    res.json({ property: staffProperty(req.params.id) });
  });
  // Quick availability update; also used to confirm that unchanged availability is still correct.
  app.post("/api/admin/properties/:id/availability", needStaff, (req, res) => {
    const availability = clean(req.body.availability, 20);
    if (!(availability in AVAILABILITY)) throw bad("Choose an availability status.");
    const note = req.body.note === undefined ? null : clean(req.body.note, 300);
    const r = db.prepare(`UPDATE properties SET availability = ?, availability_note = COALESCE(?, availability_note),
      availability_checked_at = ?, updated_at = ?, updated_by = ? WHERE id = ? AND status != 'removed'`)
      .run(availability, note, nowIso(), nowIso(), req.user.id, req.params.id);
    if (!r.changes) throw notFound("Listing not found.");
    audit(req, "availability", "property", req.params.id, AVAILABILITY[availability]);
    res.json({ property: staffProperty(req.params.id) });
  });
  statusRoute("/api/admin/properties/:id/status", "properties", "property");

  // Photo uploads (JPEG, PNG or WebP, sent as the raw request body).
  app.post("/api/admin/uploads", needStaff, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_UPLOAD }), (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const ext = imageType(body);
    if (!ext) throw bad("Upload a JPEG, PNG or WebP image under 5 MB.");
    const name = `${newToken().slice(0, 24)}.${ext}`;
    writeFileSync(resolve(uploadsDir, name), body);
    audit(req, "uploaded", "photo", name);
    res.status(201).json({ url: `/uploads/${name}` });
  });

  // Reports
  app.get("/api/admin/reports", needStaff, (req, res) => {
    const status = ["open", "resolved", "dismissed"].includes(req.query.status) ? req.query.status : null;
    const rows = db.prepare(`SELECT r.*, l.name AS locator_name, l.status AS locator_status, p.name AS property_name, p.status AS property_status, u.email AS reporter_email
      FROM reports r LEFT JOIN locators l ON l.id = r.locator_id LEFT JOIN properties p ON p.id = r.property_id LEFT JOIN users u ON u.id = r.user_id
      ${status ? "WHERE r.status = ?" : ""} ORDER BY r.created_at DESC LIMIT 200`).all(...(status ? [status] : []));
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
  app.post("/api/admin/reports/:id", needStaff, (req, res) => {
    if (!["resolved", "dismissed", "open"].includes(req.body.status)) throw bad("Unknown status.");
    const r = db.prepare("UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
      .run(req.body.status, req.user.id, req.body.status === "open" ? null : nowIso(), req.params.id);
    if (!r.changes) throw notFound("Report not found.");
    audit(req, req.body.status === "open" ? "reopened" : req.body.status, "report", req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/admin/summary", needStaff, (_req, res) => {
    const c = (sql, ...args) => db.prepare(sql).get(...args).n;
    const staleBefore = new Date(Date.now() - STALE_DAYS * DAY).toISOString();
    res.json({
      listingsPublished: c("SELECT COUNT(*) n FROM properties WHERE status='published'"),
      listingsHidden: c("SELECT COUNT(*) n FROM properties WHERE status='hidden'"),
      staleListings: c("SELECT COUNT(*) n FROM properties WHERE status='published' AND (availability_checked_at IS NULL OR availability_checked_at < ?)", staleBefore),
      published: c("SELECT COUNT(*) n FROM locators WHERE status='published'"),
      hidden: c("SELECT COUNT(*) n FROM locators WHERE status='hidden'"),
      openReports: c("SELECT COUNT(*) n FROM reports WHERE status='open'"),
      members: c("SELECT COUNT(*) n FROM users WHERE role='member'"),
    });
  });
  app.get("/api/admin/activity", needStaff, (_req, res) => {
    const rows = db.prepare(`SELECT a.*, u.name AS user_name, p.name AS property_name, l.name AS locator_name
      FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN properties p ON a.target_type = 'property' AND p.id = a.target_id
      LEFT JOIN locators l ON a.target_type = 'locator' AND l.id = a.target_id
      ORDER BY a.id DESC LIMIT 100`).all();
    res.json({ activity: rows.map((a) => ({ id: a.id, action: a.action, targetType: a.target_type, targetId: a.target_id, targetName: a.property_name || a.locator_name || a.target_id, detail: a.detail, by: a.user_name || "", at: a.created_at })) });
  });

  // Dev/test only: read the mail log to find verification and reset links.
  if (!prod) app.get("/api/dev/outbox", (_req, res) => res.json({ mail: db.prepare("SELECT * FROM outbox ORDER BY id DESC LIMIT 20").all() }));

  app.get("/api/health", (_req, res) => { db.prepare("SELECT 1").get(); res.json({ ok: true }); });
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  // Uploaded photos. Served with a locked-down CSP so a file can never run as a page.
  app.use("/uploads", (_req, res, next) => { res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"); next(); },
    express.static(uploadsDir, { index: false, dotfiles: "deny", maxAge: "30d", immutable: true, fallthrough: false }));

  // Built front end (production)
  if (existsSync(distDir)) {
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
