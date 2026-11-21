// Where listing photos and the nightly data backups are stored.
// - Supabase Storage when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set (production on Vercel):
//   photos in a public bucket, backups in a separate private one.
// - A local folder otherwise (development and tests), served by the API at /uploads. No nightly backups.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const PHOTO_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function supabaseHeaders(key) {
  // Legacy service_role keys are JWTs and go in Authorization; newer sb_secret_ keys only in apikey.
  return { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
}

export function createStorage({ uploadsDir }) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET = "listing-photos", SUPABASE_BACKUP_BUCKET = "findit-backups" } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const base = SUPABASE_URL.replace(/\/+$/, "");
    const createBucket = async (id, options) => {
      const r = await fetch(`${base}/storage/v1/bucket`, {
        method: "POST",
        headers: { ...supabaseHeaders(SUPABASE_SERVICE_ROLE_KEY), "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: id, ...options }),
      });
      if (r.ok) return "created";
      const text = await r.text();
      if (r.status === 409 || /already exists|Duplicate/i.test(text)) return "exists";
      throw new Error(`Could not create the "${id}" bucket (${r.status}): ${text.slice(0, 300)}`);
    };
    return {
      kind: "supabase",
      bucket: SUPABASE_BUCKET,
      backupBucket: SUPABASE_BACKUP_BUCKET,
      async put(name, body, contentType) {
        const r = await fetch(`${base}/storage/v1/object/${SUPABASE_BUCKET}/${name}`, {
          method: "POST",
          headers: { ...supabaseHeaders(SUPABASE_SERVICE_ROLE_KEY), "Content-Type": contentType, "cache-control": "max-age=31536000", "x-upsert": "false" },
          body,
        });
        if (!r.ok) throw new Error(`Supabase Storage upload failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
        return `${base}/storage/v1/object/public/${SUPABASE_BUCKET}/${name}`;
      },
      // Saves one backup file in the private bucket, replacing any file of the same name.
      async putBackup(name, body) {
        const r = await fetch(`${base}/storage/v1/object/${SUPABASE_BACKUP_BUCKET}/${name}`, {
          method: "POST",
          headers: { ...supabaseHeaders(SUPABASE_SERVICE_ROLE_KEY), "Content-Type": "application/gzip", "x-upsert": "true" },
          body,
        });
        if (!r.ok) throw new Error(`Backup upload failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
      },
      // Create the buckets if they don't exist yet (used by `pnpm db:setup`): photos public, backups private.
      ensureBucket: () => createBucket(SUPABASE_BUCKET, { public: true, file_size_limit: 4 * 1024 * 1024, allowed_mime_types: Object.values(PHOTO_TYPES) }),
      ensureBackupBucket: () => createBucket(SUPABASE_BACKUP_BUCKET, { public: false }),
    };
  }
  return {
    kind: "local",
    dir: uploadsDir,
    async put(name, body) {
      if (process.env.VERCEL) throw Object.assign(new Error("Photo storage isn't configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."), { status: 503 });
      mkdirSync(uploadsDir, { recursive: true });
      writeFileSync(resolve(uploadsDir, name), body);
      return `/uploads/${name}`;
    },
    async ensureBucket() { return "local"; },
  };
}
