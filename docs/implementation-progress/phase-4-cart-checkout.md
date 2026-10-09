# Phase 4: cart and checkout

Branch: `feat/phase-4-cart-checkout` (off `backend`).
Status: **DONE** (every item verified; no manual items)

## 1. Checklist

From the guide, verbatim:

- [x] Two browsers checking out the last unit at the same time: one succeeds, one gets `OUT_OF_STOCK`.
- [x] Changing a price in the database after items are in a cart doesn't change the snapshot on an order already placed.
- [x] Resubmitting checkout with the same `idempotencyKey` returns the same order.
- [x] An unpaid order expires after 30 minutes and its stock returns.
- [x] A cart with items from 2 sellers produces 2 seller orders with different codes.

Gate items:

- [x] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [x] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [x] `npm run gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] Every new endpoint meets the definition of done.

## 2. Changes

### Setup
- **Schema** (your decision, 2026-10-09): `CartItem.unitPriceKobo Int?`, the price when the line was last set, so the
  cart can say a price changed (`20261009210000_cart_item_price`, additive, one nullable column). Checkout still
  charges the price in the database.
- `@nestjs/schedule` 6.1.3 (the Nest 11 line) for the expiry job (D17); `ScheduleModule.forRoot()` in `AppModule`.
- `requireActiveInstitution()` (`src/institutions/institution-access.ts`): cart, stations and checkout need a
  school that is switched on (403 `NO_INSTITUTION` / `INSTITUTION_INACTIVE`). This is the Phase 9 hand-off: an
  access token outlives a switch-off by up to 15 minutes.

### 4.1 Backend: `cart` module (verified email; your school)
- `GET /cart` → `{ groups: [{ seller: { id, storeName }, items, subtotalKobo }], subtotalKobo, itemCount, issues }`.
  Each item: `listing` (card), `variant`, `quantity`, `unitPriceKobo` (current), `available`, `maxQuantity`.
- `PUT /cart/items { listingId, variantId?, quantity }` (absolute; 0 removes) → the cart. Refuses: not live or at
  another school 404; options but no `variantId` 400 `VARIANT_REQUIRED`; your own listing 400 `OWN_LISTING`; over
  stock 409 `OUT_OF_STOCK` with `details.available`; a 51st line 409 `CART_FULL`. Setting a quantity records
  today's price.
- `DELETE /cart/items/:id` → 204 (someone else's line is 404).
- `POST /cart/merge { items }` → the cart. The larger quantity wins, capped at stock; lines that can't be bought
  are skipped, as are lines past 50.
- `cart-rules.ts`: `lineState()` (price, stock and problem for a line; shared with checkout) and `lineIssue()`
  (`UNAVAILABLE`, `OUT_OF_STOCK`, `LOW_STOCK` "Only 2 left", `PRICE_CHANGED` "Price went up from ₦4,500 to ₦5,000").
  Subtotals count lines that can be bought.

### 4.2 Backend: stations, checkout and orders (`orders` module)
- `GET /pickup-stations`: active stations at your school, by name.
- `POST /orders/checkout { pickupStationId, paymentMethod, idempotencyKey }` → `{ orderId, totalKobo,
  authorizationUrl, reference }`, in one transaction (`checkout.service.ts`):
  1. The same key returns the same order (also when two requests race: the loser returns the winner's order).
     Another buyer's key is 409 `IDEMPOTENCY_KEY_REUSED`.
  2. A station at your school, a cart that isn't empty (400 `CART_EMPTY`), and every line passing 4.1 (409
     `OUT_OF_STOCK` / `ITEM_UNAVAILABLE`, with the item in `details`).
  3. Conditional decrements (`order-stock.ts` `reserveStock`): `updateMany` with `stock >= qty` on the option or the
     listing, in a fixed row order so two checkouts can't deadlock; `count !== 1` is 409 `OUT_OF_STOCK`.
  4. `recalculateListingStock` for each touched listing (SOLDOUT at 0).
  5. One `SellerOrder` per seller: `CM-` + 6 characters without 0/O/1/I, a 6-digit collection code from
     `crypto.randomInt`, `platformFeeKobo = floor(subtotal × PLATFORM_FEE_BPS / 10000)`, the payout, and
     `OrderItem`s with title, option label, image and unit price snapshotted. A code clash retries (up to 3 times).
  6. `Order` `PENDING_PAYMENT`, `expiresAt = now + ORDER_PAYMENT_TTL_MINUTES`.
  7. The cart is emptied.
  8. `authorizationUrl` and `reference` are `null` while `PAYMENTS_ENABLED=false` (Phase 5).
- `GET /orders` (cursor, newest first), `GET /orders/:id` (with collection codes; never fees or payouts),
  `POST /orders/:id/cancel` (unpaid only; 409 `ORDER_NOT_CANCELLABLE` otherwise). Someone else's order is 404.
- Expiry job (`order-expiry.service.ts`, `@Cron('*/5 * * * *')`): unpaid orders past `expiresAt` become `EXPIRED`,
  their seller orders `CANCELLED` (`PAYMENT_EXPIRED`), their stock returns. Cancel and expiry share
  `closeUnpaidOrder()` (`order-lifecycle.ts`): a conditional status flip, so only one wins, and an order whose
  payment is `COMPLETED` is never closed.

### 4.3 Frontend
- **Cart** (`lib/api/hooks/useCart.ts`): `useCart()` reads `GET /cart` when signed in (verified), else the guest
  store; one line shape for both. `useCartActions()` adds, sets and removes lines in whichever is in use.
  `useCartStore` is the guest cart only (its mock `checkout` is gone; lines also keep the store). After a verified
  sign-in, `AuthProvider` merges the guest cart once (`useGuestCartMerge`), then clears it.
- **Cart page**: grouped by store with a subtotal each; issues inline ("Only 1 left · Change to 1", "Price went up
  … · OK", "Sold out", "No longer available · Remove"); the stepper stops at `maxQuantity`; checkout is blocked,
  with a hint, while an item can't be bought. Loading, empty and error states.
- **Pickup stations**: from `GET /pickup-stations`, hours formatted from the JSON (`summarizeOpeningHours`);
  `usePickupStore` keeps only the chosen id.
- **Checkout**: payment options are `PaymentMethod` values (Card, Bank transfer, OPay, PalmPay); no coupon field;
  the idempotency key is made once per visit; "Proceed to Pay" calls checkout and goes to Paystack when there's a
  URL. `OUT_OF_STOCK` / `ITEM_UNAVAILABLE` refetch the cart and name the item ("Desk lamp: sold out", "Review
  cart").
- **Order confirmation**: polls `GET /orders/:id` every 3 s for up to 60 s until `PAID`, then shows each seller
  order's code, the station and "You'll be told when it's ready". Without a payment page it says so plainly.
- **Orders**: `/orders` (list) and `/orders/[id]` (per-store timeline, the collection code in large type once
  `DROPPED_OFF`, cancel while unpaid, station hours and phone). Profile menu: My Orders → `/orders`.
- Tests (Vitest): `useCart`, `useGuestCartMerge`, `addCartNav`, cart, checkout, pickup station, order
  confirmation, orders list and order detail pages.

## 3. Verification evidence

Local Postgres 16; e2e on `campusmart_test`; browser walk on `campusmart_dev`.

| Item | Evidence |
|---|---|
| Last unit, two buyers at once | e2e `test/phase4-checkout.e2e-spec.ts` › checklist › "two buyers checking out the last unit at the same time: one succeeds, one gets OUT_OF_STOCK": both checkouts fired together (`Promise.all`), 5 rounds, each `[201, 409]`, the loser's `details.listingId` names the item, stock 0 and `SOLDOUT`, one order item. Also "the last unit of an option goes to one buyer only" (variant stock 0, the listing stays `ACTIVE` with the other size). |
| Price snapshot | e2e › "changing a price after items are in a cart doesn't change the snapshot on an order already placed": the price moved while in the cart (checkout charged the database price, 940,000), then price and title changed again; `GET /orders/:id` still shows "Desk lamp" at 470,000 × 2. |
| Idempotency | e2e › "resubmitting checkout with the same idempotencyKey returns the same order": same key twice → identical response; two requests with one key at the same moment → both 201, same `orderId`; 2 orders in total and stock reserved once; another buyer's key → 409 `IDEMPOTENCY_KEY_REUSED`. Unit `checkout.service.spec.ts` (replay without a transaction, racing winner returned, code clash retried). |
| Expiry after 30 minutes | e2e › "an unpaid order expires after 30 minutes and its stock returns": `expiresAt − createdAt` = 30 min; `expireDue(+29 min)` → 0; `expireDue(+31 min)` → 1, order `EXPIRED`, both seller orders `CANCELLED` / `PAYMENT_EXPIRED`, the lamp and the size option back in stock and `ACTIVE`; a second run changes nothing. Also "a completed payment wins: the order is neither expired nor cancellable". Unit `order-expiry.service.spec.ts` (batches, timer off under test, never throws). |
| Two sellers, two codes | e2e › "a cart with items from 2 sellers produces 2 seller orders with different codes": codes match `^CM-[2-9A-HJ-NP-Z]{6}$` and differ, collection codes are 6 digits, subtotals per store, option prices per line, fee 0 and payout = subtotal stored but absent from the buyer's JSON, cart emptied, `authorizationUrl: null`. Unit `order-codes.spec.ts` (alphabet, leading zeros, fee rounding). |
| Cart rules | e2e `test/phase4-cart.e2e-spec.ts` (7): grouping and subtotals; 404 for other school / draft / sold out / unknown; `VARIANT_REQUIRED`; `OUT_OF_STOCK` with `details.available`; `OWN_LISTING`; a client-sent price → 400; `CART_FULL` at 50 lines; price-change, low-stock and gone issues; delete only your own line; merge (larger wins, capped, bad lines skipped); 401 / `EMAIL_NOT_VERIFIED` / `NO_INSTITUTION` / `INSTITUTION_INACTIVE`. Unit `cart-rules.spec.ts`, `cart.service.spec.ts`. |
| Definition of done | DTOs reject unknown fields (e2e: `totalKobo` in checkout → 400, `priceKobo` in a cart line → 400, unknown payment method → 400). Ownership in the service: someone else's order and cancel → 404, the seller can't read the buyer's order. Response DTOs in `lib/api/schema.d.ts`. Codes: `VALIDATION_FAILED`, `NOT_FOUND`, `VARIANT_REQUIRED`, `OWN_LISTING`, `OUT_OF_STOCK`, `CART_FULL`, `CART_EMPTY`, `ITEM_UNAVAILABLE`, `IDEMPOTENCY_KEY_REUSED`, `ORDER_NOT_CANCELLABLE`, `NO_INSTITUTION`, `INSTITUTION_INACTIVE`. Unit tests for each service; e2e happy and forbidden paths for all 9 endpoints (20 tests). Frontend loading, empty and error states on every new screen (Vitest). |
| Browser | `evidence/phase4-cart-checkout/cart-walk.mjs` → `cart-walk-output.txt`: **15/15 PASS** on a phone: the guest cart merged after sign-in; Add to Cart into the server cart; two stores with subtotals; the seller raises the price (real API) → "Price went up from ₦4,500 to ₦4,800", OK accepts it; the seller has 1 left → checkout blocked, "Change to 1" fixes it; stations from the API with hours; no coupon field; the last lamp sells while the buyer is on checkout → "Desk lamp: sold out" with "Review cart"; checkout reserves stock (lamp `SOLDOUT`); two `CM-` codes; cancel puts the stock back; My Orders lists it; the profile links `/orders`. Screenshots: `phone-cart-two-stores.png`, `phone-cart-price-changed.png`, `phone-cart-low-stock.png`, `phone-pickup-stations.png`, `phone-checkout.png`, `phone-checkout-out-of-stock.png`, `phone-order-confirmation.png`, `phone-order-detail.png`, `phone-order-cancelled.png`, `phone-orders-list.png`. Photos (including the card and wallet logos) are the app's sample images, served for every image request in the walk. |
| Backend gate | `npx tsc --noEmit` exit 0; `npm run lint -- --max-warnings 0` exit 0; `npm run build` exit 0; `npm test` → 34 suites, 245 tests passed; `npm run test:e2e` (DATABASE_URL and DIRECT_URL → `campusmart_test`) → 9 suites, 109 tests passed. |
| Frontend gate | `npm run lint` exit 0 (0 errors, 1 pre-existing warning in `app/profile/page.tsx`); `npx tsc --noEmit` exit 0; `npx vitest run` → 40 files, 180 tests passed; `API_ORIGIN=http://localhost:4000 npm run build` exit 0 (`/cart`, `/checkout`, `/pickup-station`, `/order-confirmation`, `/orders`, `/orders/[id]`). |
| `gen:api` / migrate diff | CI path and the live API both match the committed `lib/api/schema.d.ts` (`diff -q`). `prisma migrate diff --from-migrations … --exit-code` → exit 0 after `20261009210000_cart_item_price`, applied to `campusmart_dev` and `campusmart_test` with `migrate deploy`. |

