# Phase 4b: checkout with delivery

Branch: `feat/phase-4b-delivery-checkout` (off `backend`).
Status: **DONE** (every item verified; no manual items)

Built from [execution-plan.md](execution-plan.md) and your answers in [decisions-needed.md](decisions-needed.md).
Delivery replaces pickup stations (F2): each store goes by a CampusMart rider or, where the seller allows it, the
buyer picks up from the seller.

## 1. Checklist

From the plan's Phase 4b gate:

- [x] A cart with a dispatch store and a pickup store makes two seller orders with the right methods. The total is
      items plus one delivery fee; two dispatch stores still pay one fee.
- [x] Pickup from a seller who doesn't allow it is refused (409 `PICKUP_NOT_OFFERED`).
- [x] A place at another school is refused (404), and so is a place switched off.
- [x] Dispatch without a phone is refused (400 `PHONE_REQUIRED`; a malformed number is `VALIDATION_FAILED`).
- [x] A seller without an address and phone can't publish (403 `SELLER_PROFILE_INCOMPLETE`); a draft still saves.
- [x] No API response shows a seller's full address before payment (cart, listing and order checked).
- [x] The Phase 4 checks still hold: stock reservation, idempotency, expiry (the Phase 4 suite runs on the new body).
- [x] Browser walk: checkout with both methods, a seller fills in the delivery card, an admin adds a campus place
      and sets the fee.

Gate items:

- [x] Backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm run build`, `pnpm test`,
      `pnpm run test:e2e` pass.
- [x] Frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build` pass.
- [x] `gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] GitHub CI is green on the branch.
- [x] Every new endpoint meets the definition of done (validated DTOs that reject unknown fields, auth in the
      service, documented responses, shared error codes, unit and e2e tests with a forbidden path).

## 2. Changes

### Schema (`20261017120000_delivery_checkout`, additive)

| Change | Decision |
|---|---|
| `CampusPlace` (institution, name, active) | DF3 |
| `Institution.deliveryFeeKobo` (nullable; null = no on-campus dispatch) | DF1, C10 |
| `SellerProfile.pickupArea`, `pickupAddress`, `contactPhone`, `allowsPickup` | SA1, SA4, DL1 |
| `Order.pickupStationId` optional; `Order.campusPlaceId`, `deliveryAddress`, `buyerPhone`, `deliveryFeeKobo` | DL9, DF6, DF4a, PH2, DF2 |
| `SellerOrder.deliveryMethod` (`DISPATCH`, `SELLER_PICKUP`; empty on station-era orders) | DM1 |

### Backend

- **Sellers.** `PATCH /sellers/me` takes the area, address, phone and "allow pickup". Pickup needs the details first:
  400 `PICKUP_DETAILS_REQUIRED`. `GET /sellers/me` adds `deliveryDetailsComplete`.
- **Publishing.** `assertCanPublish` checks verification first (`SELLER_NOT_VERIFIED`), then the delivery details
  (`SELLER_PROFILE_INCOMPLETE`). Drafts are still allowed. Listings that are already live stay live.
- **Admin.**
  - `/admin/campus-places`: list, add, rename, and switch on or off with a reason. All audited (`PLACE_CREATED`,
    `PLACE_UPDATED`, `PLACE_DEACTIVATED`, `PLACE_REACTIVATED`).
  - `PATCH /admin/institutions/:id` takes `deliveryFeeKobo` (0 to ₦100,000, or null), audited as
    `INSTITUTION_UPDATED`. Institution rows gain `deliveryFeeKobo` and `placeCount`.
  - Everything is admin-only by class guard.
- **Buyers.**
  - `GET /campus-places` returns the active places at your school.
  - `GET /cart` adds each store's `pickupArea`, set only when the seller offers pickup (the area, never the
    address), and the school's `campusDeliveryFeeKobo`.
- **Checkout.** `POST /orders/checkout` takes `stores: [{ sellerId, method }]` instead of `pickupStationId`. With
  anything by dispatch it also needs `destination` (`campusPlaceId` or `address`, exactly one) and `phone`:
  - The phone is saved to the buyer's profile (PH2).
  - The order pays one fee: the campus fee for a place, 0 off campus (DF2, DF4).
  - All checks run inside the transaction, before any stock is reserved.
  - New codes: `DELIVERY_CHOICE_REQUIRED`, `PICKUP_NOT_OFFERED`, `DESTINATION_REQUIRED`, `PHONE_REQUIRED`,
    `DELIVERY_UNAVAILABLE`.
- **Orders.** Order responses gain:
  - `destination`, `deliveryFeeKobo` and `buyerPhone`;
  - `deliveryMethod` on each seller order;
  - on pickup orders, `pickupFrom { area, address, phone }`, where the address and phone stay null until the order
    is paid (SA3);
  - `pickupStation`, now nullable.
- **Account.** The signed-in user's own account (`/auth/me`) now includes `phone`, so checkout can fill it in.
- **Seed.** Two placeholder campus places, and no fee (an admin sets it).
- **Kept for later (DL9).** `GET /pickup-stations` and the admin stations API are unchanged.

### Frontend

- **Checkout** (`app/checkout`):
  - A "Delivery" section with one choice per store: rider, or pickup from the seller at their area (free).
  - "Where should the rider bring it?": on campus (place picker), or off campus (address, with the fee agreed with
    the rider).
  - The rider's phone, filled from the profile.
  - The summary adds one delivery line, and the total includes the fee.
  - On campus is offered only once the school has a fee and at least one place.
  - The pickup-station page is no longer linked.
- **Orders:**
  - The order page shows the destination, the fee, the number the rider calls, and each store's method. For pickup
    it shows the seller's area, then their address and phone once paid.
  - The list and the confirmation page say "Delivery to …".
- **Sellers:**
  - A "Delivery and pickup" card on the store profile (area, address, phone, allow-pickup switch).
  - The product screens explain that publishing waits for these details and link to the card.
  - The verified badge now reads verification alone (`useIsVerified`).
- **Admin:**
  - `/admin/places` (Campus places).
  - `/admin/settings`, starting with delivery fees by campus.
  - The overview's go-live steps now read: institution, then places and a fee, then riders (Phase 6).
  - Pickup stations stay in the menu (DL9).

### Tests

- **Backend unit:** 264 (36 suites). New: `delivery-choice.spec.ts` and `admin-campus-places.service.spec.ts`;
  more cases in the checkout, orders, cart, sellers, listings, verification and institutions specs.
- **Backend e2e:** 118 (10 suites). New: `phase4b-delivery.e2e-spec.ts` (9 tests). The Phase 2, 3 and 4 suites were
  updated for the new rules.
- **Frontend:** 202 (46 files). New: checkout page (rewritten, 8 tests), the order page's delivery case,
  `DeliveryCard`, `VerificationNotice`, `PlaceForm`, `DeliveryFeeDialog`, `delivery.test.ts`, and phone and address
  validation.

## 3. Verification evidence

- **Backend** (local Postgres 16, `campusmart_test`): tsc clean; lint 0 warnings; build OK; unit 264/264;
  e2e 118/118; `prisma migrate diff --exit-code` clean against `migrations/`.
- **Frontend:** lint clean; tsc clean; vitest 202/202; `API_ORIGIN=http://localhost:4000 pnpm run build` OK (new
  routes `/admin/places` and `/admin/settings`).
