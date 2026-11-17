import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, verifyPassword, newToken, hashToken, rateLimit } from "./security.js";
import { sendMail } from "./mailer.js";

const here = dirname(fileURLToPath(import.meta.url));
const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const COOKIE = "findit_session";
const REPORT_REASONS = ["Wrong or outdated information", "Broken listings link", "Not a real locator", "Inappropriate content", "Other"];

const j = (v) => { try { return JSON.parse(v); } catch { return []; } };
const locatorOut = (r) => ({
  id: r.id, name: r.name, company: r.company, area: r.area, radius: r.radius, years: r.years,
  response: r.response, tags: j(r.tags), about: r.about, image: r.image,
  serviceAreas: j(r.service_areas), zipCodes: j(r.zip_codes), languages: j(r.languages),
  contactEmail: r.contact_email || "", contactPhone: r.contact_phone || "",
  rating: r.rating, reviews: r.reviews, featured: !!r.featured, fastResponse: !!r.fast_response,
  verified: !!r.verified, listingsUrl: r.listings_url, source: r.source, status: r.status,
  lastUpdated: r.updated_at,
});
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
  if (allowRelative && u.startsWith("/") && !u.startsWith("//")) return true;
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};
const passwordProblem = (p) =>
  typeof p !== "string" || p.length < 12 || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)
    ? "Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol."
  : p.length > 200 ? "That password is too long." : null;

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const bad = (msg, code) => new HttpError(400, msg, code);

function parseLocator(body, { partial = false } = {}) {
  const out = {};
  const set = (k, v) => { if (!partial || body[k] !== undefined) out[k] = v; };
  const name = clean(body.name, 120);
  if (!partial || body.name !== undefined) { if (!name) throw bad("Name is required."); out.name = name; }
  set("company", clean(body.company, 120));
  set("area", clean(body.area, 120));
  set("radius", clean(body.radius, 30));
  if (!partial || body.years !== undefined) {
    const y = body.years === "" || body.years == null ? null : Number(body.years);
    if (y !== null && (!Number.isInteger(y) || y < 0 || y > 80)) throw bad("Years of experience must be a whole number from 0 to 80.");
    out.years = y;
  }
  set("response", clean(body.response, 80));
  if (!partial || body.contactEmail !== undefined) {
    const email = clean(body.contactEmail, 320);
    if (email && !emailOk(email)) throw bad("Enter a valid contact email address.");
    out.contact_email = email;
  }
  if (!partial || body.contactPhone !== undefined) out.contact_phone = clean(body.contactPhone, 40);
  set("about", clean(body.about, 1200));
  if (!partial || body.tags !== undefined) out.tags = JSON.stringify(list(body.tags));
  if (!partial || body.serviceAreas !== undefined) out.service_areas = JSON.stringify(list(body.serviceAreas));
  if (!partial || body.languages !== undefined) out.languages = JSON.stringify(list(body.languages, 10, 30));
  if (!partial || body.zipCodes !== undefined) {
    const zips = list(body.zipCodes, 40, 10);
    if (zips.some((z) => !/^\d{5}$/.test(z))) throw bad("ZIP codes must be 5 digits, separated by commas.");
    out.zip_codes = JSON.stringify(zips);
  }
  if (!partial || body.image !== undefined) {
    const image = clean(body.image, 500);
    if (!urlOk(image, true)) throw bad("Photo must be an https link or a site path.");
    out.image = image;
  }
  if (!partial || body.listingsUrl !== undefined) {
    const url = clean(body.listingsUrl, 500);
    if (!urlOk(url)) throw bad("The listings link must be a full https address.");
    out.listings_url = url;
  }
  set("source", clean(body.source, 120) || "Not stated");
  if (!partial || body.featured !== undefined) out.featured = body.featured ? 1 : 0;
  if (!partial || body.fastResponse !== undefined) out.fast_response = body.fastResponse ? 1 : 0;
  if (!partial || body.verified !== undefined) out.verified = body.verified ? 1 : 0;
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
  if (sort === "Most experienced") out = [...out].sort((a, b) => (b.years ?? 0) - (a.years ?? 0));
  return out;
}

