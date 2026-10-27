# Implementation progress

Tracks work through [`docs/implementation-guide.md`](../implementation-guide.md). One file per phase holds
its checklist, changes, verification evidence, deviations and open asks.

| Phase | Status | Branch | Last updated |
|---|---|---|---|
| 0 Security and hygiene | DONE | `feat/phase-0-security` | 2026-10-08 |
| 1 Integration foundation | DONE pending manual checks | `feat/phase-1-integration` | 2026-10-08 |
| 2 Commerce schema | DONE | `feat/phase-2-commerce-schema` | 2026-10-09 |
| 3 Listings, variants, uploads | DONE pending manual checks (real Cloudinary upload) | `feat/phase-3-listings`, `feat/phase-3-seller-verification` | 2026-10-09 |
| 4 Cart and checkout | DONE | `feat/phase-4-cart-checkout` | 2026-10-09 |
| 4b Checkout with delivery | DONE | `feat/phase-4b-delivery-checkout` | 2026-10-17 |
| 5 Payments and escrow | DONE pending manual checks (a real Paystack test payment at staging) | `feat/phase-5-payments` | 2026-10-17 |
| 6 Dispatch and handover (replaces pickup stations) | DONE pending manual checks (QR scanning on an Android phone) | `feat/phase-6-dispatch` | 2026-10-17 |
| 7 Seller analytics | DONE | `feat/phase-7-analytics` | 2026-10-18 |
| 8 Wishlist, stores, reviews | DONE | `feat/phase-8-wishlist-stores-reviews` | 2026-10-18 |
| 9 Admin UI and moderation | DONE pending manual checks (a look over the console on a phone and a laptop) | `feat/phase-9-admin-institutions-stations`, `feat/phase-3-seller-verification`, `feat/phase-9-admin-moderation` | 2026-10-18 |
| 10 Remaining features | DONE pending manual checks (Google sign-in with a real account) and your approval of the Terms and Privacy draft | `feat/phase-10-remaining` | 2026-10-19 |
| 10b First visit and browsing without an account | DONE pending your copy and drawings for the intro slides | `feat/phase-10b-guest-browsing` | 2026-10-19 |

Status values: NOT STARTED / IN PROGRESS / BLOCKED / DONE / DONE pending manual checks.

Also: [demo data for staging](demo-data.md) (`pnpm run seed:demo`, 2026-10-27), which you run against staging
yourself.

## Decisions since the guide

Your decisions that change or extend the guide. Each phase file has the detail.

- **Branching (2026-10-09):** phase branches come off `backend`, not `develop`; `backend` is fast-forwarded to each
  phase branch at its gate. Nothing is merged to `develop` or `master`.
- **Rate limits per account (2026-10-09):** `AccountThrottlerGuard` keys limits by verified user id, else request
  email, else IP (campus NAT). See Phase 1.
- **Mail (2026-10-09):** `MAIL_*` waits for the domain. Development and test print codes to the console; a production
  API won't boot without `MAIL_*`.
- **Local Postgres, Neon later (2026-10-09):** all work runs on a local Postgres 16. You migrate Neon
  after all phases are complete.
- **Seed data (2026-10-09):** the seed's institution and stations stay placeholders until you edit them.
- **Inactive institutions (2026-10-09):** new sign-ups with its domains are blocked with a friendly message, it is
  hidden from the public institutions list, and only admins can sign in there; buyers, sellers and pickup agents get
  the same message. Anyone signed in is cut off on their next token refresh. Built in Phase 9 slice A.
- **Switching off needs a quiet school (2026-10-09):** an institution with orders in progress can't be switched off;
  the admin dialog says how many orders are open.
- **Middleware and cookies (2026-10-09):** keep the Phase 1 approach as is (sign-in page refreshes silently).
- **Sellers are verified before they publish (2026-10-09):** a seller sends a photo of their student ID and an admin
  approves it at `/admin/verifications`. Until then the seller can save drafts but not publish. A rejection carries
  a note the seller sees (new nullable columns on `VerificationRequest`). See Phase 3, 3.3.
- **Cart lines remember their price (2026-10-09):** a nullable `CartItem.unitPriceKobo` lets the cart say a price
  changed since it was added. Checkout always charges the current price. See Phase 4.
- **Phase 9 timing (2026-10-09):** the institutions and pickup-station admin screens come right after Phase 2, then
  Phase 3.
- **pnpm only (2026-10-17):** both apps install with pnpm (`packageManager` pins 10.32.1); the npm lockfiles are
  deleted and CI runs `pnpm install --frozen-lockfile`.
