# Phase 3: listings, variants and uploads

Branch: `feat/phase-3-listings` (off `backend`).
Status: **DONE pending manual checks**

## 1. Checklist

From the guide, verbatim:

- [x] A seller at school A creates a listing with 3 images and 2 variants; a buyer at school A sees it, and a buyer at school B gets 404 on its ID.
- [x] Seller B gets 404 on `PATCH /listings/<A's id>`.
- [x] Selling the last variant unit flips the listing to `SOLDOUT`. (Checkout doesn't exist yet; the e2e test runs the
  decrement Phase 4 will use. Re-checked through real checkout in Phase 4.)
- [x] An image URL from another Cloudinary account is rejected with 400.
- [x] `grep -rn "components/data" app` only matches marketing content (promotions, featured displays).

Gate items:

- [x] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [x] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [x] `npm run gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] Every new endpoint meets the definition of done.
- [ ] **MANUAL:** a real upload to Cloudinary, once you have an account (see section 5).

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

### 3.2 Frontend
- **`lib/labels.ts`**: labels for categories, conditions, listing statuses (`ACTIVE` "In stock", `SOLDOUT` "Out of
  stock", `DRAFT`, `ARCHIVED`, `FLAGGED` "Under review"), fulfilment statuses and payment methods, plus
  `formatNaira(kobo)`, `nairaToKobo`, `koboToNairaInput` and `formatPriceRange` ("From ₦14,000" when options differ).
- **`lib/api/listings.ts`** on the generated types (`listingsApi`, `sellersApi`, `uploadsApi`). Hooks:
  `lib/api/hooks/useListings.ts` (`useListings` infinite with `meta.persist`, `useListing`, `useRelatedListings`,
  `useSellerListings(status)`, create/update/status/delete mutations that invalidate `['listings']` and
  `['seller-listings']`) and `useSellerProfile.ts` (optimistic update). The old `useSellerListings.ts` is gone.
- **Uploads** (`lib/uploads.ts`): resize to 1600 px on the long edge (canvas), one signature per batch, XHR upload with
  progress to `https://api.cloudinary.com/v1_1/<cloudName>/image/upload` with `file`, `api_key`, `timestamp`,
  `signature`, `folder` (and `type` when signed).
- **Buyer pages**: home (popular and newest carousels), `/categories` (category, `q` and `sort` in the URL, "Load
  more"), product page (gallery, option picker from `listing.variants`, hidden without options, Share with
  `navigator.share` or copy, seller card with Online, related items, no review votes), cart, favourites, checkout and
  order confirmation read the new shapes. `SearchBar` debounces `q` into the URL by 300 ms on `/categories` and
  submits to `/categories?q=` elsewhere. `app/utils/sortOptions.ts` maps to the API's `sort` values. Every list has
  skeleton, empty and error-with-retry states.
- **Stores**: `useCartStore` items carry `variantId`, `priceKobo`, `stockCount`; `useFavouritesStore` keeps card data;
  both bump their persist version. `useSellerStore` keeps only the (still mock) dashboard stats; `isOnline` is gone.
  `useAddProductStore` and the `SellerProduct` type are deleted.
- **Seller pages**: one `ListingForm` (photos with progress and cover, name, description, price in naira, stock,
  category, condition, "Sizes or options" rows of name, price override and stock, Publish / Save as draft / Save
  changes) drives `/sellers/addProduct` and the new `/sellers/products/[id]/edit`. Products list tabs All / In stock
  / Out of stock / Draft / Archived; the card menu offers Publish, Move to draft, Archive, Adjust stock, Edit and
  Delete (with a confirm). SKU is the last 6 characters of the ID. "Adjust stock" is a bottom sheet with one row per
  option. Store profile reads and writes `/sellers/me` (edit sheet for name, bio, logo; online switch), and the
  dashboard's online toggle uses the same mutation. `PendingStoreName` saves the store name typed at sign-up once.
- **Mock catalogue removed**: `app/components/data.ts` keeps only `featuredDisplays` and `promotions` (guide
  clean-up). The banner buttons pointed at a `/search` route that doesn't exist; they now open `/categories`.
- Tests (Vitest): `labels`, `uploads`, `share`, `listingFormModel`, `ListingForm`, `SellerProductCard`, `SearchBar`,
  `addCartNav`, `ProductCarousel`, `PendingStoreName`, and the edit page's loading / not-yours / retry states.

## 3. Verification evidence

Local Postgres 16; e2e on `campusmart_test`; browser walk on `campusmart_dev`.

