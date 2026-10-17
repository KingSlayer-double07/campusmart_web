# Execution plan: Phases 4b–10

Drafted 2026-10-17 from your answers in [decisions-needed.md](decisions-needed.md). The guide stays the base; this
file lists what each phase builds, including where your answers change the guide. Anything still waiting on you is
marked **(waits on ID)**, pointing at a round 6 question. Nothing is built on a guess.

## How every phase runs

The same rules as Phases 0–4:
- **Branches:** each phase gets its own branch off `backend`, pushed as work lands, in small commits named
  `phase-N: …`.
- **Done means:** every endpoint has
  - validated DTOs that reject unknown fields;
  - the auth check in the service;
  - documented responses and shared error codes;
  - a unit test, plus e2e tests for the happy path and a forbidden path.

  Every screen has loading, empty and error states.
- **Checks:**
  - Tests run on local Postgres 16, never Neon.
  - Paystack is mocked with nock, never called live.
  - Emails print to the console until S4 is set up; no fake SMTP.
- **The gate:**
  - Every check passes: the commands in the README, plus the GitHub CI run.
  - A browser walk on a phone viewport, with screenshots in `evidence/`.
  - The phase file is filled in (checklist, changes, evidence, deviations, "Needs from you").
- **Then:** `backend` is fast-forwarded and I stop for your "continue". If `backend` has moved, I merge it into the
  phase branch (no rebase), re-run the checks, then fast-forward. Nothing is merged to `develop` or `master`.

## Order