- **gen:api:** `openapi:export` plus `openapi-typescript`, committed with the backend change; CI re-checks it with no
  diff.
- **GitHub CI:** [run 49](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39052069261) on
  `9d5937b`, both jobs green.
- **Browser walk** ([`evidence/phase4b-delivery-checkout/`](evidence/phase4b-delivery-checkout/)): Chromium →
  `next start` → NestJS → `campusmart_dev`, payments still off. Output in `delivery-walk-output.txt`, 14/14:
  - **Admin** (laptop): the overview's go-live steps, adding "Faculty of Science", and setting UNILAG's fee to ₦500
    (`desktop-campus-places`, `desktop-settings-delivery-fees`).
  - **Seller** (phone): the publish notice before details (`phone-seller-publish-needs-delivery`), the delivery
    sheet (`phone-seller-delivery-sheet`) and the saved card (`phone-seller-delivery-card`).
  - **Buyer** (phone):
    - Checkout with both stores by rider: items ₦18,500 plus one ₦500 fee, ₦19,000
      (`phone-checkout-delivery`).
    - Amaka switched to pickup at Moremi Hall (`phone-checkout-pickup-and-rider`).
    - The order page showing the area only before payment (`phone-order-delivery`).
    - Off campus with "Agreed with the rider" (`phone-checkout-off-campus`).
    - The phone saved to the account was checked through `/api/auth/me`.
  - **A note on reruns:** the walk was run three times. The publish-notice screenshot comes from the first run,
    before the seller had details. Later runs log that the seller already had them and check the notice is gone
    after saving.

## 4. Deviations and assumptions

- **Two delivery methods, not three.** The plan listed `DISPATCH_CAMPUS`, `DISPATCH_OFF_CAMPUS` and `SELLER_PICKUP`.
  DF6 then put the destination on the order, so a seller order is `DISPATCH` or `SELLER_PICKUP`, and campus or off
  campus is the order's destination.
- **No sort order on campus places.** They are listed by name.
- **No room or landmark field** (DF3). The buyer's phone is how the rider finds them.
- **The fee is fixed per order.** It is stored on the order when placed, so changing a campus fee affects new orders
  only.
- **Pickup details are read live.** For pickup orders, the seller's address and phone come from their profile when
  the order is viewed, not from a copy taken at checkout. A seller who moves shows the new address. The rider's copy
  of the buyer's phone is kept on the order.
- **The phone on the account.** `UserDto` gains `phone`, the person's own number, so checkout can fill it in. It is
  never shown to other users.
- **Existing sellers have to add their details before publishing again.** Their live listings stay live; only
  publishing is gated.
- **Turning pickup off with an unpaid pickup order open.** If a seller turns pickup off while a buyer's unpaid order
  still says pickup, the order keeps its method. Phase 6 decides what happens next (it owns the handover).
- **Left for later phases, as planned:**
  - Seller order screens: the old placeholder UI stays until Phase 6.
  - The delivery timeline on the order page: Phase 6.
  - The 3-digit handover code (DF10a): Phase 6. Today's code is still 6 digits.
  - OPay and PalmPay at checkout: they still show. The `PAYSTACK_WALLET_CHANNELS` switch (P5) is Phase 5.
  - The platform settings table: Phase 5. `/admin/settings` reads the fee from the institution for now.
  - The Terms text still mentions pickup stations: Phase 10 (T5) drafts new Terms.
- **Kept but unused (DL9):** the pickup-station page, `usePickupStore`, `GET /pickup-stations`, and the admin
  Stations screen.

## 5. Needs from you

- **UNILAG's real campus places and on-campus delivery fee.** Enter them in `/admin/places` and `/admin/settings`.
  The dev database now has the seed's two placeholders plus "Faculty of Science" from the walk, and a ₦500 fee.
- Nothing else blocks Phase 5.
