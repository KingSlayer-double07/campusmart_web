# Phase 4: cart and checkout

Branch: `feat/phase-4-cart-checkout` (off `backend`).
Status: **IN PROGRESS**

## 1. Checklist

From the guide, verbatim:

- [ ] Two browsers checking out the last unit at the same time: one succeeds, one gets `OUT_OF_STOCK`.
- [ ] Changing a price in the database after items are in a cart doesn't change the snapshot on an order already placed.
- [ ] Resubmitting checkout with the same `idempotencyKey` returns the same order.
- [ ] An unpaid order expires after 30 minutes and its stock returns.
- [ ] A cart with items from 2 sellers produces 2 seller orders with different codes.

Gate items:

- [ ] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [ ] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [ ] `npm run gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [ ] Every new endpoint meets the definition of done.

## 2. Changes

## 3. Verification evidence

## 4. Deviations and assumptions

## 5. Needs from you
