# Phase 6: dispatch and handover

Branch: `feat/phase-6-dispatch` (off `backend`).
Status: **DONE pending manual checks** (QR scanning on an Android phone)

Built from [execution-plan.md](execution-plan.md#phase-6-dispatch-and-handover), which replaces the guide's Phase 6,
and your answers in [decisions-needed.md](decisions-needed.md). The station flow stays in the code, unused. Paystack
is never called for real: e2e mocks it with nock, and the browser walk runs the API with the Phase 5 stub.

## 1. Checklist

The plan's gate list:

- [x] Paying for an order with two dispatch stores opens one job; the rider collects from both and delivers once
      (e2e "paying for an order with two dispatch stores…", and the walk).
- [x] A rider at another campus gets 404 on a job, and on accepting it (e2e "riders see only their campus…").
- [x] Two riders accept at once: one wins. The other gets 409 `JOB_TAKEN`, then 404 on the job (e2e, two accepts
      sent together with `Promise.all`).
- [x] A seller calling rider endpoints gets 403, and a rider calling seller endpoints gets 403 (e2e). Riders also get
      403 `RIDERS_CANNOT_BUY` on the cart, checkout and orders (DX7).
- [x] A wrong `CM-` code is refused with 400 `WRONG_CODE`; the right one works in any case, with or without `CM-`
      (e2e and the walk).
- [x] 5 wrong buyer codes lock the order: 423 `HANDOVER_LOCKED`, the admins are alerted, and an admin unlocks it with
      a reason (e2e; the walk shows "4 tries left" after one wrong code).
- [x] No pickup within 3 days refunds the buyer. It's the seller's fault only if the rider reported the store not
      ready, otherwise nobody's (e2e "deadlines…": `MISSED_PICKUP_DEADLINE`, faults `SELLER` and `NONE`).
- [x] Nobody accepting within 5 hours alerts the admins, once (e2e: nothing at 4 hours, one alert after 5, none at 6).
- [x] 5 days with the rider alerts the admins, once (e2e).
- [x] A dispute 47 hours after handover blocks the payout; at 49 hours it's refused with `DISPUTE_WINDOW_CLOSED`
      (e2e).
- [x] An uncollected pickup cancels as the buyer's fault after 5 days (e2e: `NOT_COLLECTED`, fault `BUYER`).
- [ ] MANUAL: QR scanning on an Android phone. The scanner uses the browser's `BarcodeDetector`, which Chromium in
      this container doesn't have, so the walk types the codes. See section 5.

Gate items:

- [x] Backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm run build`, `pnpm test`,
      `pnpm run test:e2e` pass.
- [x] Frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build` pass.
- [x] `gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] GitHub CI is green on the branch.
- [x] Every new endpoint meets the definition of done: validated DTOs that reject unknown fields, auth in the
      service, documented responses, shared error codes, and unit and e2e tests with a forbidden path.

Carried from Phase 5: "a seller-fault refund lowers the trust score" stays with the Phase 8 gate. Phase 6 records
`fault = SELLER` on a seller's cancellation and on a missed pickup after a not-ready report (e2e).

## 2. Changes

### Schema

`20261018090000_dispatch_handover` (additive):

| Change | Why |
|---|---|
| `UserRole.DISPATCH` | DX1 |
| `FulfillmentStatus` gains `RIDER_ASSIGNED`, `WITH_RIDER`, `DELIVERED` | The dispatch path |
| `DeliveryJob` (order, campus, status `OPEN`/`ASSIGNED`/`DONE`/`CANCELLED`, rider, who assigned it, when it was accepted, when admins were alerted) | DF7, DF8, DX2, C5 |
| `SellerOrder.arrivalFrom`, `arrivalTo` | DF8b |
| `SellerOrder.pickedUpAt`, `notReadyAt`, `notReadyNote` | DX5, DF11, C11 |
| `SellerOrder.riderAlertAt`, `handoverLockedAt` | DL6b, F5 |
| `ProblemReport` (order, store, who reported it and as what, reason, details, open or closed, the admin's note) | C8, DL8 |
| `Dispute.details`, `fault`; an index on status and date | F6, P6 |
| `Invite` (user, token hash, who invited, expiry, when used) | DX1 |

`20261018100000_backfill_delivery_jobs` (data only): opens a job for any order paid before jobs existed, so riders
see it. On the dev database that was 5 orders from the Phase 5 walk. No schema change.

The collection code is now 3 digits (DF10a), made in `src/orders/order-codes.ts`.

### Backend

**Riders** (`src/riders/`, decisions DX1, DX7):

| Endpoint | Who | What |
|---|---|---|
| `GET /admin/riders` | Admin | Riders by campus or status, with pending invites and live jobs |
| `POST /admin/riders` | Admin | Invites a rider for a campus: a `DISPATCH` user with no password, a 7-day link (`EMAIL_TAKEN`, `INVALID_REFERENCE`), audited `RIDER_INVITED` |
| `POST /admin/riders/:id/resend-invite` | Admin | A new link; older ones stop working (`INVITE_ALREADY_ACCEPTED`) |
| `PATCH /admin/riders/:id` | Admin | Switches a rider off or on with a reason. Off ends their sessions and needs no live jobs (`RIDER_HAS_JOBS`). Audited |
| `GET /auth/invites/:token` | Anyone | The invite's name and campus, or 404 `INVALID_INVITE` |
| `POST /auth/accept-invite` | Anyone with the link | Sets the password, confirms the email and signs the rider in |

The invite email is the `rider-invite` template, printed to the console until `MAIL_*` is set. A new guard,
`NoRidersGuard` (via `@BuyerAccess()`), keeps riders out of the cart, orders and payments with 403
`RIDERS_CANNOT_BUY`. Seller routes already need the seller role.

**Jobs and handover** (`src/dispatch/`):

- Paying opens one job per order that has any dispatch store, inside the payment transaction (`openDeliveryJob`).
  Active riders at that campus who have set a password get `NEW_JOB`.
- Riders (`@RiderOnly()`), under `/dispatch/jobs`:

  | Endpoint | What |
  |---|---|
  | `GET /` with `scope` `OPEN`, `MINE` or `DONE` | Open jobs at their campus, their own, finished ones |
  | `GET /:id` | Areas only until the job is theirs; then store names, addresses, phones and the buyer's phone (C6). Another campus's job is 404 |
  | `POST /:id/accept` | With a window per store (`WINDOW_REQUIRED`, at most 4 hours, before the deadline). The first wins through a guarded update; others get 409 `JOB_TAKEN` |
  | `PATCH /:id/stops/:sellerOrderId/window` | Moves a window; the seller is told |
  | `POST /:id/pickups` | The store's `CM-` code: the parcel is with the rider (`WRONG_CODE`, `ALREADY_PICKED_UP`, `STOP_NOT_WAITING`) |
  | `POST /:id/stops/:sellerOrderId/not-ready` | DF11: the seller is told, and the store's deadline now counts against them (C11) |
  | `POST /:id/handovers` | The buyer's 3-digit code for one store (see below) |
  | `POST /:id/drop` | Gives the job back while carrying nothing (`PARCELS_WITH_RIDER`); admins are alerted |
  | `POST /:id/problems` | A buyer who didn't show, or another problem (DL8) |

  A job that isn't the rider's answers 409 `JOB_NOT_YOURS` on its actions.
- **Handover** (`handover.service.ts`, shared by riders and sellers): a wrong code is 400 `WRONG_CODE` with the tries
  left. The fifth locks the order (423 `HANDOVER_LOCKED`), audits it and alerts the admins (F5). The right code marks
  it delivered or collected and sets `releaseAt` 48 hours on (D11). It closes the job once no store is still on its
  way, audits `ORDER_HANDED_OVER`, and tells the buyer and seller.
- **Sellers**, under `/sellers/me/orders`:

  | Endpoint | What |
  |---|---|
  | `GET /` with `tab` | `TO_PREPARE`, `ON_THE_WAY`, `DONE`, `PROBLEMS` or `CANCELLED`, each with its own order |
  | `GET /counts` | The count for each tab |
  | `GET /:id` | The order, with the rider's name and window (DX8, DF8b). Another seller's is 404 |
  | `POST /:id/cancel` | With a reason, before the parcel leaves (`NOT_CANCELLABLE`). The buyer is refunded in full, and it's the seller's fault (F10, P6). The rider is told to skip the store |
  | `POST /:id/handover` | Pickup from the seller: the seller enters the buyer's code (DL5). A dispatch order answers `NOT_READY_FOR_HANDOVER` |

- **Admins:**

  | Endpoint | What |
  |---|---|
  | `GET /admin/deliveries` with `view` | `OPEN`, `ACTIVE`, `DONE` or `ALL`; with the campus |
  | `POST /admin/deliveries/:id/assign` | Assigns or reassigns a rider from that campus who has accepted their invite (`INVALID_RIDER`, `JOB_CLOSED`). Audited `JOB_ASSIGNED` with the previous rider and a reason (C5). The new rider sets the windows |
  | `GET /admin/locked-handovers` | Orders locked by wrong codes |
  | `POST /admin/seller-orders/:id/unlock` | With a reason (`NOT_LOCKED`); audited `HANDOVER_UNLOCKED` (F5) |

**Problems and disputes** (C8, F6–F9, DX6, DL8):

| Endpoint | Who | What |
|---|---|---|
| `POST /orders/:orderId/seller-orders/:id/problems` | Buyer | Before handover, a problem report (late, lost, other) that alerts the admins. After handover and before `releaseAt`, a dispute: F6's reasons, up to 3 photos uploaded with purpose `DISPUTE` (F7). It sets the store's order `DISPUTED` and holds the payout. Errors `CANNOT_REPORT`, `ALREADY_REPORTED`, `DISPUTE_WINDOW_CLOSED` |
| `GET /admin/disputes`, `GET /admin/disputes/:id` | Admin | Open or decided |
| `POST /admin/disputes/:id/resolve` | Admin | `REFUND` with whose fault it was (P6), or `RELEASE`, which pays the seller now (F8). A refund that fails at Paystack leaves the dispute open |
| `GET /admin/problems`, `POST /admin/problems/:id/close` | Admin | Problems reported before handover, closed with a note |
| `POST /admin/seller-orders/:id/refund` | Admin | Refunds one store's order with whose fault it was, e.g. a parcel lost with the rider (DX6). An open dispute is decided on its own page instead (`DISPUTE_OPEN`) |

**Deadlines** (`deadlines.service.ts`, hourly, off in tests, which call it directly):

- Dispatch stores not collected 3 days after payment are refunded (`MISSED_PICKUP_DEADLINE`). It's the seller's fault
  if the rider reported them not ready, otherwise nobody's (DL7b, C11).
- Pickups not collected in 5 days are cancelled as the buyer's fault, with their share of the Paystack fee kept
  (`NOT_COLLECTED`, DL7c, P6).
- Jobs nobody accepted in 5 hours alert the admins, once (DX2).
- Parcels with a rider for 5 days alert the admins, once (DL6b).

**Changed from Phase 5:**

- `PICKED_UP_STATUSES` includes `WITH_RIDER` and `DELIVERED`, and refunds also check `pickedUpAt`. The delivery fee
  comes back only if no trip happened (DF9).
- Payouts release from `DELIVERED` or `COLLECTED`.
- Refunds close the job when nothing is left on it.
- The buyer's order shows `collectionCode` only when it's due: once the rider has that store's parcel, or as soon as
  a pickup is paid (C7). It also shows the rider's name, the deadline, when the parcel was picked up, `releaseAt`
  and whether the order is locked.

### Frontend

- **Rider app** (`/dispatch`, `DISPATCH` only, a phone layout):
  - Tabs: Available, My jobs, Done.
  - A job page with the accept form (a window per store), then a card per store:
    - collect by typing or scanning the store's `CM-` code;
    - "Not ready, or the seller isn't there?";
    - the buyer's code for each store.
  - Give the job back, and report a problem.
  - `/dispatch/invite` sets the password from the link. Middleware lets it through signed out, and a rider signing
    in lands on `/dispatch`.
- **Sellers:**
  - `/sellers/orders` is rebuilt per store order, with tabs and counts. Each card says the next step, e.g. "Musa
    Bello comes Sun, 18 Oct, 00:30 to 02:30".
  - The order page shows the `CM-` code with a QR for the rider, the rider and window, and the buyer's-code entry for
    pickups. It can cancel with a reason before pickup.
  - The old "Mark as" menu is gone.
- **Buyers:** the order page shows the delivery steps per store, the rider's name, and the handover code when it's
  due, with "give it to Musa Bello when it reaches you, and not before". "Report a problem" offers the reasons that
  fit the stage, with photos after handover.
- **Admin:**
  - `/admin/riders`: invite, resend, switch off or on.
  - `/admin/deliveries`: views Waiting for a rider (flagged after 5 hours), With a rider, Done and Locked codes;
    assign or reassign a rider, refund a store's order, unlock.
  - `/admin/disputes` and `/admin/disputes/:id`: decide with refund or release, and close early problems.
  - The nav gains Deliveries, Disputes and Riders. The overview's riders step links to `/admin/riders`.
- **Shared:** `CodeQr` (the `qrcode` package) and `CodeScanner` (`BarcodeDetector` where the browser has it, typing
  everywhere). `lib/orderText.ts` shows order times in West Africa Time. The old mock order types
  (`types/index.ts`, `lib/api/orders.ts`) are deleted.

### Tests

- **e2e:** `test/phase6-dispatch.e2e-spec.ts`, 14 tests, covering:
  - riders: invite, accept, resend, switching off, no buying;
  - jobs: one job for two stores, collect both, deliver once; campus walls, role walls and windows;
  - the lock and unlock; give back and assign; pickup handover and seller cancel;
  - the 47-hour and 49-hour dispute; early problems; dispute decisions; a parcel lost with the rider;
  - every deadline.
  - New fixtures `createUnpaidOrder` and `chargeSuccess` in `test/commerce-fixtures.ts`. The Phase 4 and 4b suites
    now expect the code hidden until it's due, and 3 digits.
- **Unit:** `dispatch-rules.spec.ts`, `problems.service.spec.ts` and `riders.service.spec.ts`;
  `orders.service.spec.ts` is updated.
- **Frontend:** the rider job page and invite page, the window input, seller orders list and detail, the buyer order
  page, admin riders, deliveries and the dispute page.

## 3. Verification evidence

- **Backend** (local Postgres 16, `campusmart_test`): tsc clean; lint 0 warnings; build OK; unit 287/287 in 41 suites; e2e
  149/149 in 12 suites; `prisma migrate diff --exit-code` clean after the backfill migration.
- **Frontend:** lint clean; tsc clean; vitest 250/250 in 59 files; `API_ORIGIN=http://localhost:4000 pnpm run build`
  OK.
- **gen:api:** regenerated with the backend changes; CI re-checks it with no diff.
- **GitHub CI:** [run 62](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39073291975) on
  `9998811` (the code before the walk fixes) and
  [run 63](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39074123376) on `6690991` (the walk
  fixes, the backfill migration and this log), both green. Run 59 on `ef348d6` was red only because the API types
  were regenerated in the next commit.
- **Browser walk** ([`evidence/phase6-dispatch/`](evidence/phase6-dispatch/)): Chromium → `next start` → NestJS →
  `campusmart_dev`.
  - **Setup.** Phase 5's setup: `PAYMENTS_ENABLED=true`, a made-up key and
    [`paystack-stub.cjs`](evidence/phase5-payments/paystack-stub.cjs) preloaded; the walk plays Paystack with signed
    webhooks. Browsers run in West Africa Time.
  - **Result.** Output in `dispatch-walk-output.txt`, 20/20:
    - **Admin** (laptop) invites Musa Bello for the University of Lagos with a new email each run
      (`desktop-admin-invite-rider`, `desktop-admin-riders`). He's a `DISPATCH` user with no password yet.
    - **Rider** (phone) opens the link from the printed invite email and sets a password
      (`phone-rider-invite`). His email is confirmed and he lands on `/dispatch`.
    - **Buyer** (phone) pays for a lamp from Chidi Gadgets and trousers from Amaka Styles, both by rider, to the
      Faculty of Science. One job opens, and Musa gets `NEW_JOB` for it.
    - **Rider:**
      - Sees the job (`phone-rider-available-jobs`). Before accepting there are areas only: no store names, addresses
        or phones (`phone-rider-job-before-accepting`).
      - Accepts with a 2-hour window per store. Both stores become `RIDER_ASSIGNED` with windows, and the full details
        show (`phone-rider-job-accepted`).
    - **Seller Chidi** sees "Musa Bello comes …" on his list (`phone-seller-orders-rider-coming`) and the code with
      its QR (`phone-seller-order-code-qr`).
    - **Rider at the stores:**
      - Collects Chidi's parcel by typing the code without `CM-`, in lower case: `WITH_RIDER`.
      - Reports Amaka not ready ("Shop closed for lunch", `phone-rider-store-not-ready`). Amaka gets
        `STORE_NOT_READY`.
      - Then collects hers.
    - **Buyer** sees both 3-digit codes and "Your rider: Musa Bello" (`phone-buyer-order-codes`).
    - **Rider at the buyer:**
      - A wrong code shows "4 tries left".
      - The right codes deliver both, and the page says "All delivered. Thank you!" (`phone-rider-all-delivered`).
      - The job is `DONE`, and both `releaseAt` are 48 hours on.
    - **Buyer** reports Amaka's trousers damaged ("A seam is torn", `phone-buyer-report-problem`). Her order is
      `DISPUTED` and the payout `HELD`.
    - **Admin:**
      - Finds the dispute (`desktop-admin-disputes`) and decides Release with a note
        (`desktop-admin-dispute-decided`). The escrow is `RELEASED` and a payout row exists.
      - The Done view lists the job with Musa Bello (`desktop-admin-deliveries-done`).
    - **Pickup from the seller:**
      - The buyer pays for trousers to collect from Amaka. No job opens, and the buyer sees the code at once.
      - Amaka enters it (`phone-seller-pickup-handover`): `COLLECTED`.
  - **Reruns.** The first run stopped on the walk's own query: the notification link lives in `data`, not a column.
    The second passed 20/20 but showed three things, now fixed:
    - the accept form's time fields ran past the card on a phone;
    - toasts covered the "all delivered" screenshot (the walk now closes them);
    - the buyer's "Placed" time used the browser's zone while the delivery steps used Lagos time.

    The fourth run is the evidence. Two leftovers from earlier runs stay on the dev database: the first run's open job
    shows on the rider's Available tab, and older paid orders show on Chidi's To prepare tab.
  - **Screenshots:** product photos are placeholders because the walk replaces images. The buyer shows as "Buyer"
    because the dev account has no first name or username.

## 4. Deviations and assumptions

- **Riders can't scan in every browser.** `BarcodeDetector` exists in Chrome on Android but not in Safari on iPhone,
  so the scanner appears only where it works and typing works everywhere. The buyer's 3-digit code is typed, never
  scanned.
- **Invites last 7 days,** and a resent invite cancels the older link.
- **Switching a rider off needs no live jobs.** An admin reassigns them first, so no parcel is stranded.
- **Only riders who have set a password** get `NEW_JOB` alerts or can be assigned.
- **A rider can give a job back only while carrying nothing.** Once a parcel is with them, an admin must reassign
  it. The new rider sets fresh windows; parcels already with the old rider stay as they are (C5).
- **Arrival windows are at most 4 hours** and must start before the store's deadline.
- **Problems before handover are their own records** (`ProblemReport`), apart from disputes, because they hold no
  money. Admins close them with a note.
- **The admin refund in `/admin/deliveries`** covers DX6 and DL8: a lost or damaged parcel with the rider, or a
  no-show. The admin chooses whose fault it is. An open dispute is decided on its own page instead.
- **A seller can't hand over a dispatch order;** only the rider enters the buyer's code there.
- **Times on order screens are West Africa Time,** 24-hour, whatever the device's zone.
- **The backfill migration** gives orders paid before Phase 6 their job. Outside dev none should exist, as payments
  were never switched on anywhere else.

## 5. Needs from you

- **Riders' emails.** Invite them yourself at `/admin/riders`. The invite email prints to the API console until
  `MAIL_*` is set (S4), so for now the link has to be passed on by hand.
- **An Android phone,** for the MANUAL check: open a seller's order page on one device, then scan its QR from the
  rider's job page in Chrome on Android. Typing the code is the fallback everywhere and is already verified.
- **Cloudinary** (S5, already in the [setup checklist](setup-checklist.md)) for dispute photos. Until then, a dispute
  can be sent without photos.