| Step | Phase | Branch | Waits on |
|---|---|---|---|
| 1 | 4b Checkout with delivery (DL10) | `feat/phase-4b-delivery-checkout` | nothing; starts on your "continue" |
| 2 | 5 Payments, escrow, refunds | `feat/phase-5-payments` | DF9a, C11 |
| 3 | 6 Dispatch and handover (replaces the guide's pickup-station Phase 6) | `feat/phase-6-dispatch` | DF8a, DF8b, DF10, DF11 |
| 4 | 7 Seller analytics | `feat/phase-7-analytics` | nothing |
| 5 | 8 Wishlist, stores, reviews, trust score | `feat/phase-8-stores-reviews` | nothing |
| 6 | 9 Admin and moderation (the slices not built earlier) | `feat/phase-9-admin-moderation` | nothing |
| 7 | 10 Remaining features (incl. buyers without a school email, Google sign-in) | `feat/phase-10-remaining` | nothing |
| 8 | Launch track (yours, with my help) | none | your accounts, see the last section |

Admin screens come with the phase that needs them (W1): settings and campus places in 4b, payouts in 5, riders and
disputes in 6, the rest in 9.

## Throughout

- **Settings store.** A `PlatformSetting` table (key, JSON value, who changed it, when). Admins edit it at
  `/admin/settings`, every change goes in the audit log, and the env value is used until a setting is saved. Each
  phase adds its own settings:

  | Phase | Settings it adds |
  |---|---|
  | 4b | delivery fee per campus (DF1) |
  | 5 | platform fee (P1, R1a) |
  | 6 | the 3-day pickup deadline (F1, R1a) |
  | 7 | the low-stock level, 5 (A1, R1a) |
  | 8 | trust-score weights (R1), applied at the next nightly run (R1b) |
  | 9 | report threshold, 5 (M4); the banned-word list (M4c) |

- **Notifications.** From Phase 5, every status change writes a `Notification` row (D19). The bell and list screen
  arrive in Phase 10; until then, the order pages show each order's state. There is no web push (T2).
- **Admin alerts (P10)** go to every admin account, in the app and by email (console until S4).
- **Pickup stations (DL9).** The station and agent tables, the `PICKUP_AGENT` role and their code stay. The admin
  Stations screen stays visible. Buyers and sellers never see stations again.

---

## Phase 4b: checkout with delivery

**Goal:** the cart and checkout let the buyer choose, per store (DM1):
- **dispatch on campus:** a place from the campus list. The order pays one flat fee, however many stores it covers
  (DF2);
- **dispatch off campus:** an address the buyer types (DF4a), with no fee in the app (DF4);
- **pickup from the seller:** free (C2), only where the seller allows it (DL1).

One destination per order: every store delivered by dispatch goes to the same place or address (DF6).

Payments stay off until Phase 5, as now.

**Schema** (one migration)

| Change | Why |
|---|---|
| `CampusPlace` (institution, name, active, sort order) | the admin's list of halls, faculties and gates (DF3) |
| `Institution.deliveryFeeKobo` (nullable) | the flat on-campus fee (DF1) |
| `SellerProfile`: `pickupArea` and `pickupAddress` (both typed by the seller), `contactPhone`, `allowsPickup` | SA1, SA2, SA4, DL1 |
| `Order.pickupStationId` becomes optional | stations aren't used (DL9) |
| `SellerOrder.deliveryMethod` (`DISPATCH_CAMPUS`, `DISPATCH_OFF_CAMPUS`, `SELLER_PICKUP`) | DM1 |
| `Order` destination: `campusPlaceId` or `deliveryAddress`, plus `buyerPhone` (a copy for the rider) | DF3, DF4, DF4a, DF6, PH2 |
| `Order.deliveryFeeKobo`: one fee per order | DF2 |
| `Order.totalKobo` = items + the delivery fee | DL4 |

The platform fee still comes from item subtotals only, since delivery fees are the platform's (DX3).

**Backend**

- **Admin:**
  - campus places CRUD per institution;
  - the delivery fee per campus, which starts `/admin/settings`.
- **Buyers:** `GET /campus-places` returns the active places at the buyer's school.
- **Sellers:** `PATCH /sellers/me` gains the pickup area, address, phone and "Allow pickup from me".
- **Publishing needs a complete profile (SA1).** `assertCanPublish` also requires an address and phone. Without them
  the request fails with 403 `SELLER_PROFILE_INCOMPLETE`, a code new in 4b. This sits next to the existing
  verification check. Drafts are still allowed.
- **Cart:** `GET /cart` gains:
  - per store, the methods on offer, and the seller's area when they allow pickup (SA2);
  - the campus's on-campus fee, charged once per order (DF2).
- **Checkout:** `POST /orders/checkout` takes one choice per store instead of `pickupStationId`. It refuses:
  - pickup from a seller who doesn't allow it;
  - a place at another school;
  - on-campus dispatch at a school with no fee set (C10);
  - off-campus dispatch without an address (DF4a);
  - dispatch without a phone number. The phone is typed at checkout next to the place and saved to the profile
    (PH2, which replaces PH1). It's needed only when a store is delivered by dispatch (C9).
- **Privacy:**
  - Order detail shows the seller's full address and phone to the buyer only after payment (SA3).
  - The seller sees only the buyer's display name.
  - No response reveals the seller's full address before payment.
- **Phone:** checkout saves the phone to the profile and fills it in next time. Editing the rest of the profile stays
  in Phase 10.

**Frontend**

- **Checkout:**
  - one section per store, with a method picker and a campus place picker (or an address box for off campus);
  - a phone field next to the place, filled in from the profile (PH2);
  - the one delivery fee in the summary (DF2).
- **Pickup:** the station picker page is no longer linked; its code stays (DL9).
- **Seller profile:** a "Delivery and pickup" card (address, phone, the allow-pickup switch). The listing form says
  why publishing is blocked until the card is complete.
- **Admin:** a "Campus places" screen per institution, and `/admin/settings` with fees per campus.
- **Orders:** the order pages show each store's method, place or address, and fee.

**Gate checklist**

- [ ] A cart with a dispatch store and a pickup store makes two seller orders with the right methods. The total is
      items plus one delivery fee; two dispatch stores still pay one fee.
- [ ] Pickup from a seller who doesn't allow it is refused.
- [ ] A place at another school is refused.
- [ ] Dispatch without a phone is refused.
- [ ] A seller without an address and phone can't publish; a draft still saves.
- [ ] No API response shows a seller's full address before payment.
- [ ] The Phase 4 checks still hold: stock reservation, idempotency, expiry.
- [ ] Browser walk: checkout with both methods; the seller fills in the delivery card; the admin adds campus places
      and a fee.

**Needs from you:** UNILAG's real campus places and the on-campus fee. You can enter them yourself in `/admin` once
4b lands; until then the seed has placeholders.

---

## Phase 5: payments, escrow, refunds

The guide's 5.1–5.7, with these changes.

- **Initialise:**
  - Paystack is asked for the order total, items plus delivery fees.
  - Channels: card and bank transfer.
  - OPay and PalmPay appear only when `PAYSTACK_WALLET_CHANNELS=true` (P5). Their Paystack channel is set when you
    confirm it with Paystack.
  - "Try again" works on the same order until it expires, each try with a new reference (P7).
  - No minimum order (P8).
- **Webhook and verify:**
  - Signature checked, replays ignored, amount and currency checked, as the guide says.
  - On success, each seller order's escrow becomes `HELD`, and it moves on by method:
    - **dispatch:** "awaiting rider", with a deadline 3 days after payment (DL7b). The order's delivery job opens to
      riders at this point, without the seller calling anyone (DF8; the job itself is Phase 6);
    - **pickup:** "awaiting pickup", with the buyer's 5-day deadline (DL7c; the job is Phase 6).
  - Sellers are notified (in the app, and by email once S4 is set up).
  - The Paystack fee from the webhook is stored, for refunds.
- **Payout account (5.4):** banks list, name check, Paystack recipient; the full account number is never stored. A
  change pauses payouts for 24 hours and notifies the seller (P9).
- **Escrow release (5.5):**
  - Every 15 minutes, release seller orders handed over more than 48 hours ago with no open dispute (D11).
  - One transfer per seller order (P4) of items minus the platform fee (P1, 0).
  - The platform absorbs the transfer fee (P3). Delivery fees stay in the platform balance (DX3).
- **Refunds (5.6):** `refundSellerOrder(sellerOrderId, reason, fault)`.
  - **Amount:** the items, plus the order's delivery fee only if nothing in the order had been picked up yet (DF5,
    DF5a, DF9). Whether the fee comes back when one store is refunded and the rest is still delivered: **waits on
    DF9a**.
  - **Buyer's fault:** that seller order's share of the Paystack fee, split by subtotal, is taken off (P6).
  - **Seller's fault:** the platform absorbs the fee, and the seller loses 10 trust points, counted like a
    cancellation (P6, F10).
  - **Nobody's fault** (e.g. paid after the order expired and the stock was gone): the platform absorbs it.
  - **3 days with no pickup:** DL7d tied the seller's fault to never calling the dispatch, but sellers no longer call
    (DF8). The rule that replaces it: **waits on C11**.