- **Prohibited items mean suspension (2026-10-17, M4d):** not a trust-score deduction.
- **Phases 5–10 decisions (2026-10-17):** answered in [decisions-needed.md](decisions-needed.md#answers-2026-10-17).
  The two that change the guide most:
  - **Delivery replaces pickup stations** (F2, DL1–DL10, round 3). An in-app dispatch delivers on and off campus,
    or the buyer picks up from a seller who allows it. One delivery job per order opens to riders automatically at
    payment; one rider collects from every store and delivers once. Riders are invited by admins and paid outside the
    app, and the order's one delivery fee goes to the platform. This replaces D12 and the agent half of D16. The station and agent code stays;
    the admin Stations screen stays visible. Checkout is reworked first, as Phase 4b.
  - **Buyers may sign up without a school email** (T1). They pick their school during onboarding, and Google sign-in
    is for buyers only. Sellers still need a school email. This changes D7 for buyers.

- **Browsing without an account (2026-10-19):**
  - **First visit:** the splash, then intro slides, then Browse, Buy or Sell.
  - **Browsing:** Browse needs no account, only a school picked on the phone. Guests see listings, search,
    categories and reviews, but not store pages, and can fill and open a cart.
  - **Sign-in:** at checkout, or to save a favourite. The school they browsed is pre-selected when they sign up.
  - **What it replaces:** guide 3.1's "verified user" rule for listing reads, so D14 holds as written. See
    Phase 10b.
- **Terms and Privacy (2026-10-19, T5):** drafted from the decisions and shown in the app as "Draft, not yet in
  effect" until you approve the text and give an effective date. See Phase 10.

## Plan and open questions

- [execution-plan.md](execution-plan.md): what Phases 4b–10 build, in order, with each phase's gate checklist and
  what it needs from you.
- [decisions-needed.md](decisions-needed.md#answers-2026-10-17): every answer, six rounds; nothing is open.

## What you need to set up

[setup-checklist.md](setup-checklist.md): accounts, keys and dashboard settings for Phases 5–10 and launch, plus
everything still open from Phases 0–4 and 9.

## Phase files

- [Phase 0](phase-0-security.md)
- [Phase 1](phase-1-integration.md) (browser smoke evidence in [`evidence/`](evidence/))
- [Phase 2](phase-2-commerce-schema.md)
- [Phase 3](phase-3-listings.md) (browser evidence in [`evidence/phase3-listings/`](evidence/phase3-listings/) and
  [`evidence/phase3-seller-verification/`](evidence/phase3-seller-verification/))
- [Phase 4](phase-4-cart-checkout.md) (browser evidence in [`evidence/phase4-cart-checkout/`](evidence/phase4-cart-checkout/))
- [Phase 4b](phase-4b-delivery-checkout.md) (browser evidence in [`evidence/phase4b-delivery-checkout/`](evidence/phase4b-delivery-checkout/))
- [Phase 5](phase-5-payments.md) (browser evidence, with the local Paystack stub, in [`evidence/phase5-payments/`](evidence/phase5-payments/))
- [Phase 6](phase-6-dispatch.md) (browser evidence, rider to buyer, in [`evidence/phase6-dispatch/`](evidence/phase6-dispatch/))
- [Phase 7](phase-7-analytics.md) (browser evidence in [`evidence/phase7-analytics/`](evidence/phase7-analytics/))
- [Phase 8](phase-8-wishlist-stores-reviews.md) (browser evidence in [`evidence/phase8-wishlist-stores-reviews/`](evidence/phase8-wishlist-stores-reviews/))
- [Phase 9](phase-9-admin.md) (built in three slices; browser evidence in [`evidence/phase9-admin/`](evidence/phase9-admin/))
- [Phase 10](phase-10-remaining.md) (browser, Sentry and service worker evidence in [`evidence/phase10-remaining/`](evidence/phase10-remaining/);
  the Terms and Privacy draft for review in [`docs/legal/terms-and-privacy.md`](../legal/terms-and-privacy.md))
- [Phase 10b](phase-10b-guest-browsing.md) (first-visit walk and screenshots in [`evidence/phase10b-guest-browsing/`](evidence/phase10b-guest-browsing/))

## Working setup used for verification

- Local Postgres 16 (`campusmart_dev` for migrations and manual runs, `campusmart_test` for e2e), never Neon.
- If the container restarted and Postgres is down: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/cm-data -l /var/lib/postgresql/cm-pg.log -o '-p 5432 -k /tmp' start"`.
- `backend/.env` is local and git-ignored. Placeholder values only; no real credentials are committed.
- Stop a server with a separate command whose own text doesn't contain the pattern (for example
  `P="next st""art"; pgrep -f "$P" | xargs -r kill`); a pattern that matches the shell's own command line kills it.
- Payments in a browser walk: start the API with `PAYMENTS_ENABLED=true PAYSTACK_SECRET_KEY=sk_test_walk_local_only node -r <repo>/docs/implementation-progress/evidence/phase5-payments/paystack-stub.cjs dist/main`. The stub answers every Paystack call locally.
- Gate commands: backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm test`,
  `pnpm run test:e2e`; frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build`.
