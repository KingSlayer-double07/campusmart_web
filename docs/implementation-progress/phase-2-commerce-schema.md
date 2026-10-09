# Phase 2: commerce schema migration

Branch: `feat/phase-2-commerce-schema` (off `backend`).
Status: **DONE** (all items verified; no manual items).

## 1. Checklist

From the guide, verbatim:

- [x] `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` is empty.
- [x] The seed creates an institution, two stations and an admin you can sign in with.
- [x] No `Decimal` remains in the schema.
- [x] A user can receive two reviews.

Gate items:

- [x] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [x] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [x] `npm run gen:api` produces no diff.
- [x] `prisma migrate reset` + `prisma db seed` run on the local dev database only (after Collins confirmed the
  migration SQL summary).

## 2. Changes

### 2.1 Before you start
- No Neon branch: per Collins, all work runs on a local Postgres 16 (`campusmart_dev` for the migration and the reset,
  `campusmart_test` for e2e, `campusmart_shadow` for diffs). Neon is listed under Needs from Collins.
- `campusmart_dev` held only the Phase 0/1 migrations applied at the start of this session, no data worth exporting.

### 2.2 Schema changes
- `backend/prisma/schema.prisma` rewritten to the guide's models, merged with the Phase 1 fields:
  - New models: `SellerProfile`, `PickupStation`, `ListingVariant`, `ListingDailyStat`, `CartItem`, `SellerOrder`,
    `Payout`, `Dispute`, `Notification`, `SupportReport`, `AuditLog`.
  - New enums: `PaymentMethod`, `EscrowStatus`, `PayoutStatus`, `DisputeStatus`. `OrderStatus` is now
    `PENDING_PAYMENT PAID CANCELLED EXPIRED` (`CART`, `AWAITING_PAYMENT`, `DISPUTED` gone). `FulfillmentStatus` gains
    `PENDING`. `ModerationActionType` gains `UNFLAG` and `SUSPEND_USER`.
  - `User`: `pickupStationId`/`pickupStation` ("StationAgents"), `sellerProfile`, `cartItems`, `notifications`,
    `sellerOrders` ("SellerOrders"); `reviewsReceived` is now `Review[]` (the one-review bug).
  - `Institution`: `isActive`, relations to pickup stations and orders.
  - `Listing`: `priceKobo` (was `price` Decimal), `stock` (was `quantity`), `institutionId` required, `ratingAvg`,
    `ratingCount`, variants, daily stats; indexes `[institutionId, status, isDeleted, createdAt]` and
    `[sellerId, status]` replace `[sellerId, status, institutionId]`.
  - `ListingImage`: `publicId`, `position`, cascade delete.
  - `Order`: buyer, institution, pickup station, `paymentMethod`, `subtotalKobo`, `totalKobo`, unique
    `idempotencyKey`, `expiresAt`, `paidAt`; `fulfillmentStatus`, `totalAmount`, `items` and `review` removed; index
    `[buyerId, createdAt]`.
  - `OrderItem` belongs to a `SellerOrder` and snapshots title, variant label, image and `unitPriceKobo`.
  - `Payment`: `amountKobo`, required `reference`, `provider` default `PAYSTACK`, `channel`, `paidAt`, `rawEvent`.
  - `Review`: belongs to a `SellerOrder`; `revieweeId` and `orderId` are no longer unique;
    `@@unique([sellerOrderId, listingId])`, `@@index([listingId, createdAt])`.
  - `Wishlist`: redundant `@@index([userId, listingId])` removed. `ModerationAction`: optional `targetUserId`.
    `VerificationRequest` unchanged.
- Migration: `backend/prisma/migrations/20261009145230_commerce_core/migration.sql` (summary under Needs from
  Collins).

### 2.3 Run it
1. Migration created (see Deviations 2 for how).
2. `npx prisma generate` + `npx tsc --noEmit`: no compile errors. The guide's expected fixes (`firstName` optional in
   `users.service.ts`, `domains` in the institutions DTO) were already done in Phases 0 and 1.
   - `backend/src/auth/auth.service.ts`: `accountType: 'SELLER'` now also creates an empty `SellerProfile` in the
     same transaction (guide 1.4 rule 9 deferred this to Phase 2).
   - `backend/src/institutions/dto/institution.dto.ts`: documents `isActive`; `lib/api/schema.d.ts` regenerated.
3. `backend/prisma/seed.ts`: one institution, two pickup stations (with `openingHours` JSON), and an admin from
   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`. Exported `seed(prisma, env)` so e2e runs the same code. Registered in
   `backend/prisma.config.ts` as `migrations.seed: 'ts-node prisma/seed.ts'`. Idempotent.
4. `prisma migrate reset --force` on local `campusmart_dev` (Collins confirmed the SQL summary, then gave Prisma's
   AI-consent text "yes, reset campusmart_dev"), followed by `npx prisma db seed`.
- `backend/README.md`: seed and reset steps.
- Tests: `backend/src/prisma/schema.spec.ts` (no Decimal, every `*Kobo` field is `Int`),
  `backend/test/phase2-schema.e2e-spec.ts` (seed, two reviews, one review per listing per seller order),
  `auth.service.spec.ts` and `phase1-auth.e2e-spec.ts` (seller gets a `SellerProfile`, buyer doesn't).

New env vars: none (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` were already in the env schema). New endpoints: none.

