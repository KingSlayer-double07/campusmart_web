# Phase 8: wishlist, stores, reviews and the trust score

Branch: `feat/phase-8-wishlist-stores-reviews` (off `backend`, with Phase 7 merged in).
Status: **DONE**

Built from the guide's 8.1–8.4 as changed by
[execution-plan.md](execution-plan.md#phase-8-wishlist-stores-reviews-trust-score) and your answers R1–R5 in
[decisions-needed.md](decisions-needed.md).

## 1. Checklist

The guide's Phase 8 list:

- [x] A buyer can't review an item they haven't received (403 `REVIEW_NOT_OPEN`) or review it twice (409
      `ALREADY_REVIEWED`). Both are in e2e and unit tests. Someone else's order is 404, and an item not in the order
      is 400.
- [x] A seller's rating updates right after a review. In e2e the listing and the seller show 4 from one review, then
      4.5 from two. The walk shows the listing's count going up by one as soon as the buyer rates.
- [x] No link in the app points at a missing route. `app/routes.test.ts` checks, on every CI run:
  - every internal `href`, `push`, `replace` and `redirect` in `app/` and `lib/`;
  - every notification link the API sends.

  Each must match a page under `app/`. It found and removed one dead link (Dark Mode's
  `/profile/settings/dark_mode`); `/new` and `/recommendations` now go to `/browse`. The walk also opened every
  link on eight buyer screens (18 links) and none gave a 404.

The plan's additions:

- [x] Favourites saved on the phone before sign-in move into the account at first sign-in, then leave the phone (R5).
      Covered in e2e (merge) and frontend tests, and the walk seeded the old storage key before signing in.
- [x] Featured stores are ranked by the guide's formula (R3). The e2e puts 4.5 from 2 reviews above 5.0 from 1, and
      leaves out sellers with no live listing and other schools.
- [x] Store pages show the seller's area only when they allow pickup (SA2), in e2e and a frontend test.
- [x] Reviews open once an order is delivered or collected. Buyers can't edit them, and sellers can't reply. Admins
      can hide an abusive one, and show it again (R4), in e2e, unit tests and the walk.
- [x] The trust score is recalculated nightly with the weights in settings (R1). A changed weight applies at the next
      run (R1b, e2e).
  - "Completed" means delivered or collected.
  - A "Trusted seller" badge shows at 80 or more (R2).
- [x] **Carried from Phase 5:** a seller-fault refund lowers the trust score. In e2e Ada goes from 100 to 80
      (−10, and 2 of 3 settled orders now handed over) after cancelling a paid order. With the penalty raised to 25
      she drops to 65 and loses the badge.
- [x] A prohibited listing doesn't cost points. Nothing in the score looks at listings; suspension is Phase 9 (M4d).
- [x] 24 hours after handover, the buyer is asked once to rate what they received (guide 8.4, e2e).

Gate items:

- [x] Backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm run build`, `pnpm test`,
      `pnpm run test:e2e` pass.
- [x] Frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build` pass.
- [x] `gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] GitHub CI is green on the branch.
- [x] Every new endpoint meets the definition of done: validated DTOs and queries that reject unknown fields, auth in
      the service, documented responses, shared error codes, and unit and e2e tests with a forbidden path.

## 2. Changes

### Schema

`20261020090000_reviews_trust` (additive):

| Change | Why |
|---|---|
| `Review.hiddenAt`, `hiddenById`, `hiddenReason` | R4: an admin hides an abusive review with a reason |
| `SellerOrder.reviewReminderAt` | Guide 8.4: the buyer is asked once to rate |

`User.trustScore`, `Wishlist`, `Review` and the rating columns already existed (Phase 2).

### Backend

**Wishlist** (`src/wishlist/`, `@BuyerAccess()`: a verified email, and riders can't: DX7):

| Endpoint | What |
|---|---|
| `GET /wishlist?cursor=` | Listing cards, newest first, with `available: false` for ones sold out, paused or removed |
| `GET /wishlist/ids` | Every favourite's id, for the hearts |
| `PUT /wishlist/:listingId` | 204, idempotent. The listing must be at the user's school (404 otherwise). Up to 500 (`WISHLIST_FULL`) |
| `DELETE /wishlist/:listingId` | 204, idempotent |
| `POST /wishlist/merge { listingIds }` | R5: up to 100 ids saved on the phone; ones the user can't see are skipped |

**Stores** (`src/stores/`, a verified email, the user's own school):

| Endpoint | What |
|---|---|
| `GET /stores?featured=true&limit=10` | The home page row |
| `GET /stores?cursor=` | All stores, paged |
| `GET /stores/:sellerId` | The header |
| `GET /stores/:sellerId/listings?cursor=` | The store's live listings |
| `GET /stores/:sellerId/reviews?cursor=` | The store's reviews |

- **Ranking (R3):** `ratingAvg × ln(1 + ratingCount)`, then paid orders in the last 30 days. Sellers with no live
  listing are left out.
- **Cards** carry `storeName`, `logoUrl`, `ratingAvg`, `ratingCount`, `verified`, `trusted` and `listingCount`.
- **The header** adds the bio, online, `pickupArea` (only with pickup: SA2) and when they joined.
- **Not visible:** another school's seller, or someone who isn't a seller, is 404.

**Reviews** (`src/reviews/`):

| Endpoint | Who | What |
|---|---|---|
| `POST /seller-orders/:id/reviews { listingId, rating 1–5, comment ≤ 500 }` | The buyer | Only once the store order is `DELIVERED` or `COLLECTED`. In one transaction it saves the review and recounts the listing's and the seller's `ratingAvg` and `ratingCount` from the reviews that show |
| `GET /listings/:id/reviews?cursor=` | Anyone at the school | `{ id, rating, comment, reviewerDisplayName, listingTitle, createdAt }`, newest first |
| `GET /admin/reviews?view=SHOWN\|HIDDEN` | Admin | |
| `POST /admin/reviews/:id/hide { reason }` | Admin | Audited `REVIEW_HIDDEN`; the ratings are recounted (`ALREADY_HIDDEN`) |
| `POST /admin/reviews/:id/show` | Admin | Audited `REVIEW_SHOWN` (`NOT_HIDDEN`) |

- **The reviewer** shows as their username or first name, never their email.
- **The buyer's order** now has `canReview` per store order and `myRating` per item.
- **The reminder:** every hour, store orders handed over 24 hours to 7 days ago with no review get one in-app
  `REVIEW_REMINDER` linking to `/orders/<id>#rate`.

**Trust score** (`src/trust/`): every night at 02:30 Lagos time, for every seller:
- 50 × (rating / 5);
- plus 30 × the handed-over share of their last 50 settled orders (paid, then delivered, collected or cancelled);
- plus 20 if verified;
- minus 10 per seller-fault refund in 90 days, which includes their own cancellations;
- clamped to 0–100.

The weights are the new settings `trustWeightRating`, `trustWeightCompleted`, `trustWeightVerified` and
`trustPenaltySellerFault`, with env defaults `TRUST_*`. Listing cards, product pages and stores carry `trusted` (80
or more); the score itself isn't sent to buyers (R2).

### Frontend

- **Favourites:**
  - `useWishlist()` (`lib/api/hooks/useWishlist.ts`) drives every heart with an optimistic toggle that's put back if
    the API refuses.
  - A guest gets a "Sign in to save favourites" sheet.
  - `useSavedFavouritesMerge` (in `AuthProvider`) moves the old `campus-mart-favourites` key into the account at
    sign-in and removes it (R5).
  - `useFavouritesStore` is deleted.
  - `/favourites` reads `GET /wishlist`, marks ones no longer available, and removes at once. The cart's "save
    selected" and the cart and confirmation carousels use the account's favourites.
- **Stores:**
  - The home page has a Featured Store row.
  - `/stores` lists every store.
  - `/stores/[id]` shows the logo, verified tick, "Trusted seller", rating, bio, area when buyers can pick up, items
    and reviews.
  - Product pages link the seller block to the store and show the badge.
- **Reviews:**
  - Product pages list reviews from the API, with "Show more".
  - The buyer's order page shows "Rate your items" once received, a rating dialog (1–5 stars, an optional comment)
    and "You rated it". The reminder lands on `#rate`.
- **Admin:**
  - `/admin/reviews` (Shown and Hidden tabs) to hide with a reason or show again; "Reviews" in the nav.
  - Settings gain a "Trust score" group with the four weights.
- **Links:**
  - `/browse` hands over to the categories grid with the same `sort`, `category` and `q`.
  - "You Might Need" and "New in Stock" go to `/browse?sort=popular` and `/browse?sort=newest`.
  - `app/routes.test.ts` is the link crawl.

### Fixed in Phase 6 code

- **A rider who loses the race to accept a job** now gets 409 `JOB_TAKEN`. Before, the job and its stores were read in
  separate queries. Another rider's accept could commit in between, so the job still looked open while its stores
  were already assigned, and the late rider got 400 `WINDOW_REQUIRED`. The job is now read again before that answer.
  CI caught it once; `delivery-jobs.service.spec.ts` reproduces it.

### Tests

- **e2e:** `test/phase8-wishlist-stores-reviews.e2e-spec.ts`, 7 tests:
  - wishlist and its walls;
  - the R5 merge;
  - the review rules and ratings;
  - hiding and showing;
  - the reminder;
  - featured ranking and store pages;
  - the trust score with the Phase 5 carried item.
- **e2e, updated:** the Phase 5 settings test.
- **Unit:** `trust-rules.spec.ts`, `reviews.service.spec.ts` and `wishlist.service.spec.ts` (14), plus
  `delivery-jobs.service.spec.ts` (2) for the Phase 6 fix. The orders, cart and
  listings specs gained the new fields.
- **Frontend:**
  - `useWishlist` and the R5 merge (6);
  - the store page (3);
  - rating on the order page (2);
  - admin reviews (2);
  - the trust weights in settings;
  - the link crawl (2).

## 3. Verification evidence

- **Backend** (local Postgres 16, `campusmart_test`): tsc clean; lint 0 warnings; build OK; unit 313/313 in 47
  suites; e2e 159/159 in 14 suites; `prisma migrate diff --exit-code` clean.
- **Frontend:** lint clean; tsc clean; vitest 272/272 in 65 files; `API_ORIGIN=http://localhost:4000 pnpm run build`
  OK (new routes `/stores`, `/stores/[id]`, `/browse`, `/admin/reviews`).
- **gen:api:** regenerated; CI re-checks it with no diff.
- **GitHub CI:**
  - [Run 72](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39103222727) on `088307b` (the
    backend, the types and the settings form) was green.
  - [Run 73](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39103858137) on `f91a22a` (the
    frontend) was green.
  - [Run 74](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39104166735) on `d5730e8` was red on
    a Phase 6 test: two riders accepting one job at once, where the loser got 400 instead of 409. That was a real
    race (see "Fixed in Phase 6 code" below), fixed in `aba2e5e` with a unit test that reproduces it. The Phase 6
    suite then passed three times in a row locally.
  - [Run 75](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39104424925) on `aba2e5e` (the
    fix, the last code change) was green.
- **Browser walk** ([`evidence/phase8-wishlist-stores-reviews/`](evidence/phase8-wishlist-stores-reviews/)):
  Chromium → `next start` → NestJS → `campusmart_dev`, in West Africa Time. Output in `phase8-walk-output.txt`,
  14/14:
  - **R5.** The buyer's phone held a favourite (the cargo trousers) in the old storage key before signing in. After
    sign-in it's in the account and the key is gone.
  - **Home.** The Featured Store row lists Amaka Styles and Chidi Gadgets (`phone-home-featured-stores`).
  - **The heart.** Tapping it on the lamp saves it to the account.
  - **Rating.**
    - The buyer opens a delivered order from Chidi, rates the lamp 5 with a comment (`phone-buyer-rate-item`) and
      sees "You rated it" (`phone-buyer-order-rated`).
    - The lamp's rating count goes up by one at once.
  - **The nightly job** ran once from the built API, as its cron would; Chidi scores 100.
  - **The product page** lists the review, and the seller block shows "Trusted seller" and links to the store
    (`phone-product-reviews-and-seller`).
  - **The store page** shows the badge (score 100, so it should), items and reviews (`phone-store-page`,
    `phone-store-reviews`).
  - **Favourites** lists the lamp and the merged trousers (`phone-favourites`); `/stores` lists the stores
    (`phone-stores`).
  - **Links.** `/browse?sort=newest` lands on `/categories?sort=newest`. The walk opened every link on eight buyer
    screens (18) and none was a 404.
  - **Admin.**
    - Hid the review with a reason (`desktop-admin-reviews`). The lamp's count went back, and `REVIEW_HIDDEN` was
      audited.
    - It's under Hidden (`desktop-admin-reviews-hidden`). Shown again, it counts again.
    - The trust weights are in settings (`desktop-admin-settings-trust`).
  - **Reruns.** The walk ran three times, all on the same build:
    - the first passed 14/14, but two screenshots were poor: the store row was scrolled sideways, and the fixed "Add
      to Cart" bar covered the seller block in a full-page capture;
    - the second stopped at the admin step because the first run's review had the same words; the walk now takes
      the newest row;
    - the third passed 14/14 and is the evidence.

    The product page therefore shows three identical reviews from the three runs.
  - **Screenshots.** Product photos are placeholders because the walk replaces images. The buyer shows as "Buyer"
    because the dev account has no first name or username.

## 4. Deviations and assumptions

- **`/browse` hands over to `/categories`.** The categories screen already is the URL-driven listing grid
  (guide 3.2.5), so a second copy would drift. Links use `/browse?sort=…` as the guide says.
- **Guests' favourites follow R5, not the guide's "delete the store and its key".**
  - A guest who taps a heart gets a sign-in sheet (guide 8.1).
  - Favourites already saved on the phone move into the account at first sign-in, then the old key is removed (R5).
  - No new guest store is kept, so Zustand stays UI-only.
- **Store ranking uses paid orders by `paidAt`** in the last 30 days.
- **The completed share counts settled orders only:** paid, then delivered, collected or cancelled. An order still
  on its way counts neither way. A seller with no settled orders gets nothing for that part.
- **The trust score is clamped to 100,** since the weights can be changed.
- **Review reminders** go in the app only, not by email. Orders handed over more than 7 days ago aren't chased.
- **Reviews show `listingTitle`** as well as the guide's fields, so a store's reviews say which item.
- **`reviewerDisplayName`** is the username, else the first name, else "Buyer", like other buyer-facing names.
- **The wishlist is capped at 500,** and a merge takes up to 100 ids.

## 5. Needs from you

Nothing.
