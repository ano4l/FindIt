import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, seedLocators, seedProperties } from "./db.js";
import { createApp } from "./app.js";
import { hashPassword } from "./security.js";

process.env.NODE_ENV = "test";
let server, base, db, tmp;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "findit-test-"));
  db = openDb(":memory:"); seedLocators(db); seedProperties(db);
  db.prepare("INSERT INTO users (email,name,password_hash,role,email_verified) VALUES ('staff@x.com','Staff Person',?,'staff',1)").run(hashPassword("staffpass1"));
  server = createApp(db, { distDir: "/nonexistent", uploadsDir: join(tmp, "uploads") }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(tmp, { recursive: true, force: true }); });

function client() {
  let cookie = "";
  return async (method, path, body, headers = {}) => {
    const raw = Buffer.isBuffer(body);
    const r = await fetch(base + path, {
      method, headers: { "content-type": "application/json", "x-requested-with": "findit", ...(cookie ? { cookie } : {}), ...headers },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0].endsWith("=") ? "" : sc.split(";")[0];
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) };
  };
}
const lastLink = (re) => db.prepare("SELECT body FROM outbox ORDER BY id DESC LIMIT 1").get().body.match(re)[1];
const staff = async () => { const s = client(); await s("POST", "/api/auth/login", { email: "staff@x.com", password: "staffpass1" }); return s; };
async function member(email) {
  const c = client();
  await c("POST", "/api/auth/signup", { name: "Test Member", email, password: "MemberPass1!Long" });
  await c("POST", "/api/auth/verify", { token: lastLink(/verify-email\?token=(\S+)/) });
  await c("POST", "/api/auth/login", { email, password: "MemberPass1!Long" });
  return c;
}
const ids = (r) => r.body.properties.map((p) => p.id).sort();

test("public locator search: filters, ZIP, empty result", async () => {
  const c = client();
  assert.equal((await c("GET", "/api/locators")).body.locators.length, 6);
  assert.equal((await c("GET", "/api/locators?q=77380")).body.locators.length, 2);
  assert.equal((await c("GET", "/api/locators?specialty=Luxury")).body.locators.length, 2);
  assert.equal((await c("GET", "/api/locators?q=nowhere-zzz")).body.locators.length, 0);
  const l = (await c("GET", "/api/locators")).body.locators[0];
  assert.ok(l.listingsUrl.startsWith("https://") && l.source && l.lastUpdated);
  const profile = await c("GET", "/api/locators/marcus-lee");
  assert.deepEqual(profile.body.properties.map((p) => p.id).sort(), ["main-street-tower", "montrose-gardens"], "locator profile lists linked apartments");
});