## 3. Verification evidence

Local Postgres 16. Unless stated, `DATABASE_URL=DIRECT_URL=postgresql://postgres:postgres@localhost:5432/campusmart_test`,
`SHADOW_DATABASE_URL=…/campusmart_shadow`.

| Item | Evidence |
|---|---|
| `migrate diff` empty | `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` → "No difference detected.", exit 0. After `npx prisma migrate deploy` on `campusmart_test`, `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → exit 0 too (the SQL applies cleanly on PG 16, including the enum changes). CI runs the first command on every push. |
| Seed: institution, two stations, admin you can sign in with | e2e `phase2-schema` › "creates an institution, two stations and an admin you can sign in with" (`POST /api/auth/login` 200 with role `ADMIN`, then `GET /api/auth/me` 200), › "can run again without duplicating rows or changing the admin password", › "refuses to run without admin credentials or with a weak password". CLI: `npx prisma db seed` twice on `campusmart_test` → "Seeded institution "University of Lagos" (unilag.edu.ng), 2 pickup stations and admin admin@campusmart.test." and 1 institution / 2 stations / 1 admin rows. |
| No `Decimal` | `grep -c Decimal backend/prisma/schema.prisma` → `0`. Unit `src/prisma/schema.spec.ts` › "has no Decimal anywhere", "stores every *Kobo field as Int". |
| A user can receive two reviews | e2e `phase2-schema` › "a user can receive two reviews" (two collected seller orders from the same seller, one review each → `reviewsReceived` has ratings [4, 5]); › "allows one review per listing per seller order" (a duplicate → `P2002`). |
| Backend gate | `npx tsc --noEmit` exit 0; `npm run lint -- --max-warnings 0` exit 0; `npm run build` exit 0 (`dist/main.js`); `npm test` → 14 suites, 103 tests passed; `npm run test:e2e` → 4 suites, 43 tests passed. |
| Frontend gate | `npm run lint` exit 0 (0 errors, the 2 pre-existing warnings); `npx tsc --noEmit` exit 0; `npx vitest run` → 9 files, 60 tests passed; `API_ORIGIN=http://localhost:4000 npm run build` exit 0. |
| Dev reset + seed | `DATABASE_URL=DIRECT_URL=…/campusmart_dev`: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes, reset campusmart_dev" npx prisma migrate reset --force` → "Database reset successful", all 5 migrations applied; `npx prisma db seed` → "Seeded institution "University of Lagos" (unilag.edu.ng), 2 pickup stations and admin admin@campusmart.test."; `migrate diff --from-config-datasource --to-schema … --exit-code` → exit 0; SQL counts 1 institution, 2 stations, 1 user (`ADMIN`). Built API on `campusmart_dev`: `POST /api/auth/login` as the seed admin → 200 (`ADMIN`, email verified), `GET /api/auth/me` → 200. |
| `gen:api` no diff | API on :4000, `npm run gen:api` → `schema.d.ts` gains only `InstitutionDto.isActive` (committed in `6c74a4d`). The CI path (`npm run openapi:export` + `openapi-typescript`) produces a byte-identical file (`diff -q` → identical). |

## 4. Deviations and assumptions

1. **Local Postgres instead of a Neon branch (2.1).** Collins' instruction for this session. Neon still needs the
   migration; see Needs from Collins.
