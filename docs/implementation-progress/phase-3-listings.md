# Phase 3: listings, variants and uploads

Branches: `feat/phase-3-listings`, then `feat/phase-3-seller-verification` (both off `backend`).
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

Your rule (decided 2026-10-09): sellers must be verified by an admin before they can list.

- [x] An unverified seller can save drafts but can't publish (403 `SELLER_NOT_VERIFIED` on create with `ACTIVE` and
  on `PATCH /listings/:id/status` to `ACTIVE`); the add form offers Save as draft only and Publish is hidden.
- [x] A seller sends a student ID photo as a private upload; an admin approves or rejects it (a reject needs a note
  the seller sees); once approved, the seller can publish.
- [x] Only admins see the queue and the photo, through a link that expires after 10 minutes. Every decision is
  audited.
- [ ] **MANUAL:** the same flow with a real Cloudinary account (the photo must open for the admin and not for anyone
  else).

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

### 3.3 Seller verification before publishing (decided 2026-10-09)
Branch `feat/phase-3-seller-verification`. Brings forward the guide's seller verification (9.1 "Seller verification",
needed from Phase 3; 9.2.5; the "Get verified" card from Phase 10).
- **Schema**: `VerificationRequest` gains `reviewNote`, `reviewedAt`, `reviewedById` (nullable) and two indexes
  (`20261009190000_verification_review`, additive; no rows change). `reviewedById` is a plain column like
  `AuditLog.actorId`.
- **Publish rule** (`src/sellers/seller-verification.ts`): `POST /listings` with `status: ACTIVE` and
  `PATCH /listings/:id/status` to `ACTIVE` need `User.verificationStatus = VERIFIED`, else 403 `SELLER_NOT_VERIFIED`
  ("An admin needs to verify your student ID before your products can go live. You can save drafts in the
  meantime."). Drafts, edits, archiving, stock and delete don't need it.
- **Seller side** (`SellerVerificationController`, SELLER + verified email):
  - `POST /users/me/verify { documentUrl }`: only a private (`authenticated`) upload on our cloud inside
    `campusmart/verification/<userId>/` (else 400 `INVALID_DOCUMENT`). The user's status moves to `PENDING` with a
    conditional update, so two quick submits can't open two requests (409 `VERIFICATION_PENDING`, or
    `ALREADY_VERIFIED`). A rejected seller can send again. The old route, which took any URL and never changed the
    seller's status, is removed.
  - `GET /users/me/verification` → `{ status, latestRequest: { id, status, reviewNote, createdAt, reviewedAt } }`.
    The document URL is never returned.
- **Admin side** (`AdminVerificationController`, `@AdminOnly()` on the class):
  - `GET /admin/verification-requests?status=PENDING|VERIFIED|REJECTED&cursor&limit`: waiting oldest first,
    decided latest first. Each row has the seller (name, email, store, school) and `documentViewUrl`, a signed
    Cloudinary download link that expires after 10 minutes (`CloudinaryService.privateImageUrl`). A stored URL that
    isn't a private upload in that seller's folder gets `null`.
  - `POST /admin/verification-requests/:id/decide { decision: VERIFIED|REJECTED, note }`: note 3–500 characters,
    required to reject. Only a `PENDING` request can be decided (409 `VERIFICATION_ALREADY_DECIDED`). Updates the
    request and the user in one transaction and writes `SELLER_VERIFIED` / `SELLER_VERIFICATION_REJECTED` to the
    audit log with the note.
