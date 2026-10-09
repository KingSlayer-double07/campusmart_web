# Implementation progress

Tracks work through [`docs/implementation-guide.md`](../implementation-guide.md). One file per phase holds
its checklist, changes, verification evidence, deviations and open asks.

| Phase | Status | Branch | Last updated |
|---|---|---|---|
| 0 Security and hygiene | DONE | `feat/phase-0-security` | 2026-10-08 |
| 1 Integration foundation | DONE pending manual checks | `feat/phase-1-integration` | 2026-10-08 |
| 2 Commerce schema | DONE | `feat/phase-2-commerce-schema` | 2026-10-09 |
| 3 Listings, variants, uploads | DONE pending manual checks (real Cloudinary upload) | `feat/phase-3-listings` | 2026-10-09 |
| 4 Cart and checkout | NOT STARTED | | |
| 5 Payments and escrow | NOT STARTED | | |
| 6 Fulfilment and pickup stations | NOT STARTED | | |
| 7 Seller analytics | NOT STARTED | | |
| 8 Wishlist, stores, reviews | NOT STARTED | | |
| 9 Admin UI and moderation | IN PROGRESS (slice A, institutions and pickup stations: DONE pending manual checks) | `feat/phase-9-admin-institutions-stations` | 2026-10-09 |
| 10 Remaining features | NOT STARTED | | |

Status values: NOT STARTED / IN PROGRESS / BLOCKED / DONE / DONE pending manual checks.

## Decisions since the guide

Collins' calls that change or extend the guide. Each phase file has the detail.

- **Branching (2026-10-09):** phase branches come off `backend`, not `develop`; `backend` is fast-forwarded to each
  phase branch at its gate. Nothing is merged to `develop` or `master`.
- **Rate limits per account (2026-10-09):** `AccountThrottlerGuard` keys limits by verified user id, else request
  email, else IP (campus NAT). See Phase 1.
- **Mail (2026-10-09):** `MAIL_*` waits for the domain. Development and test print codes to the console; a production
  API won't boot without `MAIL_*`.
- **Local Postgres, Neon later (2026-10-09):** all work runs on a local Postgres 16. Collins migrates Neon
  after all phases are complete.
- **Seed data (2026-10-09):** the seed's institution and stations stay placeholders until Collins edits them.
- **Inactive institutions (2026-10-09):** new sign-ups with its domains are blocked with a friendly message, it is
  hidden from the public institutions list, and only admins can sign in there; buyers, sellers and pickup agents get
  the same message. Anyone signed in is cut off on their next token refresh. Built in Phase 9 slice A.
- **Switching off needs a quiet school (2026-10-09):** an institution with orders in progress can't be switched off;
  the admin dialog says how many orders are open.
- **Middleware and cookies (2026-10-09):** keep the Phase 1 approach as is (sign-in page refreshes silently).
- **Phase 9 timing (2026-10-09):** the institutions and pickup-station admin screens come right after Phase 2, then
  Phase 3.

## Phase files

- [Phase 0](phase-0-security.md)
- [Phase 1](phase-1-integration.md) (browser smoke evidence in [`evidence/`](evidence/))
- [Phase 2](phase-2-commerce-schema.md)
- [Phase 3](phase-3-listings.md) (browser evidence in [`evidence/phase3-listings/`](evidence/phase3-listings/))
- [Phase 9](phase-9-admin.md) (built in slices; browser evidence in [`evidence/phase9-admin/`](evidence/phase9-admin/))

## Working setup used for verification

- Local Postgres 16 (`campusmart_dev` for migrations and manual runs, `campusmart_test` for e2e), never Neon.
- If the container restarted and Postgres is down: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/cm-data -l /var/lib/postgresql/cm-pg.log -o '-p 5432 -k /tmp' start"`.
- `backend/.env` is local and git-ignored. Placeholder values only; no real credentials are committed.
- Gate commands: backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm test`, `npm run test:e2e`;
  frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
