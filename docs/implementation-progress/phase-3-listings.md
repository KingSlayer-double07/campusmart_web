# Phase 3: listings, variants and uploads

Branch: `feat/phase-3-listings` (off `backend`).
Status: **IN PROGRESS**

## 1. Checklist

From the guide, verbatim:

- [ ] A seller at school A creates a listing with 3 images and 2 variants; a buyer at school A sees it, and a buyer at school B gets 404 on its ID.
- [ ] Seller B gets 404 on `PATCH /listings/<A's id>`.
- [ ] Selling the last variant unit flips the listing to `SOLDOUT`.
- [ ] An image URL from another Cloudinary account is rejected with 400.
- [ ] `grep -rn "components/data" app` only matches marketing content (promotions, featured displays).

Gate items:

- [ ] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [ ] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [ ] `npm run gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [ ] Every new endpoint meets the definition of done.

## 2. Changes

## 3. Verification evidence

## 4. Deviations and assumptions

## 5. Needs from Collins
