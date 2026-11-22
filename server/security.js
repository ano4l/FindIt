import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}
// Random tokens go to the user; only the SHA-256 hash is stored.
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t) => createHash("sha256").update(String(t)).digest("hex");

// Fixed-window rate limit stored in the database, so it holds across serverless instances.
// `name` groups routes into one bucket (e.g. every report endpoint shares "report"); without it each path is its own bucket.
export function rateLimit(db, { name, windowMs, max }) {
  const secs = windowMs / 1000;
  return async (req, res, next) => {
    const key = `${req.ip}:${name || req.path}`;
    const row = await db.get(`insert into rate_limits (key, window_start, hits) values (?, now(), 1)
      on conflict (key) do update set
        hits = case when rate_limits.window_start < now() - make_interval(secs => ?) then 1 else rate_limits.hits + 1 end,
        window_start = case when rate_limits.window_start < now() - make_interval(secs => ?) then now() else rate_limits.window_start end
      returning hits`, key, secs, secs);
    if (row.hits > max) {
      res.setHeader("Retry-After", Math.ceil(secs));
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }
    next();
  };
}
