# Decisions needed: Phases 5–10 and launch

Written 2026-10-17, after Phase 4. **Status:** rounds 1–5 are answered; see [Answers](#answers-2026-10-17).
Round 6, six questions about the automatic delivery job, is [open](#open-questions-round-6). None of them blocks Phase 4b. The plan built on these answers is in
[execution-plan.md](execution-plan.md). Each row is a choice only you can make. The **Default** column is what I build if
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

## Answers (2026-10-17)

Your answers, as given. "Default" rows take the Default column above. Later rounds refine earlier rows where
they say so; anything still undecided is in round 6.

### Round 1

| ID | Answer |
|---|---|
| W1 | Default: admin screens come with the phase that needs them (payouts in 5, disputes in 6, the rest in 9). |
| W2 | Default: Phase 5 passes its gate on nock mocks; the real test payment stays a MANUAL item until staging exists. |
| W3 | Default: keep going; MANUAL checks stay listed until you do them. |
| S1 | Default: no staging until launch; I work on mocks. |
| S2 | Render. |
| S3 | A Neon `staging` branch. |
| S4 | Default: no provider yet. Development prints emails to the console. |
| S5 | Cloudinary later. |
| S6 | Default: network access stays as is; everything is mocked. |
| S7 | No branch protection for now. |
| P1 | 0 for now. Admins can change it (R1a). |
| P2 | The platform absorbs Paystack's processing fee. |
| P3 | Default: the platform absorbs the transfer fee. |
| P4 | Default: one transfer per seller order. |
| P5 | OPay and PalmPay hidden until Paystack is set up for them, behind an environment variable (round 2). |
| P6 | By fault. Buyer's fault: that seller order's share of the Paystack fee (split by subtotal) is taken from the refund. Seller's fault: the platform absorbs it and the seller loses 10 trust points, as for a cancellation. Mapping confirmed: the seller cancels or misses the deadline = seller; paid after the order expired and the stock was gone = nobody, the platform absorbs it; a dispute ending in a refund = the admin picks buyer, seller or nobody. |
| P7 | Default: "Try again" on the same order until it expires. |
| P8 | No minimum order total. |
| P9 | Payouts pause for 24 hours after a payout account change, and the seller is notified. |
| P10 | Every admin account gets the alerts. |
| F1 | 3 days, counted from payment, for the rider to pick the parcel up (DL7b). |
| F2 | **Delivery replaces pickup stations.** An in-app dispatch delivers; a buyer can instead pick up from the seller where the seller allows it and has entered a location. The station and agent work stays in the code for later; the admin Stations screen stays visible (DL9). This replaces D12 and the agent half of D16. |
| F3 | Default: a buyer can't cancel after paying. |
| F4 | No longer applies (no stations); replaced by DL6. |
| F5 | Default: after 5 wrong codes an admin unlocks the order, with a reason. |
| F6 | The suggested dispute reasons: Not as described, Damaged, Wrong item, Missing items, Other. |
| F7 | Evidence photos optional, up to 3 (they need Cloudinary). |
| F8 | Default: full refund of that seller order, or full release. |
| F9 | Default: an admin arranges the item's return outside the app. |
| F10 | Default: 10 points per seller-caused cancellation in 90 days; a missed deadline counts too. |
| A1 | Low-stock alert at 5. |
| A2 | Default: one view per viewer per listing per day; the seller's own views don't count. |
| R1 | The guide's weights, editable by admins (R1a, R1b). |
| R2 | Default: a "Trusted seller" badge at 80 or more. |
| R3 | The guide's ranking for now. Later, admins decide featured placement for stores that subscribe to it (future; not built now). |
| R4 | Default: no review edits or seller replies at launch; admins can hide an abusive review. |
| R5 | Default: favourites saved on a phone move into the account at first sign-in. |
| M1 | Other admins sign up; the seeded admin sets their role. |
| M2 | Default: listings from verified sellers go live at once. |
| M3 | Default rejection reasons: Prohibited item, Misleading or wrong category, Poor photos, Counterfeit, Duplicate, Other. |
| M4 | 5 buyer reports flag a listing. Prohibited items are kept off before anyone reports them (M4a). |
| M5 | Prohibited: illegal drugs and controlled substances sold unlawfully; firearms, ammunition, explosives and other prohibited weapons; stolen goods and counterfeit products; fraudulent documents, forged certificates and fake identification; products whose sale is illegal or needs authorisation the seller doesn't have; hazardous or illegal chemicals and substances; products involving exploitation, abuse or other unlawful activity; anything else prohibited by Nigerian law or platform policy. |
| M6 | A suspended user sees the suspension message with the admin's reason. |
| M7 | A 6-digit email code at every admin sign-in. Until email is set up (S4) the code prints to the console. |
| T1 | Build Google sign-in, for buyers only. **Buyers may register without a school email** and pick their school during onboarding; sellers still need a school email. This changes D7 for buyers. |
| T2 | No web push. |
| T3 | Phone verification stays deferred; the page stays hidden. |
| T4 | Environment variables for the support email, phone and WhatsApp; "coming soon" where one isn't set. |
| T5 | Default: I draft Terms and Privacy; you (ideally with a lawyer) approve. |
| T6 | Default: personal details anonymised; order and payment records kept 6 years. |
| T7 | Default: email only for order and payment events. |
| T8 | Sentry (`SENTRY_DSN`) plus an uptime check on `/api/health`. |
| L1 | Domains later, once bought. |
| L2 | The seed's school, the University of Lagos (`unilag.edu.ng`), is the first campus. |
| L3 | Default: a closed beta with invited students first. |

### Round 2

| ID | Answer |
|---|---|
| DL1 | A dispatch that is part of the app. A buyer can opt for pickup from the seller instead, only where the seller allows it and has entered their location. |
| DL2 | The buyer enters an address. |
| DL3 | The seller calls the dispatch from the app. The dispatch sees the seller's address and the buyer's address and phone number, picks up from the seller and delivers to the buyer (C1). The buyer gets an order code; the dispatch enters it when the buyer collects the items. |
| DL4 | The buyer pays a delivery fee, shown at checkout: flat for addresses on campus. Off-campus delivery is arranged outside the app. |
| DL5 | Handover is confirmed by the buyer's code, entered by the seller (pickup) or the dispatch. |
| DL6 | Only the dispatch can mark an order delivered before the buyer confirms; an admin is alerted after 5 days. The case is DL6b. |
| DL7 | Yes: 3 days after payment, or the order is cancelled and refunded. What has to happen by then: DL7b. |
| DL8 | A no-show is reported; an admin decides, including whose fault it is. |
| DL9 | Keep the station and agent code; the admin Stations screen stays visible. |
| DL10 | The delivery change comes first, as a Phase 4 rework, then Phase 5. |
| P6a–c | See P6. |
| P5 | Behind an environment variable. |
| R1a | Admins can edit the trust-score weights, platform fee, deadline, low-stock level and report threshold. |
| R1b | A change takes effect at the next nightly recalculation. |
| M4a | Both: sellers confirm the item isn't prohibited before publishing, and listings matching banned words wait for admin review. |
| M4b | A "Prohibited item" report hides the listing at once, pending review. (The 10-point penalty given here was replaced by suspension in round 3, M4d.) |
| T1 | See T1 above. |
| T3 | Confirmed. |
| T4 | Email, phone and WhatsApp. |
| L2 | UNILAG, as seeded. |

### Round 3

| ID | Answer |
|---|---|
| C1 | Confirmed: the rider picks up from the seller and delivers to the buyer. |
| C2 | Confirmed: pickup from the seller has no delivery fee. |
| C3 | Confirmed, then replaced by M4d: a confirmed prohibited item means suspension, not points. |
| C4 | Confirmed: email-and-password buyers confirm their email with the 6-digit code before buying; Google accounts skip it. |
| DX1 | An admin invites riders by email. |
| DX2 | Every available rider at the campus sees a new job and the first to accept takes it. Admins are alerted if nobody accepts within 5 hours. |
| DX3 | Delivery fees go to the platform; you pay riders outside the app. |
| DX4 | Doesn't apply (DX3). |
| DX5 | At the seller, the rider enters or scans the seller-order code (`CM-XXXXXX`), which records that the parcel is with the rider. |
| DX6 | A parcel lost or damaged with the rider: an admin decides each case. |
| DF1 | An admin sets the flat on-campus fee per campus, on the settings screen. |
| DF2 | Not answered (round 4). |
| DF3 | The buyer picks a place from a campus list an admin keeps. No room field: the buyer's phone number is how the rider finds them, calling on arrival. Where the phone comes from: round 4 (PH2). |
| DF4 | Off-campus delivery is done by the dispatch too, but no fee appears in the app: it depends on distance and is settled outside the app. |
| DF5 | The delivery fee is refunded only if no rider trip happened. When a trip counts: round 4 (DF5a). |
| DM1 | The method is chosen per store. |
| PH1 | The phone number must be on the profile before checkout. |
| SA1 | Every seller enters an address and phone before publishing; "Allow pickup from me" is a separate switch that uses the same address. |
| SA2 | Before payment a buyer sees only the seller's area; the full address after. |
| SA3 | Pickup from the seller, after payment: the buyer sees the seller's address and phone; the seller sees only the buyer's display name. |
| DL7b | Within 3 days of payment the rider must have picked the parcel up. |
| DL7c | A buyer who doesn't collect from the seller in time: the order is cancelled automatically as the buyer's fault, with the P6 fee deducted. The number of days: round 4. |
| DL6b | The 5-day alert: the rider has had the parcel for 5 days and no code has been entered. A rider can't mark an order delivered without the code. |
| G1 | A buyer can change school in their profile; the cart empties. |
| G2 | A buyer without a school email who wants to sell adds a school email, confirms it with a code, then becomes a seller. |
| G3 | Google sign-in is for buyer accounts only; sellers always use email and password. |
| G4 | A school that isn't listed goes to the waitlist, as now. |
| M4c | Admins edit the banned-word list on the settings screen, starting from your M5 list. |
| M4d | The penalty for listing a prohibited item is suspension, not a point deduction. |

### Round 4

| ID | Answer |
|---|---|
| DF2 | One delivery fee for the whole order. |
| PH2 | The phone is typed at checkout next to the place and saved to the profile. This replaces PH1. |
| DF4a | The buyer types the off-campus address. |
| SA4 | The seller types both the area and the full address. |
| C9 | Confirmed: the phone is needed only when a store is delivered by dispatch. |
| C10 | Confirmed: on-campus dispatch shows at checkout only once that campus has a fee. |
| DF5a | A rider trip has happened once the rider picks the parcel up. |
| DL7d | 3 days with no pickup: the seller's fault only if they never called the dispatch; otherwise nobody's (the platform absorbs the fee, no trust loss). |
| DL7c | A buyer has 5 days to collect from the seller. |
| DX7 | Rider accounts can't buy. |
| DX8 | The seller and the buyer see the rider's name only. |
| C5 | Confirmed: after the 5-hour alert, or if a rider drops a job, an admin can assign or reassign a rider. |
| C6 | Confirmed: before accepting, riders see only the two areas; the full addresses and the buyer's phone after. |
| C7 | Dispatch: the buyer sees their code once the rider has the parcel. Pickup from the seller: as soon as it's paid. |
| C8 | Confirmed: "Report a problem" is open from payment until 48 hours after handover. Before handover it alerts admins; after, it's a dispute that holds the payout. |
| M4e | Suspension for a confirmed prohibited item is automatic, and lasts until an admin lifts it. |
| M4f | It doesn't apply to a listing the banned-word check held before it went live. |

### Round 5

| ID | Answer |
|---|---|
| DF6 | One destination per order: every store delivered by dispatch goes to the same place or address. |
| DF7 | One job per order: one rider collects from every store, then delivers once. |
| DF8 | The job opens to riders automatically; sellers don't call the dispatch (this replaces "the seller calls the dispatch" in DL3 and DX2). Each seller gets a timeframe for the rider's arrival, so the item is ready for pickup. |
| DF9 | No refund of the delivery fee once at least one item in the order has been picked up. |

## Open questions (round 6)

The automatic job raises these. Phases 5 and 6 wait on them; Phase 4b doesn't.

- **DF8a (Phase 6).** Confirm: the job opens automatically for every order delivered by dispatch, including orders
  from a single store.
- **DF8b (Phase 6). Who sets the seller's timeframe:** **a** the rider picks an arrival window for each store when
  accepting, and can update it · **b** the app gives a fixed window after the rider accepts (say how many hours) ·
  **c** other.
- **DF11 (Phase 6). A store isn't ready, or the seller isn't there, when the rider arrives:** **a** the rider reports
  it and carries on with the rest; that store's order is cancelled and refunded as the seller's fault · **b** the rider
  reports it, delivers the rest now, and comes back for that store before its 3-day deadline, at no extra fee; if it's
  still not ready by then, it's cancelled as the seller's fault · **c** the rider waits, and delivers everything
  together once that store is ready, within its 3-day deadline.
- **DF10 (Phase 6). The buyer's code when one delivery covers several stores:** **a** one code for the whole
  delivery, shown once the rider has every parcel still in the order · **b** one code per store, each shown once the
  rider has that store's parcel.
- **C11 (Phase 5).** Confirm, replacing DL7d (which assumed sellers call the dispatch): when a store's parcel isn't
  picked up within 3 days, it's the seller's fault only if the rider reported the store not ready or the seller not
  there (DF11). Otherwise, for example when no rider accepted or the rider didn't come, it's nobody's fault: the
  platform absorbs the fee and the seller keeps their points.
- **DF9a (Phase 5).** Confirm: the delivery fee comes back only when the whole order is refunded before anything was
  picked up. If one store is refunded and the rest is still delivered, the fee isn't refunded.

### Reply block (round 6)

```
DF8a:
DF8b:
DF11:
DF10:
C11:
DF9a:
```
