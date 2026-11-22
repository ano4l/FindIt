import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { openDb, migrate, seedLocators, seedProperties, pruneExpired, exportTables, restoreTables, BACKUP_TABLES } from "./db.js";
import { createApp } from "./app.js";
import { hashPassword } from "./security.js";
import { CONTACT_TOPICS } from "../shared/catalog.js";

process.env.NODE_ENV = "test";
let server, base, db, tmp;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "findit-test-"));
  // TEST_DATABASE_URL runs the suite against a real, empty Postgres (e.g. a throwaway Supabase branch).
  db = await openDb(process.env.TEST_DATABASE_URL || "memory"); await migrate(db); await seedLocators(db); await seedProperties(db);
  await db.run("insert into users (email,name,password_hash,role,email_verified) values ('staff@x.com','Staff Person',?,'staff',true)", hashPassword("staffpass1"));
  server = createApp(db, { distDir: "/nonexistent", uploadsDir: join(tmp, "uploads") }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); rmSync(tmp, { recursive: true, force: true }); });

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
const lastLink = async (re) => (await db.get("select body from outbox order by id desc limit 1")).body.match(re)[1];
const staff = async () => { const s = client(); await s("POST", "/api/auth/login", { email: "staff@x.com", password: "staffpass1" }); return s; };
async function member(email) {
  const c = client();
  await c("POST", "/api/auth/signup", { name: "Test Member", email, password: "MemberPass1!Long" });
  await c("POST", "/api/auth/verify", { token: await lastLink(/verify-email\?token=(\S+)/) });
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
  // The search box suggests "Montrose, Houston or 77008": city, state and ZIP can be combined in any order.
  assert.deepEqual(ids(await c("GET", "/api/properties?q=Montrose, Houston")), ["montrose-gardens"]);
  assert.deepEqual(ids(await c("GET", "/api/properties?q=Houston, TX 77008")), ["yale-street-lofts"]);
  assert.deepEqual(ids(await c("GET", "/api/properties?q=77008 houston")), ["yale-street-lofts"]);
  assert.equal((await c("GET", "/api/properties?q=Houston, Texas")).body.total, 12);
  assert.equal((await c("GET", "/api/locators?q=Houston, TX 77380")).body.locators.length, 2);
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
  const token = await lastLink(/verify-email\?token=(\S+)/);
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
  await c("POST", "/api/auth/verify", { token: await lastLink(/verify-email\?token=(\S+)/) });
  await other("POST", "/api/auth/login", { email: "bo@example.com", password: "OriginalPass1!" });
  const unknown = await c("POST", "/api/auth/forgot", { email: "ghost@example.com" });
  assert.equal(unknown.status, 200, "same answer for unknown emails");
  await c("POST", "/api/auth/forgot", { email: "bo@example.com" });
  const token = await lastLink(/reset-password\?token=(\S+)/);
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
  const mail = await db.get("select subject, body from outbox where to_email = 'findit-inbox@localhost' order by id desc limit 1");
  assert.match(mail.body, /renter@example\.com/);
  assert.match(mail.subject, /List or update a property/);
  // The message is also kept for staff, who can mark it as dealt with.
  assert.equal((await anon("GET", "/api/admin/messages")).status, 401);
  const s = await staff();
  const open = (await s("GET", "/api/admin/messages")).body.messages;
  const mine = open.find((m) => m.email === "renter@example.com");
  assert.equal(mine.topic, "List or update a property");
  assert.match(mine.message, /Houston directory/);
  assert.ok((await s("GET", "/api/admin/summary")).body.openMessages >= 1);
  assert.equal((await s("POST", `/api/admin/messages/${mine.id}`, { handled: true })).status, 200);
  assert.equal((await s("GET", "/api/admin/messages")).body.messages.some((m) => m.id === mine.id), false);
  const done = (await s("GET", "/api/admin/messages?status=done")).body.messages.find((m) => m.id === mine.id);
  assert.equal(done.handledBy, "Staff Person");
  assert.equal((await s("POST", "/api/admin/messages/999999", { handled: true })).status, 404);
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

test("migrations and sample data run only once", async () => {
  assert.deepEqual(await migrate(db), [], "nothing left to apply");
  assert.equal(await seedProperties(db), 0, "sample listings aren't added twice");
  assert.equal((await db.get("select count(*)::int as n from schema_migrations")).n, 2);
  const rls = await db.all("select relname from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace and not relrowsecurity");
  assert.deepEqual(rls, [], "row-level security is on for every table");
});

test("rate limits are shared and reset after the window", async () => {
  const anon = client();
  const body = { name: "Limit Test", email: "limit@example.com", message: "Checking the contact form limit." };
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await anon("POST", "/api/contact", body)).status);
  assert.ok(statuses.includes(429), `contact form is limited (got ${statuses.join(",")})`);
  await db.run("update rate_limits set window_start = now() - interval '2 hours' where key like '%:contact'");
  assert.equal((await anon("POST", "/api/contact", body)).status, 201, "a new window starts after the old one ends");
});

