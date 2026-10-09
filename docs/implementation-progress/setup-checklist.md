# What you need to set up: Phases 5–10, launch, and what's still open

Last updated 2026-10-09, after Phase 4. Everything here needs you: an account, a key, a dashboard setting, a person or
a decision. Code work isn't listed. Automated tests never touch real services (Paystack stays mocked with nock); the
real accounts are for checking each flow end to end on a real setup.

## 0. How to hand things over

- **Keys and passwords never go in the chat.** Add them in this cloud environment's settings (the environment menu
  in the session's title bar → Edit) as environment variables, using the names below. A new session picks them up.
- **Network access.** This environment's network policy currently refuses these hosts (checked 2026-10-09, proxy
  403). Add them under Allowed domains:
  - `api.paystack.co` (Phase 5)
  - `api.cloudinary.com`, `res.cloudinary.com` (Phase 3 check, Phase 5 on)
  - your staging hosts, e.g. `<name>.onrender.com` and `<name>.vercel.app`, so I can check deployments
  - `accounts.google.com`, `www.googleapis.com` (Phase 10, Google sign-in)
- **Two limits no setting fixes:**
  - This container has no public address, so Paystack's webhook can't reach it. A real test payment from start to
    finish needs a **staging API** (section 1.2).
  - Only HTTPS leaves this container, so SMTP email can't be sent from here. Real emails are checked on staging.

## 1. Before Phase 5 (payments and escrow)

### 1.1 Paystack
- [ ] A Paystack account. Test mode is enough to build.
- [ ] Test secret key → `PAYSTACK_SECRET_KEY` (`sk_test_…`). The public key isn't used (guide appendix).
- [ ] Dashboard → Settings → Preferences: **Transfers on**, and **OTP off for transfers made through the API**
      (guide 5.5). Payouts can't go out automatically otherwise.
- [ ] Webhook URL (test mode): `https://<staging-api>/api/payments/webhook`, once staging exists. Call the API host
      directly, not through Vercel, so the signed body arrives untouched.
- [ ] Ask Paystack support whether your account can get a dedicated **OPay / PalmPay** channel. Until they confirm,
      those two options pay by bank transfer or USSD (guide 5.1). Or tell me to hide them.
- [ ] Start **business verification** now (registered business documents). Live keys and live Transfers need it, and
      it takes time.

### 1.2 Staging (recommended, for a real test payment and real emails)
- [ ] **Database**: a Neon `dev` or `staging` branch → `DATABASE_URL` (pooled) and `DIRECT_URL` (direct). You chose to
      move to Neon after all phases; staging is the one exception that needs a hosted database (the API host's own
      Postgres would also do).
- [ ] **API host** with a process that stays up (the expiry, escrow and deadline jobs need it): Render, Railway or
      Fly.io, in a region near Nigeria or your Neon region.
  - Connect the GitHub repo, root directory `backend`, deploy the `backend` branch.
  - Build: `npm ci && npx prisma generate && npm run build`.
  - Release: `npx prisma migrate deploy`. Start: `node dist/main`.
- [ ] **Frontend**: a Vercel project from the repo root, `backend` branch, `API_ORIGIN=https://<staging-api>`.
- [ ] **API variables**:
  - `APP_URL` and `FRONTEND_URL`: the Vercel URL (Paystack sends buyers back there).
  - `JWT_SECRET`: a new random value, 32+ characters (`openssl rand -base64 48`).
  - `PAYMENTS_ENABLED=true`, `PAYSTACK_SECRET_KEY` (test), plus `CLOUDINARY_*` and `MAIL_*`.
  - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`; then run `npx prisma db seed` once.
- [ ] `NODE_ENV=production` on staging needs `MAIL_*` and `CLOUDINARY_*` first (the API refuses to start without
      them). Otherwise run staging as `development` (Swagger on, cookies not marked secure).
- [ ] Send me the two URLs and allow them in network access.

Without staging I still build and test Phase 5 fully against mocks. The real test payment then becomes a MANUAL item.

### 1.3 Decisions about money
- [ ] **Platform fee** (`PLATFORM_FEE_BPS`, now 0; 100 = 1%). It comes out of the seller's payout.
- [ ] **Paystack's processing fee**: the guide has the platform absorb it at launch. Keep that?
- [ ] **Dispute window** of 48 hours after collection (`ESCROW_DISPUTE_WINDOW_HOURS`) and **drop-off deadline** of 3
      days after payment (`DROP_OFF_DEADLINE_DAYS`). Keep both?
- [ ] **Who gets admin alerts** (a payment for the wrong amount, failed payouts, a parcel locked after 5 wrong codes):
      which email address or addresses.

### 1.4 Email (`MAIL_*`, open since Phase 1)
- [ ] An SMTP provider (Resend, Postmark, Zoho, Brevo…) and a sending domain with its SPF, DKIM and DMARC DNS records.
- [ ] `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` (e.g. `CampusMart <orders@yourdomain>`). Phase 5
      emails sellers about new orders. Phase 1's sign-up codes need it in production.

### 1.5 Cloudinary (open since Phase 3)
- [ ] An account → `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Real photo uploads and
      the private student-ID photos depend on it.

## 2. Before Phase 6 (fulfilment and pickup agents)

- [ ] **Real pickup stations** for your first campus: name, address, contact name and phone, opening hours. The seed
      has placeholders; you can enter real ones at `/admin/stations` now.
