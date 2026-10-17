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
| 5 Payments and escrow | NOT STARTED | | |
| 6 Fulfilment and pickup stations | NOT STARTED | | |
| 7 Seller analytics | NOT STARTED | | |
| 8 Wishlist, stores, reviews | NOT STARTED | | |
| 9 Admin UI and moderation | IN PROGRESS (slices A, institutions and pickup stations, and B, seller verification: DONE pending manual checks) | `feat/phase-9-admin-institutions-stations`, `feat/phase-3-seller-verification` | 2026-10-09 |
| 10 Remaining features | NOT STARTED | | |

Status values: NOT STARTED / IN PROGRESS / BLOCKED / DONE / DONE pending manual checks.

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
- **Phases 5–10 decisions (2026-10-17):** answered in [decisions-needed.md](decisions-needed.md#answers-2026-10-17).
  The two that change the guide most:
  - **Delivery replaces pickup stations** (F2, DL1–DL10). An in-app dispatch delivers, or the buyer picks up from a
    seller who allows it. This replaces D12 and the agent half of D16. The station and agent code stays; the admin
    Stations screen stays visible. Checkout is reworked first, as a Phase 4 rework.
  - **Buyers may sign up without a school email** (T1). They pick their school during onboarding, and Google sign-in
    is for buyers only. Sellers still need a school email. This changes D7 for buyers.

## Decisions still open

Round 3 in [decisions-needed.md](decisions-needed.md#open-questions-round-3): dispatch riders, delivery fees,
addresses, deadlines and buyers without a school email. The Phase 4 rework waits on them.

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
- [Phase 9](phase-9-admin.md) (built in slices; browser evidence in [`evidence/phase9-admin/`](evidence/phase9-admin/))

## Working setup used for verification

- Local Postgres 16 (`campusmart_dev` for migrations and manual runs, `campusmart_test` for e2e), never Neon.
- If the container restarted and Postgres is down: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/cm-data -l /var/lib/postgresql/cm-pg.log -o '-p 5432 -k /tmp' start"`.
- `backend/.env` is local and git-ignored. Placeholder values only; no real credentials are committed.
- Gate commands: backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm test`,
  `pnpm run test:e2e`; frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build`.