test("property search: location, beds, baths, price, move-in, availability, amenities, pets, sort, paging", async () => {
  const c = client();
  const all = await c("GET", "/api/properties");
  assert.equal(all.body.total, 12);
  assert.equal(all.body.properties.length, 12);
  const first = all.body.properties[0];
  assert.ok(first.featured, "recommended sort puts featured listings first");
  assert.equal(first.status, undefined, "internal status is not exposed");
  assert.ok(first.source && first.lastUpdated && first.availabilityCheckedAt && first.summary.rent);

  assert.deepEqual(ids(await c("GET", "/api/properties?q=77006")), ["midtown-commons", "montrose-gardens"]);
  assert.deepEqual(ids(await c("GET", "/api/properties?q=the heights, tx")), ["yale-street-lofts"]);
  assert.deepEqual(ids(await c("GET", "/api/properties?beds=0")), ["holcombe-medical-commons", "main-street-tower", "midtown-commons", "yale-street-lofts"]);
  assert.deepEqual(ids(await c("GET", "/api/properties?beds=3")), ["energy-corridor-commons", "main-street-tower", "memorial-park-terrace", "post-oak-place"], "3 means 3 or more");
  assert.deepEqual(ids(await c("GET", "/api/properties?maxRent=1300")), ["energy-corridor-commons", "holcombe-medical-commons", "midtown-commons", "yale-street-lofts"]);
  assert.deepEqual(ids(await c("GET", "/api/properties?beds=2&maxRent=1500")), ["energy-corridor-commons"], "bed and price filters apply to the same floor plan");
  assert.deepEqual(ids(await c("GET", "/api/properties?minRent=5000")), ["main-street-tower", "post-oak-place"]);
  assert.deepEqual(ids(await c("GET", "/api/properties?baths=2.5")), ["main-street-tower", "memorial-park-terrace", "post-oak-place"]);
  assert.deepEqual(ids(await c("GET", "/api/properties?amenities=Pool,Dog park")), ["energy-corridor-commons", "memorial-park-terrace", "montrose-gardens", "woodlands-waterway-apartments"]);
  assert.ok(!ids(await c("GET", "/api/properties?pets=dogs")).includes("hermann-park-residences"), "cats-only excluded from dog search");
  assert.ok(ids(await c("GET", "/api/properties?pets=cats")).includes("hermann-park-residences"));

  const available = ids(await c("GET", "/api/properties?availability=available"));
  assert.ok(!available.includes("eado-station") && !available.includes("rice-village-flats") && !available.includes("memorial-park-terrace"));
  assert.ok(ids(await c("GET", "/api/properties?availability=upcoming")).includes("eado-station"));

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const now = ids(await c("GET", `/api/properties?moveIn=${today}`));
  assert.ok(now.includes("yale-street-lofts") && !now.includes("eado-station"), "EaDo Station isn't ready until next month");
  assert.ok(!now.includes("midtown-commons") && !now.includes("memorial-park-terrace"), "unavailable and unconfirmed listings drop out of move-in searches");
  assert.ok(ids(await c("GET", `/api/properties?moveIn=${soon}`)).includes("eado-station"));
  assert.deepEqual(ids(await c("GET", `/api/properties?moveIn=${today}&beds=2&q=museum`)), [], "full two bedrooms don't match a move-in date");

  const cheap = (await c("GET", "/api/properties?sort=price-asc")).body.properties.map((p) => p.summary.rent?.[0]);
  assert.deepEqual(cheap.filter((n) => n != null), [...cheap.filter((n) => n != null)].sort((a, b) => a - b));
  const filtered = (await c("GET", "/api/properties?beds=2&sort=price-asc")).body.properties;
  assert.equal(filtered[0].match.rentFrom, 1380, "price sort uses the cheapest matching floor plan");

  const page2 = await c("GET", "/api/properties?pageSize=5&page=3");
  assert.equal(page2.body.properties.length, 2); assert.equal(page2.body.total, 12);
  assert.equal((await c("GET", "/api/properties?q=nowhere-zzz")).body.total, 0);
  assert.equal((await c("GET", "/api/properties?beds=banana&moveIn=not-a-date")).body.total, 12, "bad filter values are ignored");
});

test("property detail shows the linked locator; hidden listings are not public", async () => {
  const c = client();
  const d = await c("GET", "/api/properties/yale-street-lofts");
  assert.equal(d.status, 200);
  assert.equal(d.body.property.floorPlans.length, 3);
  assert.equal(d.body.locator.id, "alexis-ramirez");
  assert.equal(d.body.property.availabilityStale, false);
  assert.equal((await c("GET", "/api/properties/memorial-park-terrace")).body.property.availabilityStale, true);
  assert.equal((await c("GET", "/api/properties/no-such-place")).status, 404);
});

test("mutations without the app header are blocked", async () => {
  const r = await fetch(base + "/api/auth/logout", { method: "POST" });
  assert.equal(r.status, 403);
});