2. **How the migration was created.** `npx prisma migrate dev --name commerce_core --create-only` refuses to run in a
   non-interactive shell ("Prisma Migrate has detected that the environment is non-interactive"). The SQL was
   produced by the same engine with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema
   prisma/schema.prisma --script` into `prisma/migrations/<UTC timestamp>_commerce_core/migration.sql`, which is
   exactly what `migrate dev --create-only` writes. It then applies with `migrate deploy`/`migrate reset`.
3. **Prisma 7 doesn't seed on `migrate reset`.** The CLI only runs the seed command from `prisma db seed`, so 2.3
   step 4 becomes `npx prisma migrate reset` followed by `npx prisma db seed`. The seed command is
   `ts-node prisma/seed.ts` (ts-node is already a dev dependency; `tsx` isn't installed).
4. **`--to-schema-datamodel` → `--to-schema`** (Prisma 7 rename, same as Phase 0).
5. **Back-relation `Listing.cartItems`.** Prisma requires both sides of `CartItem.listing`; the guide's relation
   comment for `Listing` doesn't list it.
6. **Plain ID columns kept as written.** The guide gives these as plain strings without relations, so they have no
   foreign key: `Payout.sellerId`, `Dispute.openedById`/`resolvedById`, `AuditLog.actorId`, `SupportReport.userId`/
   `listingId`, `CartItem.variantId`, `OrderItem.variantId`, `ModerationAction.targetUserId`. For the two
   `variantId`s that's useful: replacing a listing's variants (3.1) can't break carts or order snapshots. For
   `ModerationAction.targetUserId` a relation would also have forced renaming the existing moderator relation.
7. **Schema comment.** The guide's `priceKobo Int // was Decimal price` comment became `// was the naira \`price\`
   column`, so `grep Decimal schema.prisma` is clean for the checklist.
8. **Seed data is a placeholder.** The guide says "one institution with your real domains"; I don't have them. The
   seed uses University of Lagos / `unilag.edu.ng` (the domain the tests and Swagger examples already use) and two
   placeholder stations, marked `TODO(Collins)` at the top of `prisma/seed.ts`.
9. **Seed admin details.** Email is trimmed and lowercased like every other email. `emailVerifiedAt` is set (no code
   can be delivered before SMTP exists, and the operator owns the address). The admin joins the seeded institution
   only when its email is on that institution's domain. The password must meet the password policy. Re-running the
   seed never changes an existing password; it does set `role = ADMIN` on an existing account with
   `SEED_ADMIN_EMAIL` (the env var names who the admin is).
10. **`ModerationActionType.SUSPEND` kept** next to the new `SUSPEND_USER`; the guide only says to add values.
11. **`Institution.isActive` has no behaviour yet.** It's stored and returned (`InstitutionDto.isActive`), but sign-up
    still accepts every institution. See Needs from Collins.
12. **Seller sign-up creates the `SellerProfile`** (guide 1.4 rule 9, which deferred it to Phase 2).
13. **Prisma's AI guard on `migrate reset`.** Prisma 7 refuses `migrate reset` when run by an AI agent unless
    `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` holds the user's explicit consent message. Collins gave it in a
    separate message after reviewing the summary; the earlier approval didn't count for Prisma.

## 5. Needs from Collins

- ~~**Confirm the migration before I reset the local dev database.**~~ Confirmed and done 2026-10-09. Summary of
  `20261009145230_commerce_core/migration.sql`:
  - Destructive (fine because nothing is in production; the guide resets instead of converting data): drops
    `Listing.price`/`quantity`, `Order.fulfillmentStatus`/`totalAmount`, `OrderItem.orderId`/`price`,
    `Payment.amount`, `Review.orderId`; recreates `OrderStatus` without `CART`, `AWAITING_PAYMENT`, `DISPUTED`; drops
    the unique indexes `Review_revieweeId_key`, `Review_orderId_key`, `OrderItem_orderId_listingId_key`.
  - Adds required columns with no default (would fail on non-empty tables): `Listing.priceKobo`/`stock`,
    `Listing.institutionId` becomes NOT NULL, `ListingImage.publicId`/`position`, `Order.institutionId`/
    `pickupStationId`/`paymentMethod`/`subtotalKobo`/`totalKobo`/`idempotencyKey`/`expiresAt`,
    `OrderItem.sellerOrderId`/`titleSnapshot`/`unitPriceKobo`, `Payment.amountKobo`, `Payment.reference` NOT NULL,
    `Review.sellerOrderId`.
  - Creates 11 tables, 4 enums, 2 enum values on `ModerationActionType`, `PENDING` on `FulfillmentStatus`, 17 indexes
    and 18 foreign keys. Two of those replace dropped ones: `Listing → Institution` (now required) and
    `ListingImage → Listing` (now cascades on delete).
  - Plan: `npx prisma migrate reset --force` then `npx prisma db seed`, with `DIRECT_URL`/`DATABASE_URL` pointing at
    local `campusmart_dev` only.
- ~~**Real seed data**~~ **Decided 2026-10-09:** keep the placeholders; Collins edits `prisma/seed.ts` when
  the time is right.
- ~~**Neon**~~ **Decided 2026-10-09:** Collins migrates Neon after all phases are complete (after editing the
  seed data). Until then everything runs on the local Postgres.
- ~~**What should `Institution.isActive = false` do?**~~ **Decided 2026-10-09:** new sign-ups with its domains are
  blocked with a friendly message, it is hidden from the public `GET /institutions` list, and existing sellers can't
  sign in (same friendly message). Built with the Phase 9 institutions screen. Open detail: do existing buyers
  (and already signed-in sessions) keep access?
- ~~**Phase 9 timing**~~ **Decided 2026-10-09:** build the Phase 9 institutions and pickup-station admin screens right
  after Phase 2, then Phase 3.
- Still open from Phase 1: the middleware silent-refresh approach, branch protection for `master`/`develop`.
