# Decisions needed: Phases 5–10 and launch

Written 2026-10-17, after Phase 4. Each row is a choice only you can make. The **Default** column is what I build if
you leave the row unanswered, so nothing waits on a row unless its "Needed by" says it blocks.

**How to answer:** copy the reply block at the end and fill in each line with an option letter, `default`, or your own
words. Rows you skip get the default. Answered rows move to the README's "Decisions since the guide" with the date.

Already locked, not asked again: D1–D19 in the guide, plus the decisions in the README (verified sellers only publish,
drafts before that, local Postgres until Neon after all phases, pnpm only). In particular the **48-hour dispute window
is D11**. `ESCROW_DISPUTE_WINDOW_HOURS` stays a variable only so tests can set it to 0.

---

## W. Way of working

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| W1 | When to build the remaining admin screens (payouts, disputes, users, listings, reports, audit, overview) | **a** with the phase that needs them: payouts in 5, disputes in 6, the rest in 9 (like slices A and B) · **b** all in Phase 9 | a | Phase 5 start |
| W2 | Phase 5 without a staging API: real Paystack can't call this container's webhook | **a** build and pass the gate on nock mocks; the real test payment stays a MANUAL item until staging exists · **b** don't close Phase 5 until a real test payment works on staging | a | Phase 5 gate |
| W3 | Open MANUAL checks (Phase 1 two phones, Phase 3 Cloudinary, Phase 9 console on a phone and laptop) | **a** keep going; they stay listed until you do them · **b** stop until they're done | a | now |

