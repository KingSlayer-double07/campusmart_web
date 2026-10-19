# Phase 5: payments, escrow and refunds

Branch: `feat/phase-5-payments` (off `backend`).
Status: **DONE pending manual checks** (a real Paystack test payment, once staging exists: W2, S1)

Built from the guide's 5.1–5.7 as changed by [execution-plan.md](execution-plan.md#phase-5-payments-escrow-refunds)
and your answers in [decisions-needed.md](decisions-needed.md). Paystack is never called for real: the tests mock it
with nock, and the browser walk runs the API with a local stub.

## 1. Checklist

The guide's Phase 5 list:

- [x] A webhook with a bad signature returns 401 and changes nothing.
- [x] Replaying the same `charge.success` twice leaves one payment and one state change.
- [x] A payment for less than `totalKobo` doesn't mark the order paid (the payment is marked `FAILED`, audited as
      `PAYMENT_MISMATCH`, and the admins are alerted).
- [x] Visiting the callback URL without paying doesn't mark the order paid. Verify asks Paystack, and only a
      successful charge for the right amount counts.
- [x] Collection plus 48 hours creates a payout and a Paystack test transfer (nock in e2e; the walk uses the stub).
- [x] Refunding one seller order in a two-seller order leaves the other `HELD`.

The plan's additions:

- [x] A buyer-fault refund takes off the right share of the Paystack fee: 1,200,000 of a 1,650,000 subtotal carries
      24,000 of a 33,000 fee (e2e).
- [x] The delivery fee is refunded only when no trip happened: with the last refund of the order, and only if
      nothing was picked up (DF9, DF9a; e2e).
- [x] A payout account change holds payouts for 24 hours (e2e and the walk).
- [ ] A seller-fault refund lowers the trust score. **Carried to Phase 8 by design.** Phase 5 records
      `SellerOrder.fault = SELLER` on the refund (e2e checks it). The score itself is computed nightly in Phase 8,
      which takes 10 points per seller-fault refund in 90 days (F10, P6). The Phase 8 gate checks this item.
- [ ] MANUAL, at staging: a real Paystack test-mode payment from start to finish, webhook included (W2, S1). This
      container has no public address, so Paystack can't reach its webhook.

Gate items:

