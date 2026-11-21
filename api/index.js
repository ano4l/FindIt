// Vercel serverless entry point. vercel.json rewrites every /api/* request here; the Express app
// routes it by its original path. The database connection is created once per warm instance.
import { openDb } from "../server/db.js";
import { createApp } from "../server/app.js";

let appPromise;
const getApp = () => (appPromise ??= openDb().then((db) => createApp(db, { distDir: null })).catch((e) => { appPromise = undefined; throw e; }));

export default async function handler(req, res) {
  let app;
  try { app = await getApp(); }
  catch (e) {
    console.error(e);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "FindIt is temporarily unavailable. Please try again shortly." }));
  }
  return app(req, res);
}