export function createApp(db, { distDir = resolve(here, "../dist") } = {}) {
  const app = express();
  const prod = process.env.NODE_ENV === "production";
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "50kb" }));

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (prod) res.setHeader("Strict-Transport-Security", "max-age=15552000");
    next();
  });

  // Mutations must come from our own front end (custom header cannot be sent cross-site without CORS approval).
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.get("x-requested-with") !== "findit") return res.status(403).json({ error: "Request blocked." });
    next();
  });

  const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
  const setCookie = (res, value, maxAgeMs) =>
    res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}${prod ? "; Secure" : ""}`);

  app.use((req, _res, next) => {
    const t = cookies(req)[COOKIE];
    req.user = null;
    if (t) {
      const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`).get(hashToken(t), new Date().toISOString());
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

  const authLimit = rateLimit({ windowMs: 15 * 60000, max: 20 });

  // ---------- Auth ----------
  app.post("/api/auth/signup", authLimit, async (req, res) => {
    const name = clean(req.body.name, 80), email = clean(req.body.email, 320).toLowerCase(), password = req.body.password;
    if (name.length > 80 || name.split(/\s+/).filter(Boolean).length < 2) throw bad("Enter your full name, including at least a first and last name.");
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
    const row = db.prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'verify' AND expires_at > ?").get(hashToken(req.body.token), new Date().toISOString());
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
    const row = db.prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'reset' AND expires_at > ?").get(hashToken(req.body.token), new Date().toISOString());
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

  app.post("/api/contact", rateLimit({ windowMs: 60 * 60000, max: 5 }), async (req, res) => {
    const name = clean(req.body.name, 80), email = clean(req.body.email, 320).toLowerCase(), message = clean(req.body.message, 2000);
    if (name.length < 2) throw bad("Please enter your name.");
    if (!emailOk(email)) throw bad("Please enter a valid email address.");
    if (message.length < 10) throw bad("Please enter a message of at least 10 characters.");
    const to = process.env.CONTACT_EMAIL || (!prod ? "findit-inbox@localhost" : "");
    if (!to) throw new HttpError(503, "The contact form is temporarily unavailable. Please try again later.");
    await sendMail(db, { to, subject: `FindIt enquiry from ${name}`, text: `From: ${name} <${email}>\n\n${message}` });
    res.status(201).json({ ok: true, message: "Thanks. Your message has been sent to the FindIt team." });
  });

  // ---------- Public directory ----------
  const published = () => db.prepare("SELECT * FROM locators WHERE status = 'published' ORDER BY featured DESC, name").all().map(locatorOut);
  app.get("/api/locators", (req, res) => res.json({ locators: searchLocators(published(), req.query) }));
  app.get("/api/locators/:id", (req, res) => {
    const r = db.prepare("SELECT * FROM locators WHERE id = ? AND status = 'published'").get(req.params.id);
    if (!r) throw new HttpError(404, "That locator profile isn't available.");
    res.json({ locator: locatorOut(r) });
  });

  app.post("/api/locators/:id/report", rateLimit({ windowMs: 60 * 60000, max: 10 }), (req, res) => {
    const r = db.prepare("SELECT id FROM locators WHERE id = ? AND status = 'published'").get(req.params.id);
    if (!r) throw new HttpError(404, "That locator profile isn't available.");
    const reason = clean(req.body.reason, 80);
    if (!REPORT_REASONS.includes(reason)) throw bad("Please choose a reason.");
    db.prepare("INSERT INTO reports (locator_id, user_id, reason, details) VALUES (?,?,?,?)")
      .run(r.id, req.user?.id ?? null, reason, clean(req.body.details, 1000));
    res.status(201).json({ ok: true, message: "Thanks. Our team will review this profile." });
  });
  app.get("/api/report-reasons", (_req, res) => res.json({ reasons: REPORT_REASONS }));

  // ---------- Favourites ----------
  app.get("/api/favourites", needUser, (req, res) => {
    const rows = db.prepare(`SELECT l.* FROM favourites f JOIN locators l ON l.id = f.locator_id
      WHERE f.user_id = ? AND l.status = 'published' ORDER BY f.created_at DESC`).all(req.user.id);
    res.json({ locators: rows.map(locatorOut) });
  });
  app.put("/api/favourites/:id", needUser, (req, res) => {
    const r = db.prepare("SELECT id FROM locators WHERE id = ? AND status = 'published'").get(req.params.id);
    if (!r) throw new HttpError(404, "That locator profile isn't available.");
    db.prepare("INSERT OR IGNORE INTO favourites (user_id, locator_id) VALUES (?,?)").run(req.user.id, r.id);
    res.json({ ok: true });
  });
  app.delete("/api/favourites/:id", needUser, (req, res) => {
    db.prepare("DELETE FROM favourites WHERE user_id = ? AND locator_id = ?").run(req.user.id, req.params.id);
    res.json({ ok: true });
  });

  // ---------- Staff tools ----------
  const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "locator";
  app.get("/api/admin/locators", needStaff, (_req, res) =>
    res.json({ locators: db.prepare("SELECT * FROM locators WHERE status != 'removed' ORDER BY updated_at DESC").all().map(locatorOut) }));

  app.post("/api/admin/locators", needStaff, (req, res) => {
    const data = parseLocator(req.body);
    let id = slug(data.name);
    while (db.prepare("SELECT 1 FROM locators WHERE id = ?").get(id)) id = `${slug(data.name)}-${newToken().slice(0, 4).toLowerCase()}`;
    const status = req.body.publish ? "published" : "hidden";
    const cols = Object.keys(data);
    db.prepare(`INSERT INTO locators (id, ${cols.join(",")}, status, updated_by) VALUES (?, ${cols.map(() => "?").join(",")}, ?, ?)`)
      .run(id, ...cols.map((c) => data[c]), status, req.user.id);
    res.status(201).json({ locator: locatorOut(db.prepare("SELECT * FROM locators WHERE id = ?").get(id)) });
  });

  app.put("/api/admin/locators/:id", needStaff, (req, res) => {
    const existing = db.prepare("SELECT id FROM locators WHERE id = ? AND status != 'removed'").get(req.params.id);
    if (!existing) throw new HttpError(404, "Profile not found.");
    const data = parseLocator(req.body, { partial: true });
    const cols = Object.keys(data);
    if (cols.length) db.prepare(`UPDATE locators SET ${cols.map((c) => `${c} = ?`).join(",")}, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(...cols.map((c) => data[c]), new Date().toISOString(), req.user.id, req.params.id);
    res.json({ locator: locatorOut(db.prepare("SELECT * FROM locators WHERE id = ?").get(req.params.id)) });
  });

  // publish / hide / remove (remove is a soft delete so reports and history survive)
  app.post("/api/admin/locators/:id/status", needStaff, (req, res) => {
    const status = req.body.status;
    if (!["published", "hidden", "removed"].includes(status)) throw bad("Unknown status.");
    const r = db.prepare("UPDATE locators SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?").run(status, new Date().toISOString(), req.user.id, req.params.id);
    if (!r.changes) throw new HttpError(404, "Profile not found.");
    res.json({ ok: true });
  });

  app.get("/api/admin/reports", needStaff, (req, res) => {
    const status = ["open", "resolved", "dismissed"].includes(req.query.status) ? req.query.status : null;
    const rows = db.prepare(`SELECT r.*, l.name AS locator_name, l.status AS locator_status, u.email AS reporter_email
      FROM reports r JOIN locators l ON l.id = r.locator_id LEFT JOIN users u ON u.id = r.user_id
      ${status ? "WHERE r.status = ?" : ""} ORDER BY r.created_at DESC LIMIT 200`).all(...(status ? [status] : []));
    res.json({ reports: rows.map((r) => ({ id: r.id, locatorId: r.locator_id, locatorName: r.locator_name, locatorStatus: r.locator_status, reason: r.reason, details: r.details, status: r.status, reporter: r.reporter_email, createdAt: r.created_at, resolvedAt: r.resolved_at })) });
  });
  app.post("/api/admin/reports/:id", needStaff, (req, res) => {
    if (!["resolved", "dismissed", "open"].includes(req.body.status)) throw bad("Unknown status.");
    const r = db.prepare("UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
      .run(req.body.status, req.user.id, req.body.status === "open" ? null : new Date().toISOString(), req.params.id);
    if (!r.changes) throw new HttpError(404, "Report not found.");
    res.json({ ok: true });
  });
  app.get("/api/admin/summary", needStaff, (_req, res) => {
    const c = (sql) => db.prepare(sql).get().n;
    res.json({
      published: c("SELECT COUNT(*) n FROM locators WHERE status='published'"),
      hidden: c("SELECT COUNT(*) n FROM locators WHERE status='hidden'"),
      openReports: c("SELECT COUNT(*) n FROM reports WHERE status='open'"),
      members: c("SELECT COUNT(*) n FROM users WHERE role='member'"),
    });
  });

  // Dev/test only: read the mail log to find verification and reset links.
  if (!prod) app.get("/api/dev/outbox", (_req, res) => res.json({ mail: db.prepare("SELECT * FROM outbox ORDER BY id DESC LIMIT 20").all() }));

  app.get("/api/health", (_req, res) => { db.prepare("SELECT 1").get(); res.json({ ok: true }); });
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  // Built front end (production)
  if (existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(distDir, "index.html")));
  }

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid request." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  });
  return app;
}