- **Frontend**:
  - Store profile: a "Get verified" card (upload student ID with progress → "We're checking your student ID" →
    approved: card gone, badge shown; rejected: the admin's note and "Send a new photo"). `useMyVerification`,
    `useSubmitVerification`, `useCanPublish`.
  - Add product offers Save as draft only until verified; the products list and product page hide Publish and show a
    short notice linking to the card.
  - `/admin/verifications` (nav: Verifications): Waiting / Approved / Rejected tabs, a review dialog with the ID
    photo beside the account details, Approve, or Reject with a note; "Reload photo" when the 10-minute link has
    expired. The overview shows how many sellers are waiting. The pill tabs moved out of `FilterBar` into `Tabs`.
- Tests: unit `seller-verification.service.spec.ts`, `admin-verification.service.spec.ts`,
  `cloudinary.service.spec.ts`, `cloudinary-urls.spec.ts` (`parseImageUrl`), `listings.service.spec.ts` (publish
  rule), `admin-dto.spec.ts`; e2e `test/phase3-seller-verification.e2e-spec.ts` (5); listing e2e sellers are created
  verified. Vitest `VerificationCard`, `ReviewDialog`, `ListingForm` (drafts only), `SellerProductCard` (no Publish).

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
| Seller verification: API | e2e `test/phase3-seller-verification.e2e-spec.ts`: "an unverified seller can save drafts but not publish"; "a seller sends their student ID once; buyers cannot" (5 kinds of wrong URL → `INVALID_DOCUMENT`, a second send → `VERIFICATION_PENDING`, buyers 403); "an admin rejects with a reason the seller sees, then approves a new photo; the seller can publish" (signed `image/download` link with `type=authenticated` and `expires_at` ≤ 10 minutes, no stored URL in responses, note required, deciding twice → 409, `/auth/me` shows `VERIFIED`, publish → `ACTIVE` with `seller.verified`, audit rows with the admin's id and note, `reviewedById` set); "only admins reach the queue, and an unknown request is 404"; "a stored URL that is not a private CampusMart upload is never linked". The Phase 9 access loop (`test/phase9-admin.e2e-spec.ts`) picks up both new admin routes from the OpenAPI document and checks 401 / 403. |
| Seller verification: browser | `evidence/phase3-seller-verification/verification-walk.mjs` → `verification-walk-output.txt`: **17/17 PASS** (a fresh seller, the seed admin on a laptop and on a phone): "Get verified" card; Add product with Save as draft only; no Publish in the draft's menu; the ID photo goes up as a private upload into the seller's verification folder; the overview counts 1 waiting; review dialog with the photo from a signed link expiring within 10 minutes; reject needs a note; the Rejected tab shows it; the seller sees the note and sends a new photo; the queue and dialog fit a phone; approve; the notice disappears and the draft publishes ("In stock"); the profile shows the badge. Screenshots: `phone-get-verified.png`, `phone-add-product-draft-only.png`, `phone-products-unverified.png`, `phone-verification-pending.png`, `desktop-overview-verification.png`, `desktop-verifications-queue.png`, `desktop-review-dialog.png`, `desktop-reject-note.png`, `desktop-rejected-tab.png`, `phone-verification-rejected.png`, `phone-admin-review.png`, `phone-admin-approved.png`, `phone-published-after-approval.png`, `phone-seller-verified.png`. The ID card is a generated sample (`sample-id-card.jpg`); Cloudinary's upload and download are answered locally. |
| Backend gate | Before seller verification: 25 suites / 186 unit tests, 6 suites / 84 e2e. After: `npx tsc --noEmit` exit 0; `npm run lint -- --max-warnings 0` exit 0; `npm run build` exit 0; `npm test` → 28 suites, 206 tests passed; `npm run test:e2e` (DATABASE_URL → `campusmart_test`) → 7 suites, 89 tests passed. |
| Frontend gate | Before seller verification: 30 files / 138 tests. After: `npm run lint` exit 0 (0 errors, 1 pre-existing warning in `app/profile/page.tsx`); `npx tsc --noEmit` exit 0; `npx vitest run` → 32 files, 153 tests passed; `API_ORIGIN=http://localhost:4000 npm run build` exit 0 (adds `/admin/verifications`). |
| `gen:api` / migrate diff | CI path (`npm run openapi:export` + `openapi-typescript`) and `openapi-typescript http://localhost:4000/api/docs-json` both match the committed `lib/api/schema.d.ts` (`diff -q`). `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` → exit 0 after `20261009190000_verification_review`. |

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
6. Seller verification: as a new seller, upload a photo of a student ID from the store profile. As the seed admin,
   open Verifications, check the photo opens, and approve. Copy the photo link and open it again after 10 minutes:
   it should no longer work. The same image address without its `s--…--/` signature part should be refused too
   (private images need a signature).
7. Tell me anything that felt unclear.

## 4. Deviations and assumptions

1. **Two kinds of "verified".** Every listings route needs a verified email (`@RequireVerifiedEmail()`); creating
   also needs the SELLER role. Publishing also needs an admin-verified seller (your rule, 2026-10-09; see 3.3).
   You chose to let unverified sellers prepare drafts.
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
14. **Local dev data**: the walks left sellers `amaka.store@students.unilag.edu.ng` (store "Amaka Styles", online)
    and `chidi.store@students.unilag.edu.ng` (Chidi Okeke, "Chidi Gadgets"), both now verified through the admin
    flow; buyers `tobi.buyer@students.unilag.edu.ng` and `kemi.buyer@ui.edu.ng`; the institution University of
    Ibadan (`ui.edu.ng`, added through the admin API); listings "UrbanFlex cargo pants" and two "Desk lamp"s with
    placeholder image URLs; and the verification requests and audit rows from the walks, all in `campusmart_dev`.
    Local only; a reset plus seed clears them. (The "UrbanFlex cargo pants" listing went live before the rule
    existed; production has no listings yet.)
15. **Seller verification details** (smallest choices, 2026-10-09):
    - Approval is final in this slice; there's no "revoke". If revoking is added, that seller's live listings should
      be hidden at the same time.
    - A seller's earlier ID photos stay in Cloudinary (private) after a rejection, for the record; nothing deletes
      them yet.
    - The seller isn't emailed or notified about the decision (MAIL_* isn't set up and notifications are Phase 10);
      they see it on their store profile.
    - The admin sees the seller's email, to match the card to the account. Only admins get it.
    - Cloudinary returns a private upload's address with a signature that doesn't expire. It's stored in
      `VerificationRequest.documentUrl` and never sent back by the API; admins only ever get the 10-minute link.
    - Buyers aren't affected: a buyer can't send a verification request (403).

## 5. Needs from you

- **Cloudinary account** (blocks real uploads): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET` for local `.env` and, later, the host's secrets. Production won't boot without them. Until
  then `POST /uploads/signature` answers 503 and the form says photo uploads aren't set up yet. Then run the MANUAL
  check above.
- ~~**Can sellers list before identity verification?**~~ **Decided 2026-10-09:** no. An admin verifies them first;
  until then they can save drafts. Built in 3.3.
- **Cloudinary "authenticated" delivery**: when the account is set up, check in the Cloudinary console that
  authenticated images aren't publicly reachable (the default). The MANUAL step above covers it.
