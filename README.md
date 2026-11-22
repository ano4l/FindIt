# FindIt HTX

Houston rental-apartment search plus a directory of local apartment locators. This is the **Milestone 1 private beta**: a React front end and a Node/Express API, hosted on **Vercel**, with **Supabase** (Postgres and photo storage) and **Resend** (email).

## Run locally

Requires Node.js 22+ and pnpm (`corepack pnpm …` works if pnpm isn't installed). No database or accounts are needed locally: the API uses PGlite, an in-process Postgres stored in `server/data/pglite`, and keeps photos in `server/data/uploads`.

```sh
pnpm install
pnpm dev:server     # API on http://localhost:3001 (creates the database, loads sample listings and locators)
pnpm dev            # React app on http://localhost:5173 (proxies /api and /uploads to the API)
```

**The first account becomes the admin** (the staff role, which opens the staff console): the first to confirm its email, or simply the first to sign up while email is switched off (see *Running without email*). Everyone after that is a regular member. On a new database, register yourself before sharing the address with anyone else. `pnpm staff you@example.com 'a-long-password' "Your Name"` adds further staff accounts, or restores access if you lose the admin login.

Without `RESEND_API_KEY`, confirmation and password-reset emails are printed in the API console and listed at `/api/dev/outbox` (development only). Copy the link from there.

Set `DATABASE_URL` (and the `SUPABASE_*` variables) to run the same commands against Supabase instead.

Run the tests: `pnpm test` (in-process Postgres). `TEST_DATABASE_URL=postgres://…` runs them against an empty real Postgres instead.

## Deploying: Supabase + Vercel + Resend

Use **two Supabase projects**, one for production and one for staging/preview deployments, so test deployments never touch real data.

1. **Supabase** (for each project). FindIt keeps its own accounts and talks to Supabase only from the server, so it doesn't use `@supabase/supabase-js` or the *publishable* key that Supabase's framework quickstarts show.
   - *Connect* (top of the dashboard) → *Transaction pooler* connection string (port 6543), with your database password filled in → `DATABASE_URL`.
   - Project URL → `SUPABASE_URL`, and *Project Settings → API Keys* → a secret key (`sb_secret_…`) or the legacy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`. Both stay server-side.
   - Put those three in a `.env` file in the project folder (gitignored; copy the names from `.env.example`). `pnpm db:setup`, `pnpm db:seed`, `pnpm staff` and `pnpm backup` read it and print which database they're changing; `pnpm dev:server` and `pnpm test` ignore it and stay on the local database. Then:
     ```sh
     pnpm db:setup     # creates the tables (row-level security on), the public "listing-photos" bucket and the private "findit-backups" bucket
     pnpm db:seed      # optional: the 12 sample listings and 6 sample locators (staging/demo only)
     ```
     Once the site is deployed, sign up on it straight away: the first confirmed account becomes the admin (see above).
   Run `pnpm db:setup` again whenever a new file appears in `server/migrations/`.
2. **Resend** (needs a domain you own; skip it until you have one, see *Running without email*): add and verify your sending domain (DNS records), create an API key → `RESEND_API_KEY`, and set `MAIL_FROM` to an address on that domain.
3. **Vercel**: import the repository and add the variables from `.env.example` for Production and Preview (Preview pointing at the staging Supabase project). The minimum is `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`.
   - `CRON_SECRET` is any long random string you make up; Vercel sends it with the nightly jobs. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `PUBLIC_URL` is the site's own address (for example `https://your-project.vercel.app`, no trailing slash). It is only used for the links inside emails, so it isn't needed while email is off. Leave it unset on Preview so links point at the preview itself.

### Running without email

Until an email provider is configured (`RESEND_API_KEY`, or `SMTP_URL`), the hosted site runs with email switched off:
- Signing up creates the account and signs the person in straight away; no confirmation email is sent. The first account to sign up is the admin.
- "Forgot password" can't send a link. People are pointed to the contact form, and you can set a new password for them with `pnpm set-password someone@example.com 'a-new-long-password'`.
- Contact-form messages are not emailed; they wait in the staff console's **Messages** tab (they are kept there when email is on, too).
- The staff console shows a notice so this isn't forgotten.

Add `RESEND_API_KEY` (plus `MAIL_FROM`, `CONTACT_EMAIL` and `PUBLIC_URL`) and redeploy to turn email on. Accounts created while it was off keep working and are treated as confirmed. Supabase's own email service is not a way around this: without a custom domain it only delivers to the project's team members.

How it runs on Vercel:
- The built React app is served from Vercel's CDN; `vercel.json` sends `/api/*` to the Express app in `api/index.js` and every other path to the app shell. Security headers and the Content-Security-Policy are set in `vercel.json`.
- Two daily Vercel Cron jobs, both protected by `CRON_SECRET`: `/api/cron/backup` saves a copy of the data (see *Backups*), and `/api/cron/prune` clears expired sessions, email links and old rate-limit records.
- Private beta: every page carries a "noindex" tag, so search engines don't list the site. When it is ready to be found publicly, set `FINDIT_ALLOW_INDEXING=true` for Production in Vercel and redeploy.
- Photos are resized in the browser (max 2,000 px, JPEG) before upload, because Vercel caps request bodies at 4.5 MB; the API checks each file is a real image and stores it in Supabase Storage.

## What Milestone 1 includes

**Website and pages**
- Home, Apartments (search), listing pages, Locators directory and profiles, How it works, For owners & managers, For locators, Pricing (beta, no payments), Contact (with topics), Privacy and Terms. All pages work on phones.
- Clear loading, empty, “not provided” and error states throughout.

**Accounts**
- Sign up with email confirmation (and a way to get a fresh link if it expires or never arrives), sign in/out, forgot/reset password, change password.
- Roles: visitor, member, staff. The first account to confirm its email becomes the admin (staff); later accounts are members. Accounts carry a `plan` column ready for Milestone 2 subscriptions (nothing reads it yet).

**Apartment catalogue**
- Each listing: name, address, neighborhood, ZIP, description, floor plans (beds, baths, size, rent range, available-from date, units), amenities, photos, parking, pet policy, incentives, lease terms, contact details, tour link and an optional linked locator.
- Availability status (available / coming soon / waitlist / none / not confirmed), a note, **when it was last checked**, the **source**, and the last-updated date. Listings unchecked for 14 days are flagged to renters and staff.
- Missing details are labelled “Not provided” rather than hidden or guessed.

**Search**
- Location (name, neighborhood, city or ZIP, in any combination such as “Montrose, Houston” or “Houston, TX 77008”), bedrooms, bathrooms, min/max rent, move-in date, availability, pets and amenities. Bed, bath, price and move-in filters must all match the *same* floor plan.
- Sort by recommended, price (using the cheapest matching plan), recently checked or size. Paged results, removable filter chips, shareable URLs.

**Members**
- Save apartments and locators to their account (bookmark on cards and pages).
- Report a problem on any listing or locator profile (signed in or not).

**Staff console**
- Listings: add, edit, preview before publishing, publish, hide, remove; quick availability change and “Mark checked”; floor-plan editor; photo upload or https links, reorder and set the cover; “needs attention” filter (stale availability, no photos, no prices).
- Locator profiles: add, edit, publish, hide, remove.
- Reports for listings and locators: open / resolved / dismissed, hide the record from the report.
- Messages: everything sent through the contact form, with a reply-by-email link and a "dealt with" list.
- Change history per listing and an activity log of staff actions (who, what, when; only fields that actually changed).

**Foundation**
- scrypt password hashes; hashed session/reset/verify tokens that expire; httpOnly cookies; rate limits stored in the database (shared by every serverless instance); same-origin header check on writes; security headers and CSP.
- Row-level security is enabled on every table with no policies, so Supabase's public API keys can't read any data; the API connects directly as the database owner.
- Numbered SQL migrations in `server/migrations/`, tracked in `schema_migrations`.
- Backups: see below.

## Backups

- **Every night** (08:00 UTC) the site saves a compressed copy of its data — accounts, listings, locators, favourites, reports and the staff activity log — to the private `findit-backups` bucket in Supabase Storage. Files are named `findit-day-01.json.gz` to `findit-day-31.json.gz` after the day of the month, so each night replaces last month's file and roughly the last 30 days are always there. This works on every Supabase plan and needs `CRON_SECRET` to be set in Vercel. (Vercel only runs cron jobs on the Production deployment.)
- **On demand:** `pnpm backup` writes the same export to `server/backups/` on your computer, e.g. before a risky change.
- **Restoring:** download a file from the bucket (Supabase → Storage → findit-backups), point `.env` at an empty database, run `pnpm db:setup`, then `pnpm restore path/to/findit-day-17.json.gz`. It refuses to run against a database that already has data.
- Backup files contain email addresses and password hashes: keep them private. Photos live in the `listing-photos` bucket and aren't part of the backup. Paid Supabase plans also take their own daily database backups.

## Sample content

The 12 apartment listings and 6 locator profiles are fictional and labelled “Sample listing” / “Sample profile” everywhere. Listing photos are illustrations in `public/assets/properties/`. Replace them with real, approved listings (and permission to use the details and photos) before showing the site publicly; staff can hide or remove samples from the console. `pnpm db:seed` only adds them to an empty database.

## Known limits

- Automated tests cover the API (`pnpm test`); the screens are checked by hand in a browser. There is no browser test suite or CI yet.
- Search runs in memory over published listings — fine for the beta's hundreds of listings; move filtering into SQL before tens of thousands.
- Free Supabase projects pause after a period of inactivity; use a paid plan for anything client-facing.
- Saved searches, shortlists, alerts, payments and memberships, provider self-service accounts, the AI assistant and map view are Milestone 2.