- **Fees:** the platform absorbs Paystack's processing fee (P2).
- **Admin:** a `/admin/payouts` screen for failed and awaiting-account payouts, with retry; the platform fee on
  `/admin/settings`.
- **Gate checklist:**
  - [ ] the guide's Phase 5 list;
  - [ ] a buyer-fault refund takes off the right share of the Paystack fee;
  - [ ] a seller-fault refund lowers the trust score;
  - [ ] the delivery fee is refunded only when no trip happened;
  - [ ] a payout account change holds payouts for 24 hours.

  The real test payment stays MANUAL until staging (W2, S1).
- **Needs from you:**
  - nothing to build Phase 5;
  - a Paystack test key only when staging exists;
  - the OPay and PalmPay channel confirmation whenever Paystack gives it.

---

## Phase 6: dispatch and handover

Replaces the guide's Phase 6. The station flow stays in the code, unused.

**Riders (DX1, DX7)**

- A new `DISPATCH` role. An admin invites a rider by email and picks their campus; the invite email prints to the
  console until S4. The rider sets a password from the invite link, and the link confirms their email.
- Rider accounts can't buy or sell (DX7).
- Admin: a `/admin/riders` screen to invite, list and deactivate riders.

**Seller order states**

| Method | Path |
|---|---|
| Dispatch | awaiting rider → rider assigned → with the rider → delivered. One delivery job per order moves every dispatch store in it together (DF7) |
| Pickup from the seller | awaiting pickup → collected |

Both can also end cancelled or disputed. The labels live in `lib/labels.ts` (D4).

**Jobs (DX2, DX5, DL5)**

- **One job per order (DF7).** It covers every store in the order delivered by dispatch. One rider collects from each
  store, then delivers once.
- **The job opens automatically (DF8).** It opens when the order is paid; sellers don't call the dispatch. Whether that
  also covers single-store orders: **waits on DF8a**.
- Every active rider at that campus sees an open job; the first to accept takes it, and any other gets 409.
- Each seller gets a timeframe for the rider's arrival, so the item is ready (DF8). Who sets it: **waits on DF8b**.
- Admins are alerted if nobody accepts within 5 hours. They can assign or reassign a rider then, or when a rider
  drops a job (C5).