| Item | Evidence |
|---|---|
| 3 images and 2 variants; school A sees it, school B gets 404 | e2e `test/phase3-listings.e2e-spec.ts` › checklist › "a seller at school A lists with 3 photos and 2 options; school A sees it, school B gets 404" (also `/related` 404 and an empty browse for B; no seller email in the response). Browser `evidence/phase3-listings/listings-walk.mjs` → `listings-walk-output.txt`: `PASS The add form takes 3 photos and 2 options`, `PASS Publishing uploads 3 photos…`, `PASS A buyer at the seller's school sees it on the home page`, `PASS A buyer at another school gets "not available" (API 404) for its ID`, `PASS …and an empty catalogue at their school`. Screenshots `phone-add-product.png`, `phone-home.png`, `phone-other-school.png`. |
| Seller B gets 404 on PATCH | e2e › checklist › "seller B gets 404 on PATCH /listings/<A's id>" (also `PATCH …/status` and `DELETE` 404, and a buyer at A gets 404). |
| Last variant unit → SOLDOUT | e2e › checklist › "selling the last variant unit flips the listing to SOLDOUT": the conditional decrement plus `recalculateListingStock` inside a transaction gives `SOLDOUT`, stock 0, buyers 404; restocking via PATCH gives `ACTIVE`, stock 4, and option ids survive. Unit `listing-rules.spec.ts` (`nextStatus`, `stockFromVariants`). |
| Foreign Cloudinary URL → 400 | e2e › checklist › "an image URL from another Cloudinary account is rejected with 400" (`INVALID_IMAGE`, nothing saved). Unit `cloudinary-urls.spec.ts` (another cloud, another user's folder, a URL that doesn't match its `publicId`, `http:`). |
| `components/data` | `grep -rn "components/data" app` → no output, exit 1. The only importer of `app/components/data.ts` is `FeaturedBanner.tsx` (`featuredDisplays`); the file now holds only `featuredDisplays` and `promotions`. |
| Definition of done | Unknown fields → 400 (e2e "only verified sellers can create, and unknown fields are rejected"; a client-sent `institutionId` is refused). Validation: e2e "validates price, photos and option names". Auth in the service (owner `findFirst` → 404; FLAGGED → 409; open orders → 409); role and verified-email guards (e2e: unverified seller 403, buyer 403 on create and on `/sellers/me`). Response DTOs in `lib/api/schema.d.ts`; `hasPayoutAccount` instead of the recipient code. Shared codes: `VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `INVALID_IMAGE`, `UPLOADS_NOT_CONFIGURED`, `LISTING_UNDER_REVIEW`, `LISTING_HAS_OPEN_ORDERS`, `NO_INSTITUTION`. Unit tests for every service rule (`listings.service.spec.ts`, `sellers.service.spec.ts`, `uploads.service.spec.ts`, `listing-rules.spec.ts`); e2e happy and forbidden paths for all 11 endpoints (17 tests). Frontend loading, empty and error states on every new screen (Vitest `ProductCarousel`, `ListingForm`, edit page). |
| Other rules | e2e: "replacing photos deletes the old ones from Cloudinary, keeping any an order shows" (`destroy` spy); "publish, unpublish and archive; drafts only show to their seller"; "delete is refused while an order is open, then soft-deletes"; "pages newest first with a cursor"; "sorts by price across pages, and filters by category and price"; "searches title and description, treating % literally"; "popular orders by the last 7 days' views"; "records a buyer's view but not the seller's, and lists related items"; "an account with no institution sees nothing"; "a seller reads and edits their store; buyers get 403"; "signs uploads into your own folder; verification uploads are private" (signature checked with Cloudinary's own `api_sign_request`). |
| Seller flows in a browser | `listings-walk-output.txt` **16/16 PASS**: delete with a confirm step, add with options, Adjust stock per option, edit opens with saved photos and options and saves without re-uploading, store name and online switch, search puts `q` in the URL, the product page shows the store and Online, Add to Cart waits for an option and uses the option's price, the cart shows "Option: L" and ₦15,000. Screenshots: `phone-seller-products.png`, `phone-product-menu.png`, `phone-adjust-stock.png`, `phone-delete-confirm.png`, `phone-edit-product.png`, `phone-seller-product.png`, `phone-seller-profile.png`, `phone-search.png`, `phone-product.png`, `phone-cart.png`. The browser's POST to `api.cloudinary.com` and Next's image proxy are answered locally (no Cloudinary account yet; images in the shots are the app's own sample photos). The dev overlay's "2 Issues" badge in some shots is the Vercel Analytics script being blocked by this sandbox's network, not an app error. |
| Backend gate | `npx tsc --noEmit` exit 0; `npm run lint -- --max-warnings 0` exit 0; `npm run build` exit 0; `npm test` → 25 suites, 186 tests passed; `npm run test:e2e` (DATABASE_URL → `campusmart_test`) → 6 suites, 84 tests passed. |
| Frontend gate | `npm run lint` exit 0 (0 errors, 1 pre-existing warning in `app/profile/page.tsx`); `npx tsc --noEmit` exit 0; `npx vitest run` → 30 files, 138 tests passed; `API_ORIGIN=http://localhost:4000 npm run build` exit 0 (`/categories`, `/productItem/[id]`, `/sellers/products`, `/sellers/products/[id]`, `/sellers/products/[id]/edit` built). |
| `gen:api` / migrate diff | CI path (`npm run openapi:export` + `openapi-typescript`) and `openapi-typescript http://localhost:4000/api/docs-json` both match the committed `lib/api/schema.d.ts` (`diff -q`). `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` → exit 0 (no schema change in this phase). |

