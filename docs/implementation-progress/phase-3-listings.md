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

### 3.1 Backend: listings, sellers, uploads
- **Uploads** (`src/uploads/`): `POST /uploads/signature { purpose: LISTING | AVATAR | VERIFICATION }` →
  `{ cloudName, apiKey, timestamp, signature, folder, type? }`. It signs `{ folder, timestamp }` with Cloudinary's
  `api_sign_request` (adding `type: 'authenticated'` for VERIFICATION). Folders are
  `campusmart/<listings|avatars|verification>/<userId>`. `CloudinaryService` (sign, best-effort `destroy`),
  `cloudinary-urls.ts` (`isOwnUpload`, `isOwnUploadUrl`). Without `CLOUDINARY_*` the endpoint answers 503
  `UPLOADS_NOT_CONFIGURED`. New dependency: `cloudinary` 2.11.
- **Env**: `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` are now required when `NODE_ENV=production` (optional
  elsewhere).
- **Listings** (`src/listings/`), all `@RequireVerifiedEmail()`:
  - `GET /listings`: `q`, `category`, `condition`, `minPriceKobo`, `maxPriceKobo`, `sort` (`newest`,
    `price_asc`, `price_desc`, `popular`), `cursor`, `limit` (max 50, default 20) → `{ items: ListingCardDto[],
    nextCursor }`.
  - `GET /listings/:id` (records a view for non-sellers) and `GET /listings/:id/related` (10, same category).
  - `POST /listings` (SELLER), `PATCH /listings/:id`, `PATCH /listings/:id/status`, `DELETE /listings/:id`
    (owner, 404 otherwise).
  - Rules:
    - Scope: own institution, not deleted, ACTIVE for buyers. `institutionId` is copied from the seller.
    - Stock and status: `listing-rules.ts` `nextStatus`, plus `listing-stock.ts` `recalculateListingStock(db, id)`,
      which checkout will call in Phase 4.
    - Image ownership checks. Replaced photos are deleted from Cloudinary in the background.
    - Views: an upsert on `ListingDailyStat` per Lagos day, not awaited.
    - Popular: a raw SQL ranking by the last 7 days' views, offset paging capped at 200.
    - Search: ILIKE on the title or description, with `%`/`_` escaped.
  - Keyset cursors: `listing-cursor.ts`.
- **Sellers** (`src/sellers/`, SELLER + verified): `GET /sellers/me`, `PATCH /sellers/me { storeName, bio, logoUrl,
  isOnline }`, `GET /sellers/me/listings?status&cursor&limit`. The profile is created on first read when missing.
  `hasPayoutAccount` replaces the Paystack recipient code, which is never returned.
- `src/common/open-seller-orders.ts` (moved from `src/admin/open-orders.ts`): one definition of an unfinished seller
  order, used by "switch off a school" (Phase 9) and "delete a listing" (here).
- New error codes: `INVALID_IMAGE` (400), `UPLOADS_NOT_CONFIGURED` (503), `LISTING_UNDER_REVIEW` (409),
  `LISTING_HAS_OPEN_ORDERS` (409), `NO_INSTITUTION` (403).
- Tests: unit `listing-rules.spec.ts`, `listings.service.spec.ts`, `sellers.service.spec.ts`,
  `uploads.service.spec.ts`, `cloudinary-urls.spec.ts`, `env.spec.ts`. e2e `test/phase3-listings.e2e-spec.ts` (17),
  with `test/setup-env.ts` giving e2e runs test Cloudinary settings; `CloudinaryService.destroy` is spied on, so
  nothing reaches Cloudinary.

## 3. Verification evidence

## 4. Deviations and assumptions

## 5. Needs from Collins