- [ ] **Pickup agents**: who staffs each station. Each agent needs an account made with a school email at that
      campus (D7); an admin then makes them a pickup agent for a station (Phase 9 Users screen). Decide whether staff
      without a school email can be agents; today they can't sign up.
- [ ] **An Android phone with Chrome** to try the agent app's QR scanning (the browser's barcode reader). On an
      iPhone the agent types the code instead.
- [ ] **Seller penalties**: what a seller cancellation or a missed drop-off costs in trust score (the guide's Phase 8
      formula takes 10 points per cancellation in 90 days).

## 3. Phases 7–9 (no new accounts, only decisions)

- [ ] Phase 7: low-stock alert at 3 left or fewer (`LOW_STOCK_THRESHOLD`). Keep?
- [ ] Phase 8: trust-score weights (50 for rating, 30 for completed orders, 20 for being verified, −10 per
      seller-caused cancellation) and featured-store ranking (rating × reviews, then recent paid orders). Keep?
- [ ] Phase 9:
  - Who else is an admin, and their emails.
  - The reasons a moderator can pick when rejecting a listing.
  - How many buyer reports flag a listing (guide: 3, or 1 for a prohibited item).
  - Your list of prohibited items.

## 4. Before Phase 10

- [ ] **Google sign-in**, or decide to leave it out:
  - A Google Cloud project, an OAuth consent screen (app name, support email, logo, your domains), and a Web OAuth
    client.
  - Redirect URIs `https://<frontend>/api/auth/google/callback` and `http://localhost:3000/api/auth/google/callback`.
  - Keys go in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (new variables, not in the guide's list).
- [ ] **Support contacts**: a real support inbox and phone number for Help → Email support / Call us (the screens show
      made-up ones today).
- [ ] **Web push** (optional): yes or no. If yes, I generate the VAPID keys and you store `VAPID_PUBLIC_KEY`,
      `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` your support address).
- [ ] **Phone verification** stays off unless you want an SMS provider (e.g. Termii: an account and API key).
- [ ] **Terms and Privacy text**: escrow, the 48-hour dispute window, refunds, and what's kept when an account is
      deleted (NDPR). I can draft it; you (ideally with a lawyer) approve it.
- [ ] **Monitoring** (optional): an uptime check on `/api/health` (UptimeRobot, Better Stack) and error alerts
      (Sentry: `SENTRY_DSN`, or your host's log alerts).

## 5. Before launch (guide's deployment section and launch checklist)

- [ ] **Domains** for the app and the API (e.g. `campusmart.ng` and `api.campusmart.ng`), with DNS access.
- [ ] **Production**: Neon `main` branch (`migrate deploy` + seed), the API host's production service, Vercel
      production; the same variables as staging with live values.
- [ ] **Paystack live**: business verification done, live keys, live webhook URL, Transfers on, enough balance for
      payouts.
- [ ] **Real seed data**: the first school's name and email domains, its stations and agents, and a strong
      `SEED_ADMIN_PASSWORD`.
- [ ] **Proxy hops** (open since Phase 0): once the API host is chosen, tell me if anything (a load balancer) sits
      between Vercel and the API, so rate limits see the real visitor.
- [ ] **Branch protection** (open since Phase 0): require CI on `master` and `develop`, and on `backend` while it's
      the integration branch.
- [ ] **A real-card test order, then refunded.**
- [ ] **Error alerts reach you.**
- Already in code: Swagger is off in production, cookies are `secure` in production, and a production API won't
  start without `MAIL_*` and `CLOUDINARY_*`.

## 6. Still open from Phases 0–4 and 9

| Phase | Item | Who |
|---|---|---|
| 0 | Branch protection; proxy hops once the host is known (section 5) | you |
| 1 | MANUAL: sign out on phone A leaves phone B signed in; "Sign out other devices" signs B out (two real phones) | you |
| 1 | Production SMTP (section 1.4) | you |
| 2 | Real seed data and the move to Neon: your call, after all phases | you |
| 3 | Cloudinary (section 1.5), then two MANUAL checks: a real listing upload, and a student-ID photo that only admins can open, through a link that stops working after 10 minutes | you |
| 4 | Platform fee, OPay / PalmPay (section 1) | you |
| 9 | MANUAL: look over the admin console on a phone and a laptop | you |
| – | **Two lockfiles**: `pnpm-lock.yaml` (added on `backend`) sits next to `package-lock.json`. Hosts pick a package manager from the lockfile, so a deploy could install with pnpm while CI uses npm and get different versions. Pick one: I'd keep npm and delete `pnpm-lock.yaml`, or switch CI and the lockfile to pnpm. | you decide, I do it |

Resolved since the earlier notes: CI now runs on GitHub on every push (the latest run on `backend` is green).

## Variables at a glance

| Variable | Where | Needed by |
|---|---|---|
| `PAYSTACK_SECRET_KEY`, `PAYMENTS_ENABLED=true` | API | Phase 5 (test key), launch (live key) |
| `PLATFORM_FEE_BPS` | API | your decision, before launch |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | API | now (Phase 3 check) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | API | Phase 5 (staging), launch |
| `DATABASE_URL`, `DIRECT_URL` | API | staging, launch (Neon) |
| `JWT_SECRET` | API | staging, launch (a different one each) |
| `APP_URL`, `FRONTEND_URL` | API | staging, launch |
| `API_ORIGIN` | Vercel | staging, launch |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | API (seed) | staging, launch |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | API | Phase 10 (if wanted) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | API | Phase 10 (if wanted) |
| `SENTRY_DSN` | API | optional |
