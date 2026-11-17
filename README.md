# Findit HTX

Directory that helps Houston renters find apartment locators and realtors, then sends them to the locator's own listings. This is the Milestone 1 beta: a React front end plus a Node/SQLite API. The app uses the supplied design references and the repository venture documents' navy and teal palette, professional membership model, and trust-first product language.

## Run locally

Requires Node.js 22.12+ and pnpm.

```sh
pnpm install
pnpm dev:server     # API on http://localhost:3001 (creates the database and loads sample profiles)
pnpm dev            # React app on http://localhost:5173 (proxies /api to the API)
```

Create the first staff account (staff see the Staff console after signing in):

```sh
pnpm staff you@example.com 'a-long-password' "Your Name"
```

With no `SMTP_URL`, verification and password-reset emails are printed in the API console and listed at `/api/dev/outbox` (development only). Copy the link from there.

Run the tests: `pnpm test`.

## What Milestone 1 includes

- Public pages and the locator directory, responsive on mobile.
- Locator/realtor profiles with a **View their listings** link out to the locator's own page (HAR or their site), source and last-updated labels, and clear empty/error states.
- Accounts: sign up, email confirmation, sign in/out, forgot/reset password. Roles: visitor, member, staff. Accounts carry a `plan` column ready for Milestone 2 subscriptions (nothing reads it yet).
- Search by name, neighborhood, city or ZIP; filter by specialty and quick filters; sort.
- Members can save favourite locators (stored on their account).
- Visitors can report a problem with a profile.
- Staff console: add, edit, publish, hide and remove profiles; review and resolve reports; see source and last-updated on every record.
- Security basics: scrypt password hashes, hashed session/reset tokens, httpOnly cookies, login and form rate limits, same-origin request check on writes, security headers, staff-only routes.
- Backups: `pnpm backup` writes a consistent copy of the database (schedule it nightly).

## Deploying (testing site)

The API needs a Node host with a **persistent disk** (the database is a SQLite file), for example Render, Railway or Fly.io. Vercel's static hosting alone cannot run it.

```sh
pnpm install && pnpm build
NODE_ENV=production pnpm start      # serves the API and the built site on $PORT
```

Set the variables in `.env.example` (at minimum `PUBLIC_URL`, `FINDIT_DB` on the persistent disk, `SMTP_URL` so real emails go out, and `CONTACT_EMAIL` so the contact form has a recipient). Schedule `pnpm backup` and copy the backups off the server. If the API is unavailable, directory pages show a retryable error state.

## Known limits and next steps

- Profile photos are links (https or site path); there is no upload storage yet.
- Rate limiting is in memory, which is fine for one server process.
- Sample profiles (including ratings and reviews) are fictional and labeled "Sample data". Replace them with real, approved locator profiles before demonstrating to the public; staff can hide or remove samples from the console.
- Messaging, payments, memberships, alerts, self-service locator accounts and AI assistance are Milestone 2.