test("scheduled clean-up needs the cron secret and removes expired rows", async () => {
  assert.equal((await fetch(base + "/api/cron/prune")).status, 404, "hidden when no secret is configured");
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const u = await db.get("select id from users where email = 'staff@x.com'");
    await db.run("insert into sessions (token_hash, user_id, expires_at) values ('expired-session', ?, now() - interval '1 minute')", u.id);
    assert.equal((await fetch(base + "/api/cron/prune", { headers: { authorization: "Bearer wrong" } })).status, 404);
    const r = await fetch(base + "/api/cron/prune", { headers: { authorization: "Bearer test-cron-secret" } });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).removed.sessions >= 1);
    assert.equal(await db.get("select 1 from sessions where token_hash = 'expired-session'"), undefined);
    assert.deepEqual(Object.keys(await pruneExpired(db)), ["sessions", "tokens", "rateLimits", "outbox"]);
  } finally { delete process.env.CRON_SECRET; }
});

test("nightly backup: needs the cron secret, saves every table, and restores into an empty database", async () => {
  process.env.CRON_SECRET = "test-cron-secret";
  const auth = { headers: { authorization: "Bearer test-cron-secret" } };
  try {
    assert.equal((await fetch(base + "/api/cron/backup")).status, 404);
    // Without Supabase Storage (local development) there is nowhere private to keep it, so it's skipped.
    assert.match((await (await fetch(base + "/api/cron/backup", auth)).json()).skipped, /Supabase Storage/);

    // The same database behind an app whose storage records what it is given.
    const saved = [];
    const srv = createApp(db, { distDir: "/nonexistent", storage: { kind: "local", dir: join(tmp, "uploads"), put: async () => "", putBackup: async (name, body) => { saved.push({ name, body }); } } }).listen(0);
    try {
      const r = await (await fetch(`http://127.0.0.1:${srv.address().port}/api/cron/backup`, auth)).json();
      assert.equal(r.ok, true);
      assert.match(r.file, /^findit-day-\d\d\.json\.gz$/, "one file per day of the month, so about 30 days are kept");
      assert.deepEqual(Object.keys(r.rows), BACKUP_TABLES);
      assert.ok(r.rows.users >= 1 && r.rows.properties >= 12 && r.rows.locators >= 6);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].name, r.file);
      assert.equal(saved[0].body.length, r.bytes);
    } finally { srv.close(); }

    // Restore the saved file into a brand-new database and compare it with the original, table by table.
    const backup = JSON.parse(gunzipSync(saved[0].body).toString("utf8"));
    const fresh = await openDb("memory"); await migrate(fresh);
    try {
      const counts = await restoreTables(fresh, backup);
      assert.deepEqual(counts, Object.fromEntries(BACKUP_TABLES.map((t) => [t, backup.tables[t].length])));
      const asJson = (x) => JSON.parse(JSON.stringify(x.tables));
      assert.deepEqual(asJson(await exportTables(fresh)), asJson(await exportTables(db)));
      // New rows get fresh ids instead of colliding with restored ones.
      const maxId = (await fresh.get("select max(id) as n from users")).n;
      const added = await fresh.get("insert into users (email, name, password_hash) values ('after-restore@x.com', 'After Restore', 'x') returning id");
      assert.ok(added.id > maxId);
      await assert.rejects(restoreTables(fresh, backup), /already has rows/, "never overwrites a database that has data");
    } finally { await fresh.close(); }
  } finally { delete process.env.CRON_SECRET; }
});