### MANUAL: try the seller and buyer flows (for you)

Needs Cloudinary credentials in `backend/.env` (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`) and `res.cloudinary.com` allowed in `next.config` images (already there).

1. `cd backend && npm run dev`, then in the repo root `API_ORIGIN=http://localhost:4000 npx next dev -H 0.0.0.0 -p 3000`.
2. On your phone (`http://<laptop-LAN-IP>:3000`), sign in as a verified seller. Add a product with 3 photos and two
   sizes. Expect upload progress on each photo, then your products list with "In stock".
3. Check the photos in the Cloudinary console under `campusmart/listings/<your user id>/`.
4. Edit the product, replace one photo, save. The replaced photo should disappear from Cloudinary within a minute.
5. Sign in as a buyer at the same school in another browser: find the product by search, pick a size, add it to the
   cart. A buyer at another school shouldn't find it.
6. Tell me anything that felt unclear.

## 4. Deviations and assumptions

1. **"Verified" means a verified email.** Every listings route needs `@RequireVerifiedEmail()`; creating also needs
   the SELLER role. Seller identity verification (the "Verified seller" badge) isn't required to list. See section 5.
2. **Price sort and price filters use the listing's main price** (`priceKobo`). An option with a lower override price
   doesn't move the listing; cards still show "From ₦X" using the lowest option price. Revisit if sellers often price
   options below the main price.
3. **Popular** ties fall back to newest first. Its cursor carries an offset, capped at 200 results (rule 7).
4. **Signature lifetime**: we sign `{ folder, timestamp }` with the current time; Cloudinary itself refuses a
   timestamp older than 1 hour, which gives rule 5's hour without extra code.
5. **Removed photos** are deleted from Cloudinary in the background unless an order item still shows that URL.
   Removed options are deleted (order items keep `variantLabel` and the price snapshot). Options are matched by name
   on edit, so a cart line keeps pointing at an option that stays. **Phase 4 hand-off:** a cart line whose option was
   removed must show as unavailable.
6. **Owner reads**: the seller sees their own DRAFT, ARCHIVED, SOLDOUT and FLAGGED listings at `GET /listings/:id`
   (with `isOwner: true` and inactive options); buyers see ACTIVE listings and active options only. A FLAGGED listing
   can't change status (409 `LISTING_UNDER_REVIEW`) until Phase 9 moderation clears it.
7. **No institution** (an account created before Phase 1's institution rule): browse returns an empty page, a
   listing ID returns 404, and creating returns 403 `NO_INSTITUTION`.
8. **Store profile** is created on first `GET /sellers/me` when missing. Store name 2–60 characters, bio up to 500,
   logo must be one of the seller's own AVATAR uploads. The store name typed at sign-up (Phase 1, kept on the
   device) is saved once by `PendingStoreName`, unless the store already has a name.
9. **Saved carts and favourites from the mock catalogue are cleared once** (persist version 1), since their IDs
   don't exist on the server.
10. **SearchBar**: debounced URL updates only on `/categories`; on other pages, typing doesn't navigate until the
    buyer submits, so the page doesn't jump away mid-word.
11. **Home page**: the Featured Store row is hidden until Phase 8 (`GET /stores?featured=true`). The promo banner
    buttons now open `/categories` (Fashion and Tech go to their category; "Campus Essentials" to all).
12. **Seller dashboard numbers** stay mock in `useSellerStore` until Phase 7; only the online toggle is real.
13. **Mock catalogue deleted** (`categories`, `products`, `featuredProducts`, `featuredStores` in
    `app/components/data.ts`): the guide's clean-up item, done now that nothing imports them.
14. **Local dev data**: the walk left seller `amaka.store@students.unilag.edu.ng` (store "Amaka Styles", online),
    buyers `tobi.buyer@students.unilag.edu.ng` and `kemi.buyer@ui.edu.ng`, the institution University of Ibadan
    (`ui.edu.ng`, added through the admin API), and the listing "UrbanFlex cargo pants" with placeholder image URLs
    in `campusmart_dev`. Local only; a reset plus seed clears them.

## 5. Needs from you

- **Cloudinary account** (blocks real uploads): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET` for local `.env` and, later, the host's secrets. Production won't boot without them. Until
  then `POST /uploads/signature` answers 503 and the form says photo uploads aren't set up yet. Then run the MANUAL
  check above.
- **Can sellers list before identity verification?** Built as yes (verified email is enough); the badge shows only
  for verified sellers. Say if listing should wait for verification.
