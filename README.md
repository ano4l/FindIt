# Findit HTX

Responsive public marketplace preview for connecting Houston renters with apartment locators. The app uses the supplied design references and the repository venture documents' navy and teal palette, professional membership model, and trust-first product language.

## Run locally

Requires Node.js 20.19+ (or 22.12+) and pnpm.

```sh
pnpm install
pnpm dev
```

Create a production bundle with:

```sh
pnpm build
pnpm preview
```

## What's included

- Responsive public landing page and locator directory.
- Search by name, Houston neighborhood, service area, specialty, or sample ZIP code.
- Specialty and quick filters, sort options, and sample profile details.
- Locally generated skyline and portrait assets.
- Interactive demo sign-in and sign-up with locator and apartment-community portal views.
- Shared admin demo console with sample locator/community records, filters, a review queue, and temporary moderation controls.
- Local-only session and sample changes held in React state; everything resets when the app reloads.
- An illustrative annual membership price configurable with `VITE_ANNUAL_MEMBERSHIP_PRICE`.

All locator names, portraits, ratings, reviews, response times, and profile details are fictional preview data. The sign-in and sign-up forms accept browser-validated demo inputs, but do not send or store credentials. The portal session contains only an in-memory display name and selected role. Admin actions only change fictional fixture data in the current page session. These flows do not provide real authentication, authorization, account security, or protected admin access; all session and moderation state resets on reload. Save actions are also held in page state only. No account, message, payment, verification, database, or billing operation is live. The `$199/year` display is an example from the design reference and is not confirmed commercial pricing.

## Next product phase

The portal and admin console are visual interaction demos. This checkout does not yet include backend authentication, role security, persistent profile editing, messaging, Stripe subscriptions and webhooks, the AI assistant, protected admin tools, or a live locator verification workflow. Connect and validate those services before presenting them as available. Keep rental inventory and availability search out of the MVP unless the product scope changes.
