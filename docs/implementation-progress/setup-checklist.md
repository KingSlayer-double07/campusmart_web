# What you need to set up: Phases 5–10, launch, and what's still open

Last updated 2026-10-17, after Phase 4, the pnpm switch and your decision rounds 1–3. Everything here needs you: an account, a key, a dashboard
setting or a person. The choices themselves (fees, deadlines, rules) are in [decisions-needed.md](decisions-needed.md),
each with an ID and a default. Code work isn't listed. Automated tests never touch real services (Paystack stays mocked with nock); the
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
- [ ] Ask Paystack support whether your account can get a dedicated **OPay / PalmPay** channel. They stay hidden
      until you confirm it and set `PAYSTACK_WALLET_CHANNELS=true` (decision P5).
- [ ] Start **business verification** now (registered business documents). Live keys and live Transfers need it, and
      it takes time.

### 1.2 Staging (recommended, for a real test payment and real emails)
- [ ] **Database**: a Neon `dev` or `staging` branch → `DATABASE_URL` (pooled) and `DIRECT_URL` (direct). You chose to
      move to Neon after all phases; staging is the one exception that needs a hosted database (the API host's own
      Postgres would also do).
- [ ] **API host** with a process that stays up (the expiry, escrow and deadline jobs need it): Render, Railway or
      Fly.io, in a region near Nigeria or your Neon region.
  - Connect the GitHub repo, root directory `backend`, deploy the `backend` branch.
  - Build: `pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm run build`.
  - Start: `pnpm exec prisma migrate deploy && node dist/main` (migrations on every start; works on every plan).
  - **Not Render's free instance type.** It sleeps after 15 minutes without traffic, so the background jobs stop, and
    since September 2025 it blocks outbound SMTP (ports 25, 465 and 587), so no email can be sent: sign-up codes
    time out. Starter, the lowest paid type, has neither limit. (Found on the first staging deploy, 2026-10-19.)
- [ ] **Frontend**: a Vercel project from the repo root, `backend` branch, `API_ORIGIN=https://<staging-api>`.
- [ ] **API variables**:
  - `APP_URL` and `FRONTEND_URL`: the Vercel URL (Paystack sends buyers back there).
  - `JWT_SECRET`: a new random value, 32+ characters (`openssl rand -base64 48`).
  - `PAYMENTS_ENABLED=true`, `PAYSTACK_SECRET_KEY` (test), plus `CLOUDINARY_*` and `MAIL_*`.
  - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`; then run `pnpm exec prisma db seed` once.
- [ ] `NODE_ENV=production` on staging needs `MAIL_*` and `CLOUDINARY_*` first (the API refuses to start without
      them). Otherwise run staging as `development` (Swagger on, cookies not marked secure).
- [ ] Send me the two URLs and allow them in network access.

Without staging I still build and test Phase 5 fully against mocks. The real test payment then becomes a MANUAL item.

### 1.3 Decisions about money
Moved to [decisions-needed.md](decisions-needed.md), group P (fees, payouts, refunds, admin alerts) and F1 (drop-off
deadline). The 48-hour dispute window is locked (D11).

### 1.4 Email (`MAIL_*`, open since Phase 1)
- [ ] An SMTP provider (Resend, Postmark, Zoho, Brevo…) and a sending domain with its SPF, DKIM and DMARC DNS records.
- [ ] `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` (e.g. `CampusMart <orders@yourdomain>`). Phase 5
      emails sellers about new orders. Phase 1's sign-up codes need it in production.

### 1.5 Cloudinary (open since Phase 3)
- [ ] An account → `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Real photo uploads and
      the private student-ID photos depend on it.

## 2. Before Phases 4b and 6 (delivery and dispatch)

Pickup stations are replaced by delivery (decisions F2 and DL1–DL10); see [execution-plan.md](execution-plan.md).

- [ ] **Campus places** for UNILAG (halls, faculties, gates) and the **flat on-campus delivery fee**. You enter them
      in `/admin/places` and `/admin/settings` (live since Phase 4b); until then the seed has placeholders.
- [ ] **Riders**: the email of each person you want as a dispatch rider. An admin invites them from
      `/admin/riders` (Phase 6). The invite email prints to the console until email is set up (1.4).