- Before accepting, riders see only the pickup and drop-off areas. The full addresses and the buyer's phone come after
  they accept (C6).
- The seller and the buyer see the rider's name only (DX8).
- **At each seller:** the rider enters or scans that store's `CM-` code, and its parcel is recorded as with the rider
  (DX5).
- A store that isn't ready when the rider arrives: **waits on DF11**.
- **At the buyer:** the rider enters the buyer's 6-digit code, and the delivery is done. One code for the delivery or
  one per store: **waits on DF10**. Each store's payout comes 48 hours later (D11).
- **Pickup from the seller:** the seller enters the buyer's code (DL5).
- **Wrong codes:** 5 wrong codes lock the order, and an admin unlocks it with a reason (F5).
- The buyer sees their code once the rider has the parcel (dispatch), or as soon as the order is paid (pickup from
  the seller) (C7). With several stores, this follows DF10.

**Deadlines** (an hourly job)

| Method | Rule |
|---|---|
| Dispatch | No pickup from a store 3 days after payment: that store's order is cancelled and refunded (DL7b). Whose fault: **waits on C11**. |
| With the rider | 5 days without the buyer's code: admins are alerted (DL6b). |
| Pickup from the seller | Not collected within 5 days of payment: cancelled automatically as the buyer's fault, with the P6 fee taken off (DL7c). |

**Problems and disputes**

- "Report a problem" is open from payment until 48 hours after handover. Before handover it alerts admins (a late
  rider, a lost parcel, a no-show); after handover it's a dispute that holds the payout (C8).
- Disputes:
  - The reasons are F6's list.
  - Up to 3 photos, which need Cloudinary (F7, S5).
  - They hold the payout.
- Admin decisions:
  - Full refund or full release (F8), choosing whose fault it is (P6).
  - Lost or damaged with the rider: the admin decides (DX6).
  - A no-show: the admin decides (DL8).
  - An item to return is arranged outside the app (F9).
- A seller can cancel before pickup. That refunds the buyer and counts against the seller (F10, P6).

**Frontend**

- **The rider app,** `/dispatch`, a mobile layout for the `DISPATCH` role:
  - available jobs, my jobs, and job detail;
  - code entry, with QR scanning where the browser supports it and typing everywhere.
- **Sellers:** the orders page rebuilt per seller order, with tabs by state. The "Mark as" menu is deleted. Each
  dispatch order shows the rider's name and expected arrival; pickups have a code entry.
- **Buyers:** the order detail shows the handover code, progress, and "Report a problem".
- **Admin:** `/admin/riders`, `/admin/disputes` with a detail page, unlocking, and assigning riders.

**Gate checklist**

- [ ] Paying for an order with two dispatch stores opens one job; the rider collects from both and delivers once.
- [ ] A rider at another campus gets 404 on a job.
- [ ] Two riders accept at once: one wins.
- [ ] A seller calling rider endpoints gets 403, and a rider calling seller endpoints gets 403.
- [ ] A wrong `CM-` code is refused.
- [ ] 5 wrong buyer codes lock the order.
- [ ] No pickup within 3 days refunds the buyer.
- [ ] Nobody accepting within 5 hours alerts the admins.
- [ ] 5 days with the rider alerts the admins.
- [ ] A dispute 47 hours after handover blocks the payout; at 49 hours it's refused.
- [ ] An uncollected pickup cancels as the buyer's fault.
- [ ] MANUAL: QR scanning on an Android phone.

**Needs from you:**
- the riders' emails, to invite them yourself in `/admin/riders`;
- an Android phone, for the QR check.

---

## Phase 7: seller analytics

The guide's Phase 7, with:
- **Revenue:** item subtotals only; delivery fees aren't the seller's.
- **Low-stock alert:** at 5 (A1), editable in settings.
- **Views (A2):** one per viewer per listing per day; the seller's own views don't count.

Gate: the guide's Phase 7 list. Needs from you: nothing.

## Phase 8: wishlist, stores, reviews, trust score

The guide's Phase 8, with these changes:
- **Favourites:** saved on the phone before sign-in, they move into the account at first sign-in (R5).
- **Featured stores:** ranked by the guide's formula (R3). Paid placement for stores that subscribe is noted for
  later, not built.