## 4. Deviations and assumptions

1. **Price on cart lines** (your decision): stored when a line is added, its quantity changes, or it is merged. A
   line saved without one never warns. The buyer clears the warning by tapping OK (it sets the same quantity).
2. **Writes return the cart.** `PUT /cart/items` and `POST /cart/merge` answer with the whole cart (the guide
   doesn't say), so the page updates in one round trip. Quantities are 1–100 per line (0 removes).
3. **Who can shop**: any account with a verified email at a school that is switched on, sellers included (D8).
4. **Error codes the guide doesn't name**: `CART_FULL` (409, 50 lines), `CART_EMPTY` (400), `ITEM_UNAVAILABLE`
   (409, a line that went away before checkout; the guide names only `OUT_OF_STOCK`), `IDEMPOTENCY_KEY_REUSED` (409),
   `ORDER_NOT_CANCELLABLE` (409). A station at another school or switched off is 404.
5. **A sold-out listing**: `PUT /cart/items` answers 404 (the guide: "isn't ACTIVE"), matching what buyers can see;
   a line already in the cart shows "Sold out".
6. **Checkout totals**: `totalKobo = subtotalKobo` (no buyer fees). The platform fee comes out of the seller's
   payout and defaults to 0 (see section 5). Seller orders stay `PENDING` until paid; Phase 5 moves them to
   `AWAITING_DROPOFF`.
7. **Payments off**: with `PAYMENTS_ENABLED=false` the order is placed and held for 30 minutes, then expires.
   Checkout sends the buyer to the confirmation page with `payment=unavailable`, which says online payment isn't
   switched on yet instead of polling. Phase 5 replaces this with the Paystack redirect.
8. **Collection codes**: `GET /orders/:id` always includes them for the buyer; the page shows the code only once the
   seller order is `DROPPED_OFF` (guide 4.3.6). Phase 6's seller and agent endpoints must never return it.
9. **Expiry job**: batches of 100; does nothing on its timer when `NODE_ENV=test` (the suites call `expireDue()`).
   An option the seller deleted after the order can't take its units back.
10. **Frontend wording and layout**:
    - The checkout page is titled "Checkout" (it said "Order confirmation").
    - Items on checkout are read-only, with "Edit cart"; the steppers live in the cart.
    - The coupon field is gone (no backend).
    - "Items can only be returned within 24 hours of picking up" became "You have 48 hours after collecting to report
      a problem" (D11's dispute window).
    - "See all" links open `/categories?sort=newest` until `/browse` exists (Phase 8).
    - The profile menu's Wishlist link pointed at `/cart`; it now opens `/favourites`.
11. **Guest cart**: browsing needs a signed-in, verified account (guide 3.1) and `/cart` is behind sign-in, so a
    guest cart only builds up after a session lapses. The merge is built as the guide says; guest lines now also
    remember the store, so they group the same way.
12. **Old mocks removed**: `useCartStore.checkout`, `ordersApi.createOrder` and the hard-coded stations. The seller's
    order mocks (`ordersApi.fetchOrders`, `updateOrderStatus`) stay until Phase 6.
13. **Local dev data**: the walks placed and cancelled two orders for `tobi.buyer@students.unilag.edu.ng` and left
    the lamp's price and stock as they were. Local only.

## 5. Needs from you

- **Platform fee** (`PLATFORM_FEE_BPS`, default 0): a business decision before going live (guide Phase 5). Nothing
  blocks on it now.
- **OPay and PalmPay**: checkout offers Card, Bank transfer, OPay and PalmPay. Before Phase 5, confirm which
  channels your Paystack account will have; I'll hide the ones it won't.