- [ ] **An Android phone with Chrome** to try the rider app's QR scanning (the browser's barcode reader). On an
      iPhone the rider types the code instead.
- Pickup stations and agents stay in the code for later; `/admin/stations` still works but nothing uses it.

## 3. Phases 7–9 (no new accounts, only decisions)

All in [decisions-needed.md](decisions-needed.md): A1–A2 (analytics), R1–R5 (trust score, stores, reviews), M1–M7
(admins, moderation, prohibited items).

## 4. Before Phase 10

- [ ] **Google sign-in** (decided: build it, for buyers only):
  - A Google Cloud project, an OAuth consent screen (app name, support email, logo, your domains), and a Web OAuth
    client.
  - Redirect URIs `https://<frontend>/api/auth/google/callback` and `http://localhost:3000/api/auth/google/callback`.
  - Keys go in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (new variables, not in the guide's list), set in the
    environment settings, never in chat. `GOOGLE_REDIRECT_URI` is optional (default `APP_URL/api/auth/google/callback`).
  - Built in Phase 10; the button stays hidden until both keys are set. Then do the MANUAL check in
    [Phase 10](phase-10-remaining.md#manual-google-sign-in-for-you-once-the-oauth-client-exists).
- [ ] **Support contacts** (T4): a support email, phone and WhatsApp number, set in production as `SUPPORT_EMAIL`,
      `SUPPORT_PHONE` and `SUPPORT_WHATSAPP`. Each one left unset shows "coming soon".
- [ ] **Terms and Privacy text**: drafted in [`docs/legal/terms-and-privacy.md`](../legal/terms-and-privacy.md)
      (delivery and pickup, escrow, the 48-hour window, refunds and the fault rules, prohibited items, NDPR). You
      (ideally with a lawyer) fill in the `[brackets]`, confirm the clauses listed in Phase 10, deviation 12, and give
      the effective date.
- [ ] **Monitoring** (T8): a Sentry project (`SENTRY_DSN`, optionally `SENTRY_ENVIRONMENT`) and an uptime check on
      `https://<api-host>/api/health` (UptimeRobot, Better Stack); it answers 503 when the database is unreachable.
- [x] **Service worker build** (found in Phase 10). **Decided 2026-10-19: `next build --webpack`.** You set it on Vercel,
      and the repo's `pnpm run build` uses it too, so CI builds the same way. Vercel's command override can go.
- Decided, nothing to set up: no web push (T2); phone verification stays off (T3).

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
| 4 | Platform fee and OPay / PalmPay: decisions P1 and P5 | you |
| 9 | MANUAL: look over the admin console on a phone and a laptop | you |

Resolved since the earlier notes:
- CI runs on GitHub on every push.
- **pnpm only (2026-10-17).** The npm lockfiles are gone and CI installs with `pnpm install --frozen-lockfile`. The
  switch moved about 40 dependencies to newer minor versions; the lint, test-helper and generated-type fixes that
  followed are on `backend`.

## Variables at a glance

| Variable | Where | Needed by |
|---|---|---|
| `PAYSTACK_SECRET_KEY`, `PAYMENTS_ENABLED=true` | API | Phase 5 (test key), launch (live key) |
| `PLATFORM_FEE_BPS` | API | 0 (P1); admins change it in `/admin/settings` from Phase 5 |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | API | now (Phase 3 check) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | API | staging and launch (S1, S4) |
| `DATABASE_URL`, `DIRECT_URL` | API | staging, launch (Neon) |
| `JWT_SECRET` | API | staging, launch (a different one each) |
| `APP_URL`, `FRONTEND_URL` | API | staging, launch |
| `API_ORIGIN` | Vercel | staging, launch |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | API (seed) | staging, launch |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (optional) | API | Google sign-in (built in Phase 10) |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` (optional) | API | launch (Sentry, T8) |
| `PAYSTACK_WALLET_CHANNELS` | API | once Paystack confirms OPay / PalmPay |
| `PAYSTACK_WEBHOOK_IPS` | API | optional: defaults to Paystack's three published webhook IPs; checked in production only |
| `DROP_OFF_DEADLINE_DAYS`, `BUYER_COLLECT_DAYS` | API | optional: defaults 3 and 5 (DL7b, DL7c); admins change the first in `/admin/settings` |
| `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SUPPORT_WHATSAPP` | API | production (T4) |
