# FindIt HTX

Houston rental-apartment search plus a directory of local apartment locators. This is the **Milestone 1 private beta**: a React front end and a Node/SQLite API.

## Run locally

Requires Node.js 22.12+ and pnpm (`corepack pnpm …` works if pnpm isn't installed).

```sh
pnpm install
pnpm dev:server     # API on http://localhost:3001 (creates the database, loads sample listings and locators)
pnpm dev            # React app on http://localhost:5173 (proxies /api and /uploads to the API)
```

Create the first staff account (staff see the Staff console after signing in):

```sh
pnpm staff you@example.com 'a-long-password' "Your Name"
```

With no `SMTP_URL`, verification and password-reset emails are printed in the API console and listed at `/api/dev/outbox` (development only). Copy the link from there.

Run the tests: `pnpm test` (API tests against an in-memory database).

## What Milestone 1 includes

**Website and pages**
- Home, Apartments (search), listing pages, Locators directory and profiles, How it works, For owners & managers, For locators, Pricing (beta, no payments), Contact (with topics), Privacy and Terms. All pages work on phones.
- Clear loading, empty, “not provided” and error states throughout.

**Accounts**
- Sign up with email confirmation, sign in/out, forgot/reset password, change password.
- Roles: visitor, member, staff. Accounts carry a `plan` column ready for Milestone 2 subscriptions (nothing reads it yet).

**Apartment catalogue**
- Each listing: name, address, neighborhood, ZIP, description, floor plans (beds, baths, size, rent range, available-from date, units), amenities, photos, parking, pet policy, incentives, lease terms, contact details, tour link and an optional linked locator.
- Availability status (available / coming soon / waitlist / none / not confirmed), a note, **when it was last checked**, the **source**, and the last-updated date. Listings unchecked for 14 days are flagged to renters and staff.
- Missing details are labelled “Not provided” rather than hidden or guessed.

**Search**
- Location (name, neighborhood, city or ZIP), bedrooms, bathrooms, min/max rent, move-in date, availability, pets and amenities. Bed, bath, price and move-in filters must all match the *same* floor plan.
- Sort by recommended, price (using the cheapest matching plan), recently checked or size. Paged results, removable filter chips, shareable URLs.

**Members**
- Save apartments and locators to their account (bookmark on cards and pages).
- Report a problem on any listing or locator profile (signed in or not).

**Staff console**
- Listings: add, edit, publish, hide, remove; quick availability change and “Mark checked”; floor-plan editor; photo upload (JPEG/PNG/WebP up to 5 MB, content-checked) or https links, reorder and set the cover; “needs attention” filter (stale availability, no photos, no prices).
- Locator profiles: add, edit, publish, hide, remove.
- Reports for listings and locators: open / resolved / dismissed, hide the record from the report.
- Change history per listing and an activity log of staff actions (who, what, when; only fields that actually changed).

**Foundation**
- scrypt password hashes; hashed session/reset/verify tokens that expire and are pruned hourly; httpOnly cookies; rate limits; same-origin header check on writes; security headers plus a Content-Security-Policy in production; uploaded files served with a locked-down policy.
- Versioned database migrations (`PRAGMA user_version`); existing beta databases upgrade in place.
- `pnpm backup` writes a consistent copy of the database and the uploaded photos.

## Sample content

The 12 apartment listings and 6 locator profiles loaded on first start are fictional and labelled “Sample listing” / “Sample profile” everywhere. Listing photos are illustrations in `public/assets/properties/`. Replace them with real, approved listings (and permission to use the details and photos) before showing the site publicly; staff can hide or remove samples from the console.

## Deploying (testing site)

The API needs a Node host with a **persistent disk** (the database is a SQLite file and photos are stored on disk), for example Render, Railway or Fly.io. Vercel's static hosting alone cannot run it — the current `vercel.json` only serves the front end.

```sh
pnpm install && pnpm build
NODE_ENV=production pnpm start      # serves the API, uploaded photos and the built site on $PORT
```

Set the variables in `.env.example` (at minimum `PUBLIC_URL`, `FINDIT_DB` and `FINDIT_UPLOADS` on the persistent disk, `SMTP_URL` so real emails go out, and `CONTACT_EMAIL` so the contact form has a recipient). Schedule `pnpm backup` and copy the backups off the server.

## Known limits

- Search runs in memory over published listings — fine for the beta's hundreds of listings; move filtering into SQL before tens of thousands.
- Rate limiting is in memory, which is fine for one server process.
- Saved searches, shortlists, alerts, payments and memberships, provider self-service accounts, the AI assistant and map view are Milestone 2.