## S. Setup and staging

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| S1 | A staging environment for real payments and email | **a** yes, now · **b** yes, after Phase 6 · **c** not until launch | c (I work on mocks) | Phase 5 gate if W2 = b |
| S2 | API host (needs a process that stays up, D17) | **a** Render · **b** Railway · **c** Fly.io | a | when S1 starts |
| S3 | Staging database | **a** a Neon `staging` branch · **b** the API host's own Postgres | a | when S1 starts |
| S4 | Email provider and sending domain (`MAIL_*`, open since Phase 1) | **a** Resend · **b** Postmark · **c** Brevo · **d** Zoho · **e** other | none (no fake SMTP: dev prints to the console) | staging; launch |
| S5 | Cloudinary account (open since Phase 3; Phase 6 dispute photos and Phase 10 screenshots need it too) | **a** set it up now · **b** later | b (uploads answer 503 and the form says so) | Phase 6 for dispute photos |
| S6 | Network access for this environment | **a** allow `api.paystack.co`, `api.cloudinary.com`, `res.cloudinary.com` and the staging hosts · **b** leave it blocked | b (everything mocked) | real checks |
| S7 | Branch protection (open since Phase 0) | **a** require CI on `master`, `develop` and `backend` · **b** `master` and `develop` only · **c** none | none until you turn it on (it's a GitHub setting) | launch |

## P. Payments and payouts (Phase 5)

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| P1 | Platform fee, taken from the seller's payout (`PLATFORM_FEE_BPS`; 100 = 1%) | a number, e.g. `0`, `300` (3%), `500` (5%) | 0 | launch |
| P2 | Paystack's processing fee on each payment | **a** platform absorbs it (guide 5.7) · **b** add a "Service fee" line the buyer pays at checkout · **c** take it from the seller's payout | a | Phase 5 build (b changes the checkout total) |
| P3 | Paystack's transfer fee on each payout | **a** platform absorbs it · **b** take it from the payout | a | Phase 5 build |
| P4 | How payouts are grouped | **a** one transfer per seller order, 48 hours after collection (guide) · **b** one transfer per seller per day, covering everything released that day (fewer fees, one day slower) | a | Phase 5 build |
| P5 | OPay and PalmPay at checkout (no dedicated Paystack channel unless support confirms one) | **a** keep them, paying by bank transfer or USSD (guide 5.1) · **b** hide them until Paystack confirms · **c** drop them for good | a | Phase 5 build |
| P6 | A refund's cost when Paystack keeps its processing fee (check this on your account) | **a** platform absorbs it; the buyer gets everything back · **b** take it out of the refund | a | Phase 5 build |
| P7 | A buyer whose payment failed or who left the Paystack page | **a** "Try again" on the same order until it expires (30 min), each try a new reference `CM_<id>_<n>` · **b** one try; then a new checkout | a | Phase 5 build |
| P8 | Minimum order total | **a** none · **b** a minimum in naira (e.g. ₦500) | a | Phase 5 build |
| P9 | A seller changes their payout bank account | **a** allowed anytime, with a notification and email confirming it · **b** the same, plus payouts paused for 24 hours after a change (protects a hijacked account) | b | Phase 5 build |
| P10 | Who gets admin alerts (a payment with the wrong amount, failed payouts, a parcel locked after 5 wrong codes) | **a** every ADMIN account, in the app and by email · **b** a list of email addresses you give me | a | Phase 5 build (email needs S4) |

## F. Fulfilment, pickup and disputes (Phase 6)

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| F1 | Drop-off deadline after payment (`DROP_OFF_DEADLINE_DAYS`) | a number of days | 3 | Phase 6 build |
| F2 | Pickup agents who don't have a school email | **a** not allowed: an agent signs up with a school email, then an admin assigns them (D7, today's rule) · **b** an admin can invite an agent by any email, with a station-only account that can't buy or sell | a | Phase 6 build |
| F3 | Can a buyer cancel after paying, before the seller drops off? | **a** no; only the seller or the deadline cancels (guide 6.1) · **b** yes, for a full refund of that seller order, until drop-off | a | Phase 6 build |
| F4 | A parcel left at the station that the buyer never collects (the guide doesn't cover it) | **a** remind the buyer on days 2 and 5, then alert admins on day 14; an admin refunds or releases it · **b** the same reminders, then release to the seller automatically on day 14 (the seller did their part) · **c** refund the buyer automatically on day 14 | a | Phase 6 build |
| F5 | Who unlocks a parcel locked after 5 wrong collection codes | **a** an admin, from the order screen, with a reason (logged) · **b** the agent, after checking the buyer's student ID | a | Phase 6 build |
| F6 | Dispute reasons the buyer picks from | **a** Not as described, Damaged, Wrong item, Missing items, Other · **b** your list | a | Phase 6 build |
| F7 | Dispute evidence photos | **a** optional, up to 3 · **b** at least 1 required | a (photos need S5) | Phase 6 build |
| F8 | How an admin resolves a dispute | **a** full refund of that seller order, or full release (guide 9.1) · **b** also a partial refund of chosen items | a | Phase 6 build |
| F9 | The item when a collected order is refunded | **a** the admin arranges it outside the app (returned at the station, or kept) and notes it in the resolution · **b** a return step in the app: the buyer drops the item back at the station, and the refund waits for it | a | Phase 6 build |
| F10 | Trust-score cost of a seller-caused cancellation (seller cancels, or misses the drop-off deadline) | a number of points per cancellation in 90 days | 10, both cases counted | Phase 6 build (score shown in Phase 8) |

## A. Seller analytics (Phase 7)

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| A1 | Low-stock alert level (`LOW_STOCK_THRESHOLD`) | a number | 3 | Phase 7 build |
| A2 | What counts as a view | **a** one per viewer per listing per day, the seller's own views excluded · **b** every page open | a | Phase 7 build |

## R. Wishlist, stores and reviews (Phase 8)

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| R1 | Trust-score weights (guide 8.4) | **a** keep: 50 rating, 30 completed share of the last 50 orders, 20 verified, −10 per cancellation (F10) · **b** your weights | a | Phase 8 build |
| R2 | How the trust score shows to buyers | **a** a badge only: "Trusted seller" at 80 or more · **b** the number (0–100) · **c** both | a | Phase 8 build |
| R3 | Featured stores ranking (guide 8.2) | **a** keep: rating × log(1 + reviews), then paid orders in 30 days · **b** most paid orders in 30 days only | a | Phase 8 build |
| R4 | Editing reviews, and seller replies | **a** neither at launch; admins can hide an abusive review · **b** the buyer can edit within 7 days · **c** sellers can reply once | a | Phase 8 build |
| R5 | Favourites already saved on a phone before sign-in | **a** move them into the account on first sign-in, then clear them from the phone · **b** discard them | a | Phase 8 build |

## M. Admin and moderation (Phase 9)

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| M1 | Other admins | emails (they sign up first; an admin then sets the role) | only the seeded admin | launch |
| M2 | New listings from verified sellers | **a** go live at once; reports and admins catch problems · **b** each listing waits for admin approval | a | Phase 9 build |
| M3 | Reasons a moderator picks when rejecting a listing | **a** Prohibited item, Misleading or wrong category, Poor photos, Counterfeit, Duplicate, Other · **b** your list | a | Phase 9 build |
| M4 | Buyer reports needed to flag a listing | **a** 3, or 1 for a prohibited item (guide) · **b** your numbers | a | Phase 9 build |
| M5 | Prohibited items | your list | a starter list for you to edit: weapons, drugs, alcohol and tobacco, exam papers and answers, stolen goods, counterfeit goods, adult content, live animals | Phase 9 build (show it to sellers in Terms) |
| M6 | What a suspended user sees | **a** "Your account is suspended. Contact support" with the support email (T4) · **b** the same, plus the admin's reason | a | Phase 9 build |
| M7 | Extra sign-in check for admins (they move money: payout retries, dispute decisions) | **a** none at launch · **b** a 6-digit email code at every admin sign-in (needs S4) · **c** an authenticator app (TOTP) | b | Phase 9 build |

## T. Remaining features (Phase 10)

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| T1 | Google sign-in | **a** build it (you create the Google Cloud OAuth client) · **b** leave it out and hide the button | b | Phase 10 build |
| T2 | Web push ("Ready for pickup" with the app closed) | **a** build it (I generate VAPID keys; you store them) · **b** leave it out | b | Phase 10 build |
| T3 | Phone verification | **a** stays deferred, page hidden (guide) · **b** build it with an SMS provider (e.g. Termii) | a | Phase 10 build |
| T4 | Support contacts on Help → Email support / Call us | an email, a phone, optionally WhatsApp | the screens show "coming soon" instead of made-up contacts | Phase 10 build |
| T5 | Terms and Privacy text (escrow, 48-hour window, refunds, prohibited items, NDPR) | **a** I draft it; you (ideally with a lawyer) approve · **b** you supply it | a | before launch |
| T6 | What's kept when someone deletes their account | **a** personal details anonymised; order and payment records kept 6 years for tax · **b** your rule | a | Phase 10 build |
| T7 | Default email notifications | **a** order and payment events only (guide) · **b** also reminders and reviews | a | Phase 10 build |
| T8 | Error and uptime monitoring | **a** Sentry (`SENTRY_DSN`) plus an uptime check on `/api/health` · **b** the host's log alerts only | b | before launch |

## L. Launch

| ID | Decision | Options | Default | Needed by |
|---|---|---|---|---|
| L1 | Domains for the app and the API | e.g. `campusmart.ng` and `api.campusmart.ng` | none (blocks launch) | launch |
| L2 | The first campus | school name, email domains, stations (name, address, hours, contact) and their agents | placeholders from the seed | launch |
| L3 | Go-live order | **a** staging, then a real-card test order refunded, then open to students · **b** a closed beta with invited students first | b | launch |

---

## Reply block

```
W1:
W2:
W3:
S1:
S2:
S3:
S4:
S5:
S6:
S7:
P1:
P2:
P3:
P4:
P5:
P6:
P7:
P8:
P9:
P10:
F1:
F2:
F3:
F4:
F5:
F6:
F7:
F8:
F9:
F10:
A1:
A2:
R1:
R2:
R3:
R4:
R5:
M1:
M2:
M3:
M4:
M5:
M6:
M7:
T1:
T2:
T3:
T4:
T5:
T6:
T7:
T8:
L1:
L2:
L3:
```