test("the first account to confirm its email becomes the admin; later accounts are members", async () => {
  // Its own empty database: the shared one already has a staff account.
  const d = await openDb("memory"); await migrate(d);
  const srv = createApp(d, { distDir: "/nonexistent", uploadsDir: join(tmp, "uploads-first") }).listen(0);
  const url = `http://127.0.0.1:${srv.address().port}`;
  const call = (cookie) => async (method, path, body) => {
    const r = await fetch(url + path, { method, headers: { "content-type": "application/json", "x-requested-with": "findit", ...(cookie.v ? { cookie: cookie.v } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie"); if (sc) cookie.v = sc.split(";")[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const link = async (email, re) => (await d.get("select body from outbox where to_email = ? order by id desc limit 1", email)).body.match(re)[1];
  const signUp = async (email) => { const c = call({}); await c("POST", "/api/auth/signup", { name: "First Person", email, password: "FirstPass1!Long" }); return c; };
  const confirm = async (c, email) => c("POST", "/api/auth/verify", { token: await link(email, /verify-email\?token=(\S+)/) });
  try {
    // Signing up alone changes nothing: an address nobody confirms can't take the admin slot.
    const ghost = await signUp("never-confirms@x.com");
    assert.equal((await d.get("select role from users where email = 'never-confirms@x.com'")).role, "member");

    const owner = await signUp("owner@x.com");
    const first = await confirm(owner, "owner@x.com");
    assert.equal(first.body.firstAdmin, true);
    const login = await owner("POST", "/api/auth/login", { email: "owner@x.com", password: "FirstPass1!Long" });
    assert.equal(login.body.user.role, "staff");
    assert.equal((await owner("GET", "/api/admin/summary")).status, 200, "the admin can open the staff tools");
    const log = (await owner("GET", "/api/admin/activity")).body.activity;
    assert.ok(log.some((a) => a.action === "admin" && a.targetId === "owner@x.com"), "recorded in the activity log");

    const second = await signUp("second@x.com");
    assert.equal((await confirm(second, "second@x.com")).body.firstAdmin, false);
    assert.equal((await second("POST", "/api/auth/login", { email: "second@x.com", password: "FirstPass1!Long" })).body.user.role, "member");
    assert.equal((await second("GET", "/api/admin/summary")).status, 403);

    // Confirming late, or through a password-reset link, never promotes anyone once an admin exists.
    assert.equal((await confirm(ghost, "never-confirms@x.com")).body.firstAdmin, false);
    const late = await signUp("late@x.com");
    await late("POST", "/api/auth/forgot", { email: "late@x.com" });
    assert.equal((await late("POST", "/api/auth/reset", { token: await link("late@x.com", /reset-password\?token=(\S+)/), password: "AnotherPass1!Long" })).status, 200);
    assert.deepEqual(await d.all("select email, role, email_verified from users order by id"), [
      { email: "never-confirms@x.com", role: "member", email_verified: true },
      { email: "owner@x.com", role: "staff", email_verified: true },
      { email: "second@x.com", role: "member", email_verified: true },
      { email: "late@x.com", role: "member", email_verified: true },
    ]);

    // Two confirmations arriving together on an empty site: exactly one becomes admin.
    await d.run("delete from users");
    const a = await signUp("race-a@x.com"), b = await signUp("race-b@x.com");
    const both = await Promise.all([confirm(a, "race-a@x.com"), confirm(b, "race-b@x.com")]);
    assert.equal(both.filter((r) => r.body.firstAdmin).length, 1);
    assert.equal((await d.get("select count(*)::int as n from users where role = 'staff'")).n, 1);
  } finally { srv.close(); await d.close(); }
});

test("signing up again before confirming replaces the earlier password", async () => {
  // Someone registers an address they don't own, hoping the real owner confirms it later.
  const stranger = client(), owner = client();
  await stranger("POST", "/api/auth/signup", { name: "Not Them", email: "taken@example.com", password: "StrangerPass1!Long" });
  const oldToken = await lastLink(/verify-email\?token=(\S+)/);
  await owner("POST", "/api/auth/signup", { name: "Real Owner", email: "taken@example.com", password: "OwnerPass1!Long" });
  assert.equal((await owner("POST", "/api/auth/verify", { token: oldToken })).status, 400, "the earlier link stops working");
  assert.equal((await owner("POST", "/api/auth/verify", { token: await lastLink(/verify-email\?token=(\S+)/) })).status, 200);
  assert.equal((await stranger("POST", "/api/auth/login", { email: "taken@example.com", password: "StrangerPass1!Long" })).status, 401);
  const ok = await owner("POST", "/api/auth/login", { email: "taken@example.com", password: "OwnerPass1!Long" });
  assert.equal(ok.body.user.name, "Real Owner");
  // Once confirmed, another sign-up with the same address changes nothing.
  await stranger("POST", "/api/auth/signup", { name: "Not Them", email: "taken@example.com", password: "StrangerPass1!Long" });
  assert.equal((await stranger("POST", "/api/auth/login", { email: "taken@example.com", password: "StrangerPass1!Long" })).status, 401);
  assert.equal((await client()("POST", "/api/auth/login", { email: "taken@example.com", password: "OwnerPass1!Long" })).status, 200);
});

test("listing details stay accurate: availability notes, unchecked listings, linked locators", async () => {
  const anon = client(), s = await staff();
  const made = async (body) => (await s("POST", "/api/admin/properties", { publish: true, ...body })).body.property;

  // A listing nobody has checked isn't stamped as checked.
  const unknown = await made({ name: "Unchecked Court" });
  assert.equal(unknown.availability, "unknown");
  assert.equal(unknown.availabilityCheckedAt, null);
  assert.equal((await anon("GET", `/api/properties/${unknown.id}`)).body.property.availabilityStale, true);

  // Quick status change: the note written for the old status is cleared; confirming the same status keeps it.
  const noted = await made({ name: "Noted Place", availability: "available", availabilityNote: "Seven homes available now" });
  const same = await s("POST", `/api/admin/properties/${noted.id}/availability`, { availability: "available" });
  assert.equal(same.body.property.availabilityNote, "Seven homes available now");
  const changed = await s("POST", `/api/admin/properties/${noted.id}/availability`, { availability: "unavailable" });
  assert.equal(changed.body.property.availability, "unavailable");
  assert.equal(changed.body.property.availabilityNote, "");

  // A hidden locator is never named in public listing data; a removed one is unlinked so the listing can still be edited.
  const loc = (await s("POST", "/api/admin/locators", { name: "Temp Locator", company: "Temp Co", area: "Midtown", listingsUrl: "https://example.com/temp", publish: true })).body.locator;
  assert.ok(loc?.id, "locator created");
  const linked = await made({ name: "Linked Lofts", locatorId: loc.id });
  const inSearch = async () => (await anon("GET", "/api/properties?q=linked lofts")).body.properties[0];
  assert.equal((await inSearch()).locatorId, loc.id);
  await s("POST", `/api/admin/locators/${loc.id}/status`, { status: "hidden" });
  assert.equal((await inSearch()).locatorId, "");
  const detail = (await anon("GET", `/api/properties/${linked.id}`)).body;
  assert.equal(detail.property.locatorId, "");
  assert.equal(detail.locator, null);
  await s("POST", `/api/admin/locators/${loc.id}/status`, { status: "removed" });
  const form = (await s("GET", `/api/admin/properties/${linked.id}`)).body.property;
  assert.equal(form.locatorId, "", "removing a locator unlinks it");
  const saved = await s("PUT", `/api/admin/properties/${linked.id}`, { ...form, parking: "Garage" });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.property.parking, "Garage");

  for (const p of [unknown, noted, linked]) await s("POST", `/api/admin/properties/${p.id}/status`, { status: "removed" });
});

test("email: enquiries are replyable, and the hosted site fails loudly without a provider", async () => {
  const c = client();
  const sent = [];
  const realFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test";
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    return realFetch(url, init);
  };
  try {
    const r = await c("POST", "/api/contact", { name: "Rita Renter", email: "rita@example.com", topic: CONTACT_TOPICS[0], message: "Is Yale Street Lofts still available in March?" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].reply_to, "rita@example.com", "replying goes to the person who wrote, not the no-reply address");
  } finally { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; }

  const { sendMail } = await import("./mailer.js");
  process.env.VERCEL = "1";
  try {
    await assert.rejects(sendMail(db, { to: "x@example.com", subject: "s", text: "t" }), /No email provider/);
  } finally { delete process.env.VERCEL; }
});

test("without an email provider: accounts work straight away, the first one is the admin, messages still reach staff", async () => {
  const d = await openDb("memory"); await migrate(d);
  // An address left unconfirmed from a time when email was on.
  await d.run("insert into users (email, name, password_hash) values ('leftover@x.com', 'Left Over', ?)", hashPassword("LeftoverPass1!Long"));
  const srv = createApp(d, { distDir: "/nonexistent", uploadsDir: join(tmp, "uploads-noemail"), emailEnabled: false }).listen(0);
  const url = `http://127.0.0.1:${srv.address().port}`;
  const visitor = () => {
    const cookie = {};
    return async (method, path, body) => {
      const r = await fetch(url + path, { method, headers: { "content-type": "application/json", "x-requested-with": "findit", ...(cookie.v ? { cookie: cookie.v } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get("set-cookie"); if (sc) cookie.v = sc.split(";")[0];
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };
  };
  try {
    const owner = visitor();
    assert.equal((await owner("GET", "/api/auth/me")).body.emailOn, false);
    const first = await owner("POST", "/api/auth/signup", { name: "Olive Owner", email: "owner@x.com", password: "OwnerPass1!Long" });
    assert.equal(first.status, 201);
    assert.equal(first.body.user.role, "staff", "the first account is the admin");
    assert.equal(first.body.firstAdmin, true);
    assert.equal((await owner("GET", "/api/auth/me")).body.user.email, "owner@x.com", "signed in without confirming anything");
    const summary = await owner("GET", "/api/admin/summary");
    assert.equal(summary.status, 200);
    assert.equal(summary.body.emailOn, false);

    const member = visitor();
    const second = await member("POST", "/api/auth/signup", { name: "Mia Member", email: "mia@x.com", password: "MemberPass1!Long" });
    assert.equal(second.body.user.role, "member");
    assert.equal((await member("GET", "/api/admin/summary")).status, 403);
    assert.equal((await member("PUT", "/api/favourites/properties/nope")).status, 404, "a member session is active");

    // An address can't be registered twice, and nobody's password is replaced.
    const again = await visitor()("POST", "/api/auth/signup", { name: "Not Olive", email: "owner@x.com", password: "StrangerPass1!Long" });
    assert.equal(again.status, 409);
    assert.equal((await visitor()("POST", "/api/auth/login", { email: "owner@x.com", password: "StrangerPass1!Long" })).status, 401);
    assert.equal((await visitor()("POST", "/api/auth/login", { email: "owner@x.com", password: "OwnerPass1!Long" })).body.user.role, "staff");

    // The unconfirmed leftover account can sign in now, as a member (an admin already exists).
    const left = await visitor()("POST", "/api/auth/login", { email: "leftover@x.com", password: "LeftoverPass1!Long" });
    assert.equal(left.status, 200);
    assert.equal(left.body.user.role, "member");

    // Nothing is emailed: no confirmation links, and password reset says so plainly.
    assert.equal((await visitor()("POST", "/api/auth/forgot", { email: "owner@x.com" })).status, 503);
    assert.match((await visitor()("POST", "/api/auth/resend", { email: "mia@x.com" })).body.message, /sign in straight away/);
    assert.equal((await d.get("select count(*)::int as n from outbox")).n, 0);
    assert.equal((await d.get("select count(*)::int as n from tokens")).n, 0);

    // The contact form still works: the message waits in the staff console.
    const sent = await visitor()("POST", "/api/contact", { name: "Rita Renter", email: "rita@x.com", topic: CONTACT_TOPICS[0], message: "Do you have anything near the Medical Center?" });
    assert.equal(sent.status, 201);
    const inbox = (await owner("GET", "/api/admin/messages")).body.messages;
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].email, "rita@x.com");
    assert.equal((await d.get("select count(*)::int as n from outbox")).n, 0);
  } finally { srv.close(); await d.close(); }
});