test("sign up -> must verify -> login -> favourites -> logout", async () => {
  const c = client();
  assert.equal((await c("POST", "/api/auth/signup", { name: "Ann", email: "ann@example.com", password: "GoodPass1!Long" })).status, 400, "full name is required");
  assert.equal((await c("POST", "/api/auth/signup", { name: "Ann Lee", email: "ann@bad..com", password: "GoodPass1!Long" })).status, 400, "malformed email is rejected");
  assert.equal((await c("POST", "/api/auth/signup", { name: "Ann Lee", email: "ann@example.com", password: "longenough1" })).status, 400, "weak password is rejected");
  assert.equal((await c("POST", "/api/auth/signup", { name: "Ann Lee", email: "Ann@Example.com", password: "GoodPass1!Long" })).status, 201);
  const early = await c("POST", "/api/auth/login", { email: "ann@example.com", password: "GoodPass1!Long" });
  assert.equal(early.status, 403); assert.equal(early.body.code, "email_not_verified");
  const token = lastLink(/verify-email\?token=(\S+)/);
  assert.equal((await c("POST", "/api/auth/verify", { token: "nope" })).status, 400);
  assert.equal((await c("POST", "/api/auth/verify", { token })).status, 200);
  assert.equal((await c("POST", "/api/auth/verify", { token })).status, 400, "token is single use");
  assert.equal((await c("POST", "/api/auth/login", { email: "ann@example.com", password: "wrong-pass" })).status, 401);
  const ok = await c("POST", "/api/auth/login", { email: "ann@example.com", password: "GoodPass1!Long" });
  assert.equal(ok.status, 200); assert.equal(ok.body.user.role, "member");
  assert.equal((await c("GET", "/api/auth/me")).body.user.email, "ann@example.com");
  assert.equal((await c("PUT", "/api/favourites/locators/marcus-lee")).status, 200);
  assert.equal((await c("PUT", "/api/favourites/properties/yale-street-lofts")).status, 200);
  assert.equal((await c("PUT", "/api/favourites/properties/yale-street-lofts")).status, 200, "saving twice is harmless");
  assert.equal((await c("PUT", "/api/favourites/properties/no-such-place")).status, 404);
  const favs = (await c("GET", "/api/favourites")).body;
  assert.deepEqual(favs.locators.map((l) => l.id), ["marcus-lee"]);
  assert.deepEqual(favs.properties.map((p) => p.id), ["yale-street-lofts"]);
  assert.equal((await c("DELETE", "/api/favourites/locators/marcus-lee")).status, 200);
  assert.equal((await c("DELETE", "/api/favourites/properties/yale-street-lofts")).status, 200);
  assert.deepEqual((await c("GET", "/api/favourites")).body.properties, []);
  await c("POST", "/api/auth/logout");
  assert.equal((await c("GET", "/api/auth/me")).body.user, null);
  assert.equal((await c("GET", "/api/favourites")).status, 401);
  assert.equal((await c("PUT", "/api/favourites/properties/yale-street-lofts")).status, 401);
});

test("forgot + reset password, old sessions end", async () => {
  const c = client(); const other = client();
  await c("POST", "/api/auth/signup", { name: "Bo Ray", email: "bo@example.com", password: "OriginalPass1!" });
  await c("POST", "/api/auth/verify", { token: lastLink(/verify-email\?token=(\S+)/) });
  await other("POST", "/api/auth/login", { email: "bo@example.com", password: "OriginalPass1!" });
  const unknown = await c("POST", "/api/auth/forgot", { email: "ghost@example.com" });
  assert.equal(unknown.status, 200, "same answer for unknown emails");
  await c("POST", "/api/auth/forgot", { email: "bo@example.com" });
  const token = lastLink(/reset-password\?token=(\S+)/);
  assert.equal((await c("POST", "/api/auth/reset", { token, password: "short" })).status, 400);
  assert.equal((await c("POST", "/api/auth/reset", { token, password: "BrandNewPass1!" })).status, 200);
  assert.equal((await other("GET", "/api/auth/me")).body.user, null);
  assert.equal((await c("POST", "/api/auth/login", { email: "bo@example.com", password: "OriginalPass1!" })).status, 401);
  assert.equal((await c("POST", "/api/auth/login", { email: "bo@example.com", password: "BrandNewPass1!" })).status, 200);
  assert.equal((await c("POST", "/api/auth/password", { currentPassword: "wrong-pass", password: "AnotherNewPass1!" })).status, 401);
  assert.equal((await c("POST", "/api/auth/password", { currentPassword: "BrandNewPass1!", password: "AnotherNewPass1!" })).status, 200);
  assert.equal((await c("GET", "/api/auth/me")).body.user.email, "bo@example.com", "password update rotates and preserves this session");
  assert.equal((await other("POST", "/api/auth/login", { email: "bo@example.com", password: "BrandNewPass1!" })).status, 401);
  assert.equal((await other("POST", "/api/auth/login", { email: "bo@example.com", password: "AnotherNewPass1!" })).status, 200);
});

