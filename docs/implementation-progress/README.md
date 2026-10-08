# Implementation progress

Tracks work through [`docs/implementation-guide.md`](../implementation-guide.md). One file per phase holds
its checklist, changes, verification evidence, deviations and open asks.

| Phase | Status | Branch | Last updated |
|---|---|---|---|
| 0 Security and hygiene | DONE | `feat/phase-0-security` | 2026-10-08 |
| 1 Integration foundation | DONE pending manual checks | `feat/phase-1-integration` | 2026-10-08 |
| 2 Commerce schema | NOT STARTED | | |
| 3 Listings, variants, uploads | NOT STARTED | | |
| 4 Cart and checkout | NOT STARTED | | |
| 5 Payments and escrow | NOT STARTED | | |
| 6 Fulfilment and pickup stations | NOT STARTED | | |
| 7 Seller analytics | NOT STARTED | | |
| 8 Wishlist, stores, reviews | NOT STARTED | | |
| 9 Admin UI and moderation | NOT STARTED | | |
| 10 Remaining features | NOT STARTED | | |

Status values: NOT STARTED / IN PROGRESS / BLOCKED / DONE / DONE pending manual checks.

## Phase files

- [Phase 0](phase-0-security.md)
- [Phase 1](phase-1-integration.md) (browser smoke evidence in [`evidence/`](evidence/))

## Working setup used for verification

- Local Postgres 16 (`campusmart_dev` for migrations and manual runs, `campusmart_test` for e2e), never Neon.
- `backend/.env` is local and git-ignored. Placeholder values only; no real credentials are committed.
- Gate commands: backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm test`, `npm run test:e2e`;
  frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
