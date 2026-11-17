import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb, seedLocators } from "./db.js";
import { createApp } from "./app.js";
import { hashPassword } from "./security.js";

process.env.NODE_ENV = "test";
let server, base, db;
before(async () => {
  db = openDb(":memory:"); seedLocators(db);
  db.prepare("INSERT INTO users (email,name,password_hash,role,email_verified) VALUES ('staff@x.com','Staff',?,'staff',1)").run(hashPassword("staffpass1"));
  server = createApp(db, { distDir: "/nonexistent" }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  let cookie = "";
  return async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, {
      method, headers: { "content-type": "application/json", "x-requested-with": "findit", ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0].endsWith("=") ? "" : sc.split(";")[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
const lastLink = (re) => db.prepare("SELECT body FROM outbox ORDER BY id DESC LIMIT 1").get().body.match(re)[1];

test("public search: filters, ZIP, empty result", async () => {
  const c = client();
  assert.equal((await c("GET", "/api/locators")).body.locators.length, 6);
  assert.equal((await c("GET", "/api/locators?q=77380")).body.locators.length, 2);
  assert.equal((await c("GET", "/api/locators?specialty=Luxury")).body.locators.length, 2);
  assert.equal((await c("GET", "/api/locators?q=nowhere-zzz")).body.locators.length, 0);
  const l = (await c("GET", "/api/locators")).body.locators[0];
  assert.ok(l.listingsUrl.startsWith("https://") && l.source && l.lastUpdated);
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
  assert.equal((await c("PUT", "/api/favourites/marcus-lee")).status, 200);
  assert.deepEqual((await c("GET", "/api/favourites")).body.locators.map((l) => l.id), ["marcus-lee"]);
  assert.equal((await c("DELETE", "/api/favourites/marcus-lee")).status, 200);
  await c("POST", "/api/auth/logout");
  assert.equal((await c("GET", "/api/auth/me")).body.user, null);
  assert.equal((await c("GET", "/api/favourites")).status, 401);
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

test("staff tools are locked to staff; add/edit/hide/publish/remove", async () => {
  const anon = client();
  assert.equal((await anon("GET", "/api/admin/locators")).status, 401);
  const member = client();
  await member("POST", "/api/auth/signup", { name: "Mem Ber", email: "mem@example.com", password: "MemberPass1!Long" });
  await member("POST", "/api/auth/verify", { token: lastLink(/verify-email\?token=(\S+)/) });
  await member("POST", "/api/auth/login", { email: "mem@example.com", password: "MemberPass1!Long" });
  assert.equal((await member("GET", "/api/admin/locators")).status, 403);

  const s = client();
  await s("POST", "/api/auth/login", { email: "staff@x.com", password: "staffpass1" });
  assert.equal((await s("POST", "/api/admin/locators", { name: "X", listingsUrl: "http://insecure.example" })).status, 400);
  const created = await s("POST", "/api/admin/locators", { name: "Dana Cruz", company: "Cruz Co", tags: "Luxury, Corporate", zipCodes: "77002,77019", listingsUrl: "https://example.com/dana", contactEmail: "dana@example.com", contactPhone: "+17135551212", source: "Client supplied" });
  assert.equal(created.status, 201);
  const id = created.body.locator.id;
  assert.equal(created.body.locator.status, "hidden");
  assert.equal(created.body.locator.contactEmail, "dana@example.com");
  assert.equal(created.body.locator.contactPhone, "+17135551212");
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
});

test("contact form validates and records a message", async () => {
  const anon = client();
  assert.equal((await anon("POST", "/api/contact", { name: "A", email: "bad", message: "hello" })).status, 400);
  const sent = await anon("POST", "/api/contact", { name: "Renter Name", email: "renter@example.com", message: "I have a question about the Houston directory." });
  assert.equal(sent.status, 201);
  assert.match(db.prepare("SELECT body FROM outbox WHERE to_email = 'findit-inbox@localhost' ORDER BY id DESC LIMIT 1").get().body, /renter@example\.com/);
});

test("report a problem -> staff review", async () => {
  const anon = client();
  assert.equal((await anon("POST", "/api/locators/marcus-lee/report", { reason: "nonsense" })).status, 400);
  assert.equal((await anon("POST", "/api/locators/marcus-lee/report", { reason: "Broken listings link", details: "404 page" })).status, 201);
  const s = client(); await s("POST", "/api/auth/login", { email: "staff@x.com", password: "staffpass1" });
  const reports = (await s("GET", "/api/admin/reports?status=open")).body.reports;
  assert.equal(reports.length, 1); assert.equal(reports[0].locatorName, "Marcus Lee");
  await s("POST", `/api/admin/reports/${reports[0].id}`, { status: "resolved" });
  assert.equal((await s("GET", "/api/admin/reports?status=open")).body.reports.length, 0);
  assert.equal((await s("GET", "/api/admin/summary")).body.openReports, 0);
});