- [x] Backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm run build`, `pnpm test`,
      `pnpm run test:e2e` pass.
- [x] Frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build` pass.
- [x] `gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] GitHub CI is green on the branch.
- [x] Every new endpoint meets the definition of done: validated DTOs that reject unknown fields, auth in the
      service, documented responses, shared error codes, and unit and e2e tests with a forbidden path. The webhook
      is the exception by nature: it takes Paystack's body and is guarded by the signature instead.

## 2. Changes

### Schema

`20261017180000_payments_escrow` (additive):

| Change | Why |
|---|---|
| `Order.payments` is a list: `Payment.orderId` is no longer unique; `Payment.attempt`, `feesKobo`, `failureReason` | P7 (try again with a new reference), P6 (fee for refunds) |
| `Refund` (payment, seller order, amounts split into items, delivery fee and the Paystack fee kept back, fault, reason, status, Paystack id, actor) | 5.6, P6, DF9 |
| `PlatformSetting` (key, JSON value, who changed it) | R1a |
| `Payout.attempt`, `transferCode`, `paidAt` | 5.5, retries |
| `SellerProfile.payoutBankCode`, `payoutAccountChangedAt` | 5.4, P9 |
| `SellerOrder.pickupDeadline`, `fault`; `FulfillmentStatus` gains `AWAITING_RIDER` and `AWAITING_PICKUP`; enums `Fault`, `RefundStatus` | DL7b, DL7c, P6 |

`20261017181500_payment_authorization_url`: `Payment.authorizationUrl`, so a resent checkout and "Pay now" can return
the same Paystack page.

### Backend

- **Paystack client** (`src/paystack`): initialize, verify, banks, resolve, recipients, transfers and refunds.
  - Errors come back as `PAYMENT_PROVIDER_ERROR` (502), with Paystack's own message when it gave one.
  - While payments are off: `PAYMENTS_NOT_CONFIGURED` (503).
  - Webhook signatures are HMAC-SHA512 over the raw body, compared with `timingSafeEqual`.
- **Checkout** (`POST /orders/checkout`) now returns `paymentsEnabled`, plus Paystack's `authorizationUrl` and
  `reference` when payments are on.
  - The fee comes from the platform settings.
  - OPay and PalmPay are refused (400 `PAYMENT_METHOD_UNAVAILABLE`) unless `PAYSTACK_WALLET_CHANNELS=true` (P5).
  - If Paystack fails, the order still stands and the buyer can pay from the order page.
- **Payments:**
  - `GET /payments/config` (public): whether payments are on, and which methods checkout offers.
  - `POST /orders/:id/pay`: a new attempt with reference `CM_<order>_<n>` (P7); 409 `ORDER_NOT_PAYABLE` once the
    order isn't waiting.
  - `GET /payments/verify/:reference`: the buyer's own payments only (404 otherwise). It runs the webhook's handler.
  - `POST /payments/webhook`: `@SkipThrottle`, the signature, and Paystack's IP allowlist in production
    (`PAYSTACK_WEBHOOK_IPS`).
    - `charge.success` is idempotent. It checks amount, currency and status. It marks the order `PAID` and each
      seller order's escrow `HELD`. Then it moves each seller order on by method:
      - dispatch: `AWAITING_RIDER`, with a deadline in the platform's pickup days, 3 by default (DL7b);
      - pickup: `AWAITING_PICKUP`, with the buyer's 5 days (DL7c);
      - station-era orders: drop-off.
    - A second payment for a paid order is refunded in full (`PAID_TWICE`), and admins are told.
    - A payment after expiry takes the stock back if it's still there; otherwise it's refunded in full
      (`PAID_AFTER_STOCK_GONE`).
    - Sellers get `NEW_ORDER` (text by method) and the buyer `ORDER_PAID`.
    - It also handles `transfer.success`, `transfer.failed` and `transfer.reversed`, and `refund.processed` and
      `refund.failed`.
- **Escrow release** (`PayoutsService`, every 15 minutes):
  - It finds seller orders that are collected, still held, past `releaseAt`, and have no open dispute.
  - In one transaction it marks each `RELEASED` and creates a `Payout`: `PENDING`, or `AWAITING_ACCOUNT` when there's
    no recipient.
  - Outside the transaction, one transfer per seller order (P4) of `sellerPayoutKobo`. The transfer is claimed first,
    so two runs can't send it twice. The platform absorbs the transfer fee (P3); delivery fees stay with the platform
    (DX3).
  - A failed transfer is marked `FAILED` with the reason, and every admin is alerted (P10).
  - Audited: `ESCROW_RELEASED`, `PAYOUT_SENT`, `PAYOUT_PAID`, `PAYOUT_FAILED`, `PAYOUT_RETRIED`.
- **Refunds** (`RefundsService.refundSellerOrder(id, { reason, fault, actorId })`), ready for Phase 6's
  cancellations, missed deadlines and disputes:
  - Only a paid order whose money is still held (409 `NOT_REFUNDABLE`), claimed once.
  - Stock goes back on sale. Escrow becomes `REFUNDED`, the seller order `CANCELLED`, and the fault is recorded.
  - Amount: the items, less the buyer's share of the Paystack fee when it's the buyer's fault (P6). The delivery fee
    is added only for the last refund of an order where nothing was picked up (DF9, DF9a).
  - If Paystack refuses, the refund is kept as `FAILED` and admins are told.
  - Buyer and seller are notified. Audited as `REFUND_CREATED`, `REFUND_PROCESSED` and `REFUND_FAILED`.
- **Payout account** (SELLER):
  - `GET /payouts/banks`, cached for 24 hours.
  - `GET` and `POST /sellers/me/payout-account`. The bank must be on Paystack's list. Paystack resolves the name,
    then a recipient is created. Only the bank, the last 4 digits, the name and the recipient code are kept, never the
    full number. The change is audited (`PAYOUT_ACCOUNT_SET`, with the old and new last 4).
  - Waiting payouts are queued. Payouts pause for 24 hours (P9) and the seller is told in the app and by email.
  - `GET /sellers/me/payouts`.
- **Admin:**
  - `GET /admin/payouts?status=` and `POST /admin/payouts/:id/retry`: failed payouts only (409
    `PAYOUT_NOT_RETRYABLE`), with a new reference `PO_<sellerOrder>_<n>`.
  - `GET` and `PATCH /admin/settings`: the platform fee (0 to 50%, P1) and the seller hand-over days (1 to 14,
    DL7b). Both are audited as `SETTING_CHANGED` with the old and new value. New orders use the current fee.
- **Notifications** (`NotificationsService`): every message is a `Notification` row (D19) and an email (printed to
  the console until `MAIL_*` exists). `alertAdmins` reaches every active admin (P10). The bell is Phase 10.
- **Configuration:** `rawBody: true` on the app, and in the test app. New variables: `PAYSTACK_WALLET_CHANNELS`,
  `PAYSTACK_WEBHOOK_IPS`, `BUYER_COLLECT_DAYS` (see the [setup checklist](setup-checklist.md#variables-at-a-glance)).
- **Order lists** sort a buyer's seller orders by creation, then id. Checkout now stamps them 1 ms apart in cart
  order, so the stores keep one order on every screen.

### Frontend

- **Checkout:**
  - Offers only the methods `/payments/config` lists.
  - Says so when online payment is off.
  - Sends the buyer to Paystack's page; if Paystack didn't answer, sends them to the order page to pay from there.
- **Confirmation page:** reads Paystack's `reference` from the return URL. If the order still isn't paid after 10
  seconds, it asks `/payments/verify` once (guide 5.3).
- **Order page:**
  - "Pay ₦… now" while the order waits (P7).
  - Paid delivery orders say they're waiting for a rider; pickup orders say they're paid and ready to collect.
  - A refunded store says "Cancelled and refunded".
- **Sellers:**
  - `/sellers/earnings`, the nav's existing Earnings tab, which had no page before. It holds the payout account card
    (bank, last 4, name, the 24-hour hold) and the payout history.
  - The dashboard asks for a payout account until there is one, while payments are on.
- **Admin:**
  - `/admin/payouts`, with tabs for Failed, Waiting for an account, Sending, Paid and All, and Retry with
    confirmation.
  - `/admin/settings` gains the platform fee and the hand-over days.
- **Labels** for the new fulfilment and payout states. On phones, admin tables no longer show an empty action strip.

### Tests

- **Backend unit:** 275 (38 suites). New: `payment-rules.spec.ts` (channels, references, the charge check, the
  fulfilment step by method, refund amounts) and `paystack.service.spec.ts` (signatures). The checkout spec gains the
  payment page and the OPay refusal.
- **Backend e2e:** 135 (11 suites). New: `phase5-payments.e2e-spec.ts`, 17 tests, with Paystack mocked by nock 14
  (`devDependency`). The Phase 4 and 4b suites were updated for `paymentsEnabled` and for finding seller orders by
  store.
- **Frontend:** 225 (51 files). New:
  - checkout payment cases (redirect, Paystack down, methods);
  - the confirmation page's single verify;
  - Pay now, and the paid and refunded states;
  - `PayoutAccountCard`, `PayoutAccountBanner`, the earnings page, the admin payouts page, `PlatformSettingsForm`.

## 3. Verification evidence

- **Backend** (local Postgres 16, `campusmart_test`): tsc clean; lint 0 warnings; build OK; unit 275/275;
  e2e 135/135, run twice in a row after the ordering fix (the 4b and Phase 4 suites eight more times); `prisma migrate
  diff --exit-code` clean.
- **Frontend:** lint clean; tsc clean; vitest 225/225; `API_ORIGIN=http://localhost:4000 pnpm run build` OK (new
  routes `/admin/payouts` and `/sellers/earnings`).