test("staff locator tools are locked to staff; add/edit/hide/publish/remove", async () => {
  const anon = client();
  assert.equal((await anon("GET", "/api/admin/locators")).status, 401);
  const m = await member("mem@example.com");
  assert.equal((await m("GET", "/api/admin/locators")).status, 403);
  assert.equal((await m("GET", "/api/admin/properties")).status, 403);

  const s = await staff();
  assert.equal((await s("POST", "/api/admin/locators", { name: "X", listingsUrl: "http://insecure.example" })).status, 400);
  const created = await s("POST", "/api/admin/locators", { name: "Dana Cruz", company: "Cruz Co", tags: "Luxury, Corporate", zipCodes: "77002,77019", listingsUrl: "https://example.com/dana", contactEmail: "dana@example.com", contactPhone: "+17135551212", source: "Client supplied" });
  assert.equal(created.status, 201);
  const id = created.body.locator.id;
  assert.equal(created.body.locator.status, "hidden");
  assert.equal(created.body.locator.contactEmail, "dana@example.com");
  assert.equal(created.body.locator.updatedBy, "Staff Person");
  assert.equal((await anon("GET", `/api/locators/${id}`)).status, 404, "hidden profiles are not public");
  await s("POST", `/api/admin/locators/${id}/status`, { status: "published" });
  const publicProfile = await anon("GET", `/api/locators/${id}`);
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.body.locator.contactEmail, "dana@example.com");
  const edit = await s("PUT", `/api/admin/locators/${id}`, { company: "Cruz & Co" });
  assert.equal(edit.body.locator.company, "Cruz & Co");
  assert.equal(edit.body.locator.name, "Dana Cruz", "partial edits keep other fields");
  await s("POST", `/api/admin/locators/${id}/status`, { status: "hidden" });
  assert.equal((await anon("GET", "/api/locators")).body.locators.some((l) => l.id === id), false);
  await s("POST", `/api/admin/locators/${id}/status`, { status: "removed" });
  assert.equal((await s("GET", "/api/admin/locators")).body.locators.some((l) => l.id === id), false);
  assert.equal((await s("POST", `/api/admin/locators/${id}/status`, { status: "published" })).status, 404, "removed records stay removed");
});