- **Store pages:** show the seller's area when they allow pickup (SA2).
- **Reviews:**
  - Open once an order is delivered or collected.
  - Buyers can't edit them and sellers can't reply. Admins can hide an abusive one (R4).
- **Trust score, nightly:**
  - The weights are the guide's, editable in settings (R1). A changed weight takes effect at the next nightly run
    (R1b).
  - "Completed" means delivered or collected.
  - −10 per seller-caused cancellation or seller-fault refund in 90 days (F10, P6).
  - Shown as a "Trusted seller" badge at 80 or more (R2).
  - A prohibited listing doesn't cost points; it means suspension (M4d, Phase 9).

Gate: the guide's Phase 8 list, plus a link crawl. Needs from you: nothing.

## Phase 9: admin and moderation

The slices not built earlier.

**Screens**
- Overview.
- **Users:**
  - Roles: other admins sign up, then the seeded admin sets their role (M1).
  - Suspend and unsuspend: the user sees the admin's reason (M6).
- **Listings:** moderation with the M3 reasons. Listings go live at once (M2).
- Reports.
- Audit log.

**Prohibited items**
- **Prevention (M4a):**
  - Sellers confirm "not on the prohibited list" (your M5 list) before publishing.
  - Listings that match a banned word wait for admin review. Admins edit the word list in settings (M4c).
- **Reports:**
  - 5 distinct buyer reports flag a listing (M4).
  - A "Prohibited item" report hides it at once, pending review (M4b).
- **A confirmed prohibited item means suspension (M4d).** The suspension starts automatically when the admin
  confirms, and lasts until an admin lifts it (M4e). It doesn't apply to a listing the banned-word check held before it
  ever went live (M4f).

**Admin sign-in (M7)**
- A 6-digit code by email at every admin sign-in. It prints to the console until S4 is set up.

Gate: the guide's Phase 9 list, including the loop over every `/api/admin/*` route. Needs from you: the other admins
sign up.

## Phase 10: remaining features

The guide's Phase 10 table, with these changes.

**Sign-up**
- **Buyers without a school email (T1):**
  - A buyer can sign up with any email and pick their school during onboarding.
  - An email-and-password account still confirms its email with the code (C4).
  - A school that isn't listed goes to the waitlist (G4).
  - Sellers still need a school email. D7 changes for buyers only.
- **Changing school (G1):** a buyer can change school in their profile; the cart empties.
- **Becoming a seller (G2):** a buyer adds a school email and confirms it, then becomes a seller.
- **Google sign-in (T1, G3):** for buyers only. Sellers use email and password.

**The rest**
- Notifications: the bell, the list, and preferences. Email only for order and payment events (T7).
- Profile editing (the phone came in 4b).
- **Support (T4):**
  - Reports go to admins.
  - The email, phone and WhatsApp contacts come from environment variables; each one unset shows "coming soon".
- Account deletion: anonymise personal details, keep orders for 6 years (T6).
- Health check.
- Sentry plus an uptime check (T8).
- Phone verification stays hidden (T3). No web push (T2).
- The guide's clean-ups, and the agent placeholder left unlinked.
- **Terms and Privacy (T5):** I draft them, covering:
  - delivery and pickup;
  - escrow and the 48-hour window;
  - refunds and the fault rules;
  - the prohibited list;
  - NDPR.

  You approve the text.

**Needs from you**
- A Google Cloud OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
- The support contacts, in production.
- A Sentry project (`SENTRY_DSN`), and an uptime monitor.
- Approval of the Terms and Privacy text.

---

## Launch track (you, with my help)

From your answers: staging comes at launch (S1), on Render (S2) with a Neon `staging` branch (S3).

1. **Email provider and sending domain (S4).** A production API won't start without `MAIL_*`. Admin sign-in codes,
   rider invites and password resets need it.
2. **Paystack:** business verification, then live keys and Transfers. Turn off the transfer OTP.
3. **Staging:** Render with the Neon `staging` branch, plus Vercel. Use the pnpm build commands in
   [setup-checklist.md](setup-checklist.md). Run a real test payment (the W2 MANUAL item).
4. **Domains (L1)**, once bought.
5. **The first campus (L2):** UNILAG from the seed. Add its campus places, fee and riders in `/admin`.
6. **A closed beta with invited students first (L3)**, then a real-card order, refunded, then open.

Branch protection stays off (S7). Cloudinary comes when you're ready (S5). Real uploads and dispute photos wait on it.