- **gen:api:** regenerated with the backend change; CI re-checks it with no diff.
- **GitHub CI:** [run 55](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39056505713) on `94a4eb5`
  (the last code change) and [run 56](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39056705157)
  on `70dbd91` (this log), both jobs green. Run 53 was red on an intermediate push whose label fix was in the next
  commit. Run 54 was red because a Phase 4b test read seller orders by position, which led to the ordering fix
  above.
- **Browser walk** ([`evidence/phase5-payments/`](evidence/phase5-payments/)): Chromium → `next start` → NestJS →
  `campusmart_dev`.
  - **Setup.** The API ran with `PAYMENTS_ENABLED=true`, a made-up key (`sk_test_walk_local_only`) and
    [`paystack-stub.cjs`](evidence/phase5-payments/paystack-stub.cjs) preloaded. The stub answers every
    `api.paystack.co` call and refuses any other Paystack host. Playwright answered the browser's trip to
    `checkout.paystack.com`, and the walk played Paystack by sending signed webhooks.
  - **Result.** Output in `payments-walk-output.txt`, 26/26:
    - **Admin** (laptop): set the platform fee to 2.5%, checked it was audited, and set it back to 0
      (`desktop-settings-platform-fee`).
    - **Webhook:** a bad signature gets 401.
    - **Buyer, card** (phone):
      - Checkout shows Card and Bank transfer only (`phone-checkout-payment-choices`) and goes to Paystack with
        `CM_<order>_1`.
      - The signed `charge.success` is accepted, and a replay changes nothing (one `ORDER_PAID` audit row).
      - The confirmation page shows the order paid with its code (`phone-confirmation-paid`).
      - Escrow `HELD`, `AWAITING_RIDER` with a deadline.
      - `NEW_ORDER` reached Chidi and `ORDER_PAID` reached the buyer.
      - The order page says it waits for a rider (`phone-order-paid-awaiting-rider`).
    - **Buyer, bank transfer with pickup, no webhook:** the confirmation page waits
      (`phone-confirmation-confirming`), then asks Paystack once after 10 seconds (one `GET /transaction/verify` in
      the API log) and shows it paid. The seller's address appears (`phone-order-paid-pickup`) and the order is
      `AWAITING_PICKUP`.
    - **Buyer, abandoned payment:** "Pay ₦5,000 now" on the order page (`phone-order-pay-now`) opens Paystack with
      `CM_<order>_2`. The walk then cancels the order.
    - **Seller Chidi** (phone):
      - The dashboard banner (`phone-seller-dashboard-payout-banner`).
      - An account the bank can't resolve is refused (`phone-seller-payout-account-rejected`).
      - GTBank ••6789 is saved with the 24-hour hold shown (`phone-seller-earnings-account-hold`).
      - The database keeps `058, 6789, CHIDI OKAFOR, RCP_walk_6789` and never the full number.
      - `PAYOUT_ACCOUNT_CHANGED` is sent, and the banner is gone.
    - **Payout retry:**
      - Phase 6 owns handover, so the walk marked Amaka's paid order collected and released and gave it a
        payout that was being sent. The release job itself is covered by e2e.
      - A signed `transfer.failed` marked it `FAILED` and alerted the admins.
      - `/admin/payouts` lists it with the reason (`desktop-admin-payouts-failed`).
      - Retry sends it again as `PO_<sellerOrder>_2`, audited.
      - A signed `transfer.success` marks it paid (`desktop-admin-payouts-paid`).
      - Amaka's earnings show it paid, and she got `PAYOUT_PAID` (`phone-seller-earnings-paid`).
  - **Reruns.** The walk ran four times; the first three stopped on walk problems, not app faults:
    - a notification query looked in the body instead of the title;
    - the lamp sold out from the walk's own orders;
    - Chidi kept the account from the previous run;
    - a row match hit payouts from earlier runs.

    The walk now resets Chidi's account and restocks both listings at the start, and matches rows by order code.
  - **Screenshots:** the card brand logos show placeholder images because the walk replaces images.