test("staff listing tools: validate, create, publish, edit, availability, hide, remove, history", async () => {
  const anon = client();
  const s = await staff();
  const plan = { name: "A1", beds: 1, baths: 1, sqft: 700, rentMin: 1400, rentMax: 1500, availableFrom: "", units: 2 };
  assert.equal((await s("POST", "/api/admin/properties", { name: "" })).status, 400);
  assert.equal((await s("POST", "/api/admin/properties", { name: "Bad", floorPlans: [{ ...plan, rentMin: 2000, rentMax: 1000 }] })).status, 400);
  assert.equal((await s("POST", "/api/admin/properties", { name: "Bad", floorPlans: [{ ...plan, baths: 1.3 }] })).status, 400);
  assert.equal((await s("POST", "/api/admin/properties", { name: "Bad", floorPlans: [{ ...plan, availableFrom: "2026-02-31" }] })).status, 400);
  assert.equal((await s("POST", "/api/admin/properties", { name: "Bad", zip: "7700" })).status, 400);
  assert.equal((await s("POST", "/api/admin/properties", { name: "Bad", photos: ["javascript:alert(1)"] })).status, 400);
  assert.equal((await s("POST", "/api/admin/properties", { name: "Bad", tourUrl: "http://insecure.example" })).status, 400);
  assert.equal((await s("POST", "/api/admin/properties", { name: "Bad", locatorId: "nobody" })).status, 400);
  assert.equal((await s("POST", "/api/admin/properties", { name: "Bad", pets: "llamas" })).status, 400);

  const created = await s("POST", "/api/admin/properties", {
    name: "Bayou Bend Apartments", address: "100 block of Test St", neighborhood: "Memorial", zip: "77007",
    floorPlans: [plan, { name: "B1", beds: 2, baths: 2, rentMin: 1900 }], amenities: ["Pool", "EV charging"],
    photos: ["/assets/properties/pool.svg"], pets: "cats-only", availability: "available", locatorId: "alexis-ramirez",
    contactPhone: "(713) 555-0199", tourUrl: "https://example.com/tour", source: "Property manager email",
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const p = created.body.property;
  assert.equal(p.status, "hidden");
  assert.equal(p.floorPlans[1].rentMax, 1900, "a single rent becomes both ends of the range");
  assert.ok(p.availabilityCheckedAt);
  assert.equal((await anon("GET", `/api/properties/${p.id}`)).status, 404, "new listings start hidden");
  assert.equal((await s("POST", `/api/admin/properties/${p.id}/status`, { status: "published" })).status, 200);
  assert.ok(ids(await anon("GET", "/api/properties?q=bayou")).includes(p.id));

  const edited = await s("PUT", `/api/admin/properties/${p.id}`, { incentives: "One month free" });
  assert.equal(edited.body.property.incentives, "One month free");
  assert.equal(edited.body.property.name, "Bayou Bend Apartments", "partial edits keep other fields");
  assert.equal(edited.body.property.availabilityCheckedAt, p.availabilityCheckedAt, "unrelated edits don't re-confirm availability");
  const resend = await s("PUT", `/api/admin/properties/${p.id}`, { ...edited.body.property });
  assert.equal(resend.body.property.lastUpdated, edited.body.property.lastUpdated, "saving an unchanged form changes nothing");

  const seeded = (await s("GET", "/api/admin/properties/yale-street-lofts")).body.property;
  const noop = await s("PUT", "/api/admin/properties/yale-street-lofts", seeded);
  assert.equal(noop.body.property.lastUpdated, seeded.lastUpdated, "seeded listings round-trip without spurious changes");
  assert.equal((await s("GET", "/api/admin/properties/yale-street-lofts")).body.history.length, 0);

  await new Promise((r) => setTimeout(r, 5));
  const av = await s("POST", `/api/admin/properties/${p.id}/availability`, { availability: "waitlist", note: "Full until spring" });
  assert.equal(av.body.property.availability, "waitlist");
  assert.equal(av.body.property.availabilityNote, "Full until spring");
  assert.ok(av.body.property.availabilityCheckedAt > p.availabilityCheckedAt);
  assert.equal((await s("POST", `/api/admin/properties/${p.id}/availability`, { availability: "maybe" })).status, 400);
  assert.ok(!ids(await anon("GET", "/api/properties?availability=available")).includes(p.id));

  const detail = await s("GET", `/api/admin/properties/${p.id}`);
  assert.deepEqual(detail.body.history.map((h) => h.action), ["availability", "edited", "published", "created"]);
  assert.equal(detail.body.history[0].by, "Staff Person");

  await s("POST", `/api/admin/properties/${p.id}/status`, { status: "hidden" });
  assert.equal((await anon("GET", `/api/properties/${p.id}`)).status, 404);
  await s("POST", `/api/admin/properties/${p.id}/status`, { status: "removed" });
  assert.equal((await s("GET", "/api/admin/properties")).body.properties.some((x) => x.id === p.id), false);

  const summary = (await s("GET", "/api/admin/summary")).body;
  assert.equal(summary.listingsPublished, 12);
  assert.ok(summary.staleListings >= 2, "Hermann Park and Memorial Park Terrace need re-checking");
  const activity = (await s("GET", "/api/admin/activity")).body.activity;
  assert.ok(activity.some((a) => a.targetName === "Bayou Bend Apartments" && a.action === "removed"));
});

test("photo uploads: staff only, images only, served safely", async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const m = await member("uploader@example.com");
  assert.equal((await m("POST", "/api/admin/uploads", png, { "content-type": "image/png" })).status, 403);
  const s = await staff();
  assert.equal((await s("POST", "/api/admin/uploads", Buffer.from("<script>alert(1)</script>"), { "content-type": "image/png" })).status, 400, "content is checked, not just the header");
  assert.equal((await s("POST", "/api/admin/uploads", Buffer.alloc(6 * 1024 * 1024, 1), { "content-type": "image/jpeg" })).status, 413);
  const up = await s("POST", "/api/admin/uploads", png, { "content-type": "image/png" });
  assert.equal(up.status, 201);
  assert.match(up.body.url, /^\/uploads\/[\w-]+\.png$/);
  const file = await fetch(base + up.body.url);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.match(file.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal((await fetch(base + "/uploads/missing.png")).status, 404);
  const saved = await s("POST", "/api/admin/properties", { name: "Upload Test", photos: [up.body.url] });
  assert.equal(saved.status, 201);
  assert.deepEqual(saved.body.property.photos, [up.body.url]);
});

test("contact form validates and records a message", async () => {
  const anon = client();
  assert.equal((await anon("POST", "/api/contact", { name: "A", email: "bad", message: "hello" })).status, 400);
  const sent = await anon("POST", "/api/contact", { name: "Renter Name", email: "renter@example.com", topic: "List or update a property", message: "I have a question about the Houston directory." });
  assert.equal(sent.status, 201);
  const mail = db.prepare("SELECT subject, body FROM outbox WHERE to_email = 'findit-inbox@localhost' ORDER BY id DESC LIMIT 1").get();
  assert.match(mail.body, /renter@example\.com/);
  assert.match(mail.subject, /List or update a property/);
});

test("report a problem on a locator or a listing -> staff review", async () => {
  const anon = client();
  assert.equal((await anon("POST", "/api/locators/marcus-lee/report", { reason: "nonsense" })).status, 400);
  assert.equal((await anon("POST", "/api/locators/marcus-lee/report", { reason: "Broken listings link", details: "404 page" })).status, 201);
  assert.equal((await anon("POST", "/api/properties/montrose-gardens/report", { reason: "Broken listings link" })).status, 400, "listing reasons differ from locator reasons");
  assert.equal((await anon("POST", "/api/properties/montrose-gardens/report", { reason: "Wrong price or availability", details: "Rent is higher now" })).status, 201);
  assert.equal((await anon("POST", "/api/properties/no-such-place/report", { reason: "Other" })).status, 404);
  const s = await staff();
  const reports = (await s("GET", "/api/admin/reports?status=open")).body.reports;
  assert.equal(reports.length, 2);
  const listing = reports.find((r) => r.targetType === "property");
  assert.equal(listing.targetName, "Montrose Gardens"); assert.equal(listing.targetStatus, "published");
  assert.equal(reports.find((r) => r.targetType === "locator").targetName, "Marcus Lee");
  for (const r of reports) await s("POST", `/api/admin/reports/${r.id}`, { status: "resolved" });
  assert.equal((await s("GET", "/api/admin/reports?status=open")).body.reports.length, 0);
  assert.equal((await s("GET", "/api/admin/summary")).body.openReports, 0);
});

test("security basics: malformed cookies, unknown API routes, headers", async () => {
  const r = await fetch(base + "/api/auth/me", { headers: { cookie: "findit_session=%E0%A4%A" } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).user, null);
  assert.equal((await fetch(base + "/api/nope")).status, 404);
  const h = await fetch(base + "/api/health");
  assert.equal(h.headers.get("x-frame-options"), "DENY");
  assert.equal(h.headers.get("x-content-type-options"), "nosniff");
});

test("upgrading an older database keeps its reports", () => {
  const file = join(tmp, "old.db");
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', email_verified INTEGER NOT NULL DEFAULT 0, plan TEXT NOT NULL DEFAULT 'free', created_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE locators (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'hidden');
    CREATE TABLE reports (id INTEGER PRIMARY KEY AUTOINCREMENT, locator_id TEXT NOT NULL REFERENCES locators(id), user_id INTEGER, reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT '', resolved_by INTEGER, resolved_at TEXT);
    INSERT INTO locators (id, name, status) VALUES ('old-one', 'Old One', 'published');
    INSERT INTO reports (locator_id, reason) VALUES ('old-one', 'Other');`);
  old.close();
  const upgraded = openDb(file);
  assert.equal(upgraded.prepare("PRAGMA user_version").get().user_version, 1);
  assert.equal(upgraded.prepare("SELECT locator_id FROM reports").get().locator_id, "old-one");
  assert.ok(upgraded.prepare("PRAGMA table_info(reports)").all().some((c) => c.name === "property_id"));
  assert.equal(seedProperties(upgraded), 12);
  upgraded.close();
  const again = openDb(file);
  assert.equal(again.prepare("SELECT COUNT(*) n FROM properties").get().n, 12, "reopening doesn't re-run migrations or reseed");
  again.close();
});