## 4. Deviations and assumptions

- **The 24-hour hold also covers the first account,** not only changes (P9). Safer, and simpler to explain.
- **OPay and PalmPay with the switch on** use Paystack's `bank_transfer` and `ussd` channels, as the guide says,
  until Paystack names a wallet channel.
- **Checkout succeeds even if Paystack is down.** The order is placed and its stock held. The buyer gets
  `paymentsEnabled: true` with no URL and goes to the order page, where "Pay now" retries. Payments being off gives
  `paymentsEnabled: false`, and the confirmation page says online payment isn't on yet.
- **`authorizationUrl` is stored** on the payment (its own migration), so a resent checkout or a double tap returns
  the same page rather than starting a new attempt.
- **A cancelled order that gets paid** is treated like an expired one: the stock is taken back if it's still there,
  otherwise the payment is refunded in full.
- **"Picked up" for the delivery-fee rule** means `DROPPED_OFF` or `COLLECTED` today. Phase 6 adds the rider states
  (`WITH_RIDER`, `pickedUpAt`) to `PICKED_UP_STATUSES`.
- **`releaseAt` is set by collection,** which Phase 6 builds; e2e and the walk set it directly.
- **Admin payouts arrived with Phase 5** (W1), ahead of the rest of Phase 9.
- **The payouts screen is `/sellers/earnings`,** the nav's existing Earnings tab, rather than a new link under the
  profile. The profile's Earnings entry now says "Payout account and payouts".
- **The hand-over setting** keeps the variable name `DROP_OFF_DEADLINE_DAYS` and the setting name
  `pickupDeadlineDays`. It means the days a seller has to hand a paid dispatch order to the rider.
- **Seller-fault trust points** wait for Phase 8's nightly score, as planned. Phase 5 records the fault.

## 5. Needs from you

All already in the [setup checklist](setup-checklist.md#11-paystack). Phase 6 doesn't wait on any of it:

- **A Paystack account in test mode.** Put the test secret key in the cloud environment's settings as
  `PAYSTACK_SECRET_KEY`, with `PAYMENTS_ENABLED=true`, never in chat. Until then, checkout places orders that can't
  be paid, and says so.
- **At staging:** the webhook URL `https://<staging-api>/api/payments/webhook` in the Paystack dashboard, then one
  real test payment (the MANUAL item above).
- **For payouts:** Transfers enabled, the transfer OTP off for API transfers, and enough balance.
- **OPay and PalmPay:** ask Paystack whether your account gets a dedicated channel. They stay hidden until then.
