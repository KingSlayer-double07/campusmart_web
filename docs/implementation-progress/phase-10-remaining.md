# Phase 10: remaining features

Branch `feat/phase-10-remaining` (off `backend` at `0872640`). Status: DONE pending manual checks (Google sign-in
with a real Google account, once you have the OAuth client) and your approval of the Terms and Privacy text.

The work came in four parts, each committed and pushed on its own:

| Part | What | Commits |
|---|---|---|
| 10.1 | Buyers without a school email, choosing a school, becoming a seller | `b478fbc` |
| 10.2 | Google sign-in for buyers | `1e55184` |
| 10.3 | Notifications, profile, support and account deletion | `587305b`, `530321f`, `61092e1`, `942048b`, `40baa39`, `2ebba92` |
| 10.4 | Health check, Sentry, the guide's clean-ups, Terms and Privacy draft | `eb5fefa`, `2c5a836`, `5200dc1` |
| Gate | A Phase 1 test brought in line with T1; browser walk | `8093482`, `55367e2` |

## 1. Checklist

### The guide's Phase 10 table

- [x] **Notifications:** `GET /notifications?cursor`, `GET /notifications/unread-count`, `POST /notifications/read
  { ids? }` (no ids marks all read), `GET/PATCH /users/me/notification-preferences`. The notifications page reads real
  data; a bell badge polls the unread count every 60 seconds and on focus. Preferences are JSON on `User`; email only
  for order and payment events by default.
  *e2e `phase10-account-features` › notifications (your own only, newest first, the cursor, the unread count,
  marking some then all read without touching another user's, bad ids 400, signed out 401; order emails off while
  admin alerts still go); unit `inbox.service.spec`; Vitest `NotificationBell`, `NotificationsInbox`.
  Walk: "The home bell shows the unread count", "Turning order emails off is saved", "Mark all as read".*
- [x] **Profile:** `PATCH /users/me/profile { username, firstName, lastName, phone }`, on the buyer profile and,
  through "Personal details", the seller profile. The email isn't editable; `username` is unique (409
  `USERNAME_TAKEN`) and matches `^[a-z0-9_]{3,20}$`.
  *Unit `users.service.spec` (409, never writes email or school); e2e `phase10-account-features` › profile
  (409 `USERNAME_TAKEN`, the email never changes); Vitest
  `app/profile/edit/page.test.tsx` (including the seller return and the fix below). Walk: "A username someone else
  has is refused", "The profile saves…", "A seller edits their name, username and phone from their own profile".*
- [x] **Support and reports:** `POST /support/reports { type, message, screenshotUrl? }` (no `listingId`, see
  deviations); `help/report` and `help/email_support` wired; screenshots upload through 3.1; admins see them in
  `/admin/reports` and are alerted.
  *e2e `phase10-account-features` › support (contacts null until set; a report reaches the queue and alerts
  admins; a screenshot from outside our Cloudinary is 400 `INVALID_IMAGE`; signed out 401); Vitest
  `help/report/page.test.tsx`. Walk: "The report is saved for the admins", "The report shows in /admin/reports",
  "Admins were alerted about the report".*
- [x] **Seller verification:** done in Phase 3 (slice B): `POST /users/me/verify` takes an authenticated upload and the
  seller profile has the "Get verified" card. Reviewed in `/admin/verifications`. See
  [Phase 3, 3.3](phase-3-listings.md).
- [x] **Account deletion:** `DELETE /users/me { password }`, blocked while seller orders or payouts are open;
  otherwise personal data is anonymised and order records kept (T6).
  *e2e `phase10-account-features` › account deletion (wrong password 401; anonymised row; signed out; order kept
  with its address and phone cleared; can't sign in again; audited; an order on its way or an unpaid payout 409
  with counts; a Google account confirms with `DELETE`; an admin gets `CANNOT_DELETE`); unit `account.service.spec`
  (15). Walk: the whole flow on a phone.*
- [x] **Google sign-in:** `GET /auth/google`, `GET /auth/google/callback`; the button shows again when Google is
  configured. Linked to an existing account by email. Buyers only (G3), any verified Google email (T1 replaces
  the guide's school-domain rule for buyers).
  *e2e `phase10-google` (8, with Google answered by nock): state and PKCE; a new Google user becomes a confirmed
  buyer with no school yet; a school Google account gets its school; linking by email, then by Google id; sellers,
  admins and riders sent back to their password; a suspended buyer refused; a forged or replayed callback, a failed
  exchange and an unverified Google email refused; another account's school email can't be taken. Unit
  `google-oauth.service.spec`, `safe-next` (the `next` path stays same-origin). Walk: "Google isn't offered while it
  isn't configured". MANUAL below.*
- [x] **Phone verification:** deferred; the page is gone (T3). *Walk: "The phone verification page is gone".*
- [x] **Health check:** `GET /api/health` with a database ping through `@nestjs/terminus`.
  *Unit `health.controller.spec`; e2e `app.e2e-spec` (200, `no-store`, 503 `UNHEALTHY` without the driver's
  message); [`sentry-health-check.md`](evidence/phase10-remaining/sentry-health-check.md) against a dead database.
  Walk: "GET /api/health answers through the frontend".*
- [x] **Web push (optional):** not built, by your decision T2.

### Clean-ups to do alongside

- [x] Remove one of the two offline pages; keep `/~offline`, which `sw.ts` uses. *`app/offline` deleted; walk
  "/offline is gone" (404), "/~offline renders without the broken emoji".*
- [x] Remove the manual registration in `ServiceWorkerRegister.tsx` if Serwist already registers the worker.
  *Now `ServiceWorkerCleanup`, which never registers (Vitest). Checked in Chromium: one registration, made by
  Serwist. But see the finding below: today's build has no service worker at all.*
- [x] Remove `console.log` from `productItem/[id]/page.tsx`, `ServiceWorkerRegister.tsx` and `PWAInstallPrompt.tsx`.
  *`grep -rn "console\.\(log\|debug\)" app lib` finds none outside tests (productItem had none left).*
- [x] Delete `app/components/data.ts` product entries once nothing imports them. *Already done in Phase 3; the file
  holds only the home banner, imported by `FeaturedBanner.tsx`.*
- [x] Rename `middleware.ts` to `proxy.ts` if Next.js 16 warns. *It warned ("The "middleware" file convention is
  deprecated"); now `proxy.ts` with `export function proxy`, and the warning is gone from the build log.
  Vitest `proxy.test.ts`; walk "proxy.ts still sends a signed-out visitor to sign-in".*

### The plan's additions ([execution-plan.md](execution-plan.md#phase-10-remaining-features))

- [x] A buyer signs up with any email and picks their school during onboarding; email-and-password accounts confirm
  with the code (C4); an unlisted school goes to the waitlist (G4); sellers still need a school email (T1).
  *e2e `phase10-accounts` (10); Vitest `redirects`, `SchoolGate`, `onboarding/school`. Walk: sign-up with
  `walk.buyer.<n>@gmail.com` → code → "Which school are you at?" → University of Lagos.*
- [x] Changing school empties the cart (G1). *e2e; walk "Choosing another school warns that the cart will be
  emptied", "The school changed and the cart is empty".*
- [x] Becoming a seller with a confirmed school email (G2). *e2e (a code, then a seller there; one step when it's
  already confirmed; a non-school email, one another account uses and an unconfirmed account refused); walk "The buyer is now a seller at the school email's school…".*
- [x] Google sign-in for buyers only (T1, G3). *As above.*
- [x] Notifications with email only for order and payment events (T7); admin alerts always email (P10).
- [x] Profile editing.
- [x] Support contacts from `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SUPPORT_WHATSAPP`, each "coming soon" while unset
  (T4). *Walk: "Call us says "coming soon"…", "Email support says "coming soon"…".*
- [x] Account deletion: personal details anonymised, orders kept 6 years (T6).
- [x] Health check, and Sentry (T8). *Sentry is on the API; the uptime monitor is yours to create.*
- [x] Phone verification stays hidden (T3); no web push (T2).
- [x] The guide's clean-ups, and the agent placeholder left unlinked. *Nothing links to `/agent`; only a
  `PICKUP_AGENT` account lands there, and its copy no longer promises Phase 6.*
- [x] Terms and Privacy drafted (T5): delivery and pickup, escrow and the 48-hour window, refunds and the fault
  rules, the prohibited list, NDPR. *[`docs/legal/terms-and-privacy.md`](../legal/terms-and-privacy.md); Vitest
  `legal.test.ts`, `help/terms/page.test.tsx`; walk "Sign-up shows the Terms, marked as a draft", "Help → Terms &
  Privacy…". Your approval is outstanding.*

### Gate

- [x] Backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm run build`, `pnpm test`,
  `pnpm run test:e2e` pass.
- [x] Frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build` pass.
- [x] `gen:api` produces no diff (CI re-checks); `prisma migrate diff ... --exit-code` is clean.
- [x] GitHub CI is green on the branch.
- [x] Every new endpoint meets the definition of done (section 3).
- [x] Browser walk with screenshots: 45/45.
- [ ] MANUAL: Google sign-in with a real Google account, once the OAuth client exists (steps below).
- [ ] Your approval of the Terms and Privacy text.

From the guide's launch checklist, this phase covers two items, still open until you act:

- [ ] Error alerts from API logs (the host's log alerts, or Sentry) reach you. *Built; needs `SENTRY_DSN`.*
- [ ] Terms and Privacy overlays describe escrow, the 48-hour dispute window and refunds. *Drafted; needs your
  approval.*

## 2. Changes

### 10.1 Buyers without a school email (T1, G1, G2, G4)

- **Migration `20261022090000_accounts`:**
  - `User.schoolEmail` (unique) and `schoolEmailVerifiedAt`, backfilled from the email for every buyer and seller
    who already has a school.
  - `pendingSchoolEmail`, `notificationPrefs` (JSON), `deletedAt`.
  - The `SCHOOL_EMAIL` code purpose.
- **Sign-up:** buyers may use any email; sellers still get 422 `INSTITUTION_NOT_SUPPORTED`. The "already
  registered" check covers both `email` and `schoolEmail`. Confirming a school-domain email also confirms it as the
  school email.
- **`backend/src/account/`:**
  - `PATCH /users/me/institution`: buyers only; a switched-off school is refused; a different school empties the
    cart.
  - `POST /users/me/school-email` and `POST /users/me/school-email/verify`: a 6-digit code to a school email, then
    the buyer becomes a seller at that school. Limited like the other codes.
  - `POST /users/me/become-seller`: one step when the school email is already confirmed.
- **Frontend:**
  - `SchoolPicker`.
  - `/onboarding/school`, plus `SchoolGate` in the layout, which sends a signed-in buyer without a school there.
  - `/profile/school`, which warns when the cart will be emptied.
  - `/profile/sell`.
  - `afterSignIn` asks for a school before anything else.

### 10.2 Google sign-in for buyers (T1, G3)

- **`backend/src/auth/google/google-oauth.service.ts`:**
  - Builds the Google URL with a random state and a PKCE challenge, both kept in a short-lived httpOnly cookie.
  - Exchanges the code and reads `userinfo`. A Google account without a verified email is refused.
- **`AuthService.googleSignIn`:**
  - Finds the user by Google id, else by email, else creates a buyer. Google accounts skip the email code (C4).
  - Sellers, admins and riders are sent back to their password with a reason.
- **Routes and config:**
  - `GET /auth/providers` tells the app whether Google is configured.
  - `GET /auth/google?next=` and `GET /auth/google/callback`.
  - Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optionally `GOOGLE_REDIRECT_URI` (default
    `APP_URL/api/auth/google/callback`).
- **Frontend:**
  - "Continue with Google" on the buyer forms, shown only when configured.
  - `/onboarding/google` finishes sign-in.
  - The sign-in page shows the reason when Google sends someone back.

### 10.3 Notifications, profile, support, account deletion

- **Notifications:**
  - Inbox routes and preferences.
  - `notify()` sends email for order and payment events only, unless the user turned order emails off.
  - Admin alerts always send email (P10).
  - The bell on the home and seller dashboards.
  - The buyer and seller notification screens replace the sample ones.
- **Profile:**
  - `PATCH /users/me/profile` takes username, names and phone; blank clears a field.
  - `/profile/edit`, also reached from the seller profile's "Personal details".
  - The form fills itself once per user, so a session refresh no longer wipes what was typed (found by the walk;
    `40baa39`).
- **Support:**
  - `GET /support/contacts` and `POST /support/reports`.
  - Uploads gain a `SUPPORT` purpose.
  - Admin reports show the screenshot link.
  - `help/report`, `help/email_support` and `help/call_us` use real data.
- **Account deletion (T6):**
  - Personal details are anonymised: the email becomes `deleted+<id>@deleted.campusmart.invalid`, and the names,
    phone, username, Google id, school email and preferences are cleared.
  - Every session is signed out, and the cart, favourites, notifications, codes and verification requests are
    deleted. Listings are taken down.
  - The seller profile's personal and payout fields are cleared, and student ID photos are removed from Cloudinary.
  - The delivery address and phone on past orders are cleared (`942048b`).
  - It is audited as `ACCOUNT_DELETED`.
  - Refused while an order is open or a payout unpaid (`ACCOUNT_HAS_OPEN_ORDERS` with counts), and for admins and
    riders (`CANNOT_DELETE`).
  - `/profile/account_security/delete`.
- **Open orders fix:** `openSellerOrderWhere()` (shared by switching a school off, deleting a listing and deleting
  an account) now counts Phase 6 states: waiting for or with the rider, and delivered but still in the 48-hour
  window.
- **Account security** shows the real email and device status. It drops the sample two-factor switch, which did
  nothing, and the phone verification page is deleted (T3).

### 10.4 Health, monitoring, clean-ups, Terms and Privacy

- **`GET /api/health` (`backend/src/health/`):**
  - Terminus pings the database with a 3-second timeout.
  - 200 `{ status: 'ok', checks: { database: 'up' } }`, or 503 `UNHEALTHY` without the driver's message.
  - Never cached and not rate-limited.
- **Sentry:**
  - `backend/src/instrument.ts` loads first in `main.ts` and starts `@sentry/nestjs`, but only when `SENTRY_DSN` is
    set.
  - `AllExceptionsFilter` reports unexpected errors, not deliberate `HttpException`s; failed cron jobs are reported
    too.
  - `monitoring/sentry.ts` removes request bodies, cookies, query strings, the `Authorization`, `Cookie` and
    Paystack signature headers, and the user before anything is sent.
  - Env: `SENTRY_DSN` and `SENTRY_ENVIRONMENT`.
- **`backend/.env.example`** now lists every variable, adding the Phase 5 and 10 ones it was missing.
- **Clean-ups:**
  - `proxy.ts`.
  - `/offline` deleted; `/~offline` loses a mis-encoded emoji and a byte-order mark.
  - `ServiceWorkerCleanup`.
  - No `console.log`.
  - The agent placeholder's copy.
- **The offline page is precached** (`next.config.ts` `additionalPrecacheEntries`), so the worker can serve it when
  there is one (see the finding).
- **Terms and Privacy:**
  - `lib/constants/legal.ts` holds both texts as data.
  - `LegalDocumentBody` renders them in the sign-up overlays and Help → Terms & Privacy.
  - Marked "Draft, not yet in effect" until `LEGAL_EFFECTIVE_DATE` is set.
  - The review copy, [`docs/legal/terms-and-privacy.md`](../legal/terms-and-privacy.md), is a Vitest file snapshot of
    the same text, so the two can't drift.
  - The made-up `privacy@campusmart.ng` is gone.

### Finding: production has no service worker

- **What happens today:** `next build` uses Turbopack, and `@serwist/next` only runs under webpack (its build log
  says so). Today's build makes no `/sw.js`, so there is no offline page or caching in production. The old manual
  registration pointed at that missing file.
- **With webpack:** built with `next build --webpack`, the same code registers one worker, precaches `/~offline` and
  serves it with the server stopped
  ([`service-worker-check.md`](evidence/phase10-remaining/service-worker-check.md),
  `sw-offline-fallback-webpack.png`).
- **The build command:** I haven't changed it, because it's how production builds; it's a decision for you, below.

## 3. Verification evidence

Local Postgres 16. e2e ran on `campusmart_test`; the browser walk ran on `campusmart_dev`.

- **Backend:**
  - tsc clean; lint with 0 warnings; build OK.
  - Unit: 410/410 in 57 suites.
  - e2e: 212/212 in 18 suites, run 2026-10-19 on the final backend code. The Phase 10 suites are
    `phase10-accounts` (10), `phase10-google` (8) and `phase10-account-features` (9), plus 2 new tests in `app.e2e-spec`.
  - `prisma migrate diff --exit-code` is clean.
- **Frontend:**
  - Lint and tsc clean; Vitest 356/356 in 85 files.
  - `API_ORIGIN=http://localhost:4000 pnpm run build` OK, with no `middleware` warning.
- **GitHub CI:**
  - [Run 90](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39164892467),
    [91](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39165458972) and
    [92](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39219957254) are green, and so is
    [run 93](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39220448882) on the last code change
    (`2ebba92`).
  - Runs 85–89 (10.1–10.3) were red on one backend e2e test. `phase1-auth` still expected a gmail.com buyer to be
    refused, which T1 changed; `8093482` makes it a seller. The frontend job passed in all of them. I had run only
    the Phase 10 e2e suites locally before pushing, so it was CI that caught it.
- **Definition of done**, for each new endpoint:
  - **Validation:** every new body goes through the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`),
    so unknown fields are 400. e2e checks it on the school body (`extra: 1` → 400) and malformed ids on mark read.
  - **Checks in the services:** buyers only for school and seller changes; your own notifications only; open orders
    before deletion; the screenshot must be in our own Cloudinary folder; Google's verified email.
  - **Errors:** shared codes (`VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `USERNAME_TAKEN`,
    `INSTITUTION_NOT_SUPPORTED`, `INSTITUTION_INACTIVE`, `INVALID_CODE`, `INVALID_PASSWORD`,
    `ACCOUNT_HAS_OPEN_ORDERS`, `CANNOT_DELETE`, `UNHEALTHY`).
  - **Documentation:** responses are documented DTOs, regenerated into `lib/api/schema.d.ts`.
  - **Tests:** unit tests, plus e2e happy and forbidden paths (401 signed out, 403 for the wrong role, 400, 404, 409).
  - **Frontend:** every new screen has loading, empty and error states (Vitest).
- **Sentry and health against a dead database**
  ([`sentry-health-check.md`](evidence/phase10-remaining/sentry-health-check.md)):
  - `/api/health` answers 503 `UNHEALTHY`, `no-store`.
  - A login with a password answers 500 and sends exactly one report to a local Sentry sink. The report has the
    environment, the error and safe headers, and no body, cookie, `Authorization`, query string or user. None of the
    five planted secrets reached the sink.
- **Browser walk** ([`phase10-walk.mjs`](evidence/phase10-remaining/phase10-walk.mjs) →
  [`phase10-walk-output.txt`](evidence/phase10-remaining/phase10-walk-output.txt), **45/45**). The setup is Chromium →
  `next start` → NestJS → `campusmart_dev`, in West Africa Time, with the Phase 5 Paystack stub and made-up local
  `CLOUDINARY_*` values; Google and the support contacts are unset.
  - **Sign-up (phone):**
    - The draft Terms (`phone-signup-terms-draft`).
    - No Google button.
    - A gmail.com buyer signs up and confirms the code from the API console.
    - "Which school are you at?" asks for a choice, offers the waitlist and lists only switched-on schools
      (`phone-onboarding-school`).
    - The buyer lands home at University of Lagos.
  - **Change school:** with the desk lamp in the cart, choosing University of Ibadan warns that the cart will be
    emptied (`phone-change-school-warning`). Afterwards the school changed and the cart is empty.
  - **Profile:** "tobi_b" is refused as taken. The username, names and phone are saved (`phone-edit-profile`).
  - **Become a seller:** a gmail.com address is refused as not a school email. A UNILAG student address gets a code
    (`phone-become-seller-code`), and confirming makes them a seller there, still signing in with their gmail
    address. "Personal details" on the seller profile opens the same form.
  - **Account security and deletion:**
    - Account security has "Delete account" and no phone verification (`phone-account-security`), and
      `/profile/account_security/phone_verification` is 404.
    - A wrong password is refused (`phone-delete-account`).
    - The right one anonymises the account and signs it out, and signing in again fails.
  - **Notifications (Tobi):**
    - The home bell reads "Notifications, 2 unread" (`phone-home-bell`).
    - The list shows them, with order emails on by default (`phone-notifications`).
    - Turning them off is saved.
    - "Mark all as read" ends at "All caught up".
    - No sideways scrolling.
  - **Help:** Call us and Email support say "coming soon" (`phone-call-us-coming-soon`). A report needs a topic, then
    is sent (`phone-report-problem`).
  - **Admin (laptop, with the M7 code):** the report is in `/admin/reports` (`desktop-admin-support-report`), and
    admins were alerted.
  - **10.4:**
    - `/api/health` through the frontend is up and `no-store`.
    - `/offline` is 404, and `/~offline` renders (`phone-offline-page`).
    - A signed-out visit to `/orders?tab=open` goes to sign-in with `next=/orders?tab=open`.
    - Help → Terms & Privacy shows the draft Terms and the Privacy Policy (`phone-help-terms`, `phone-help-privacy`).
  - **Reruns:** the first runs failed on three script mistakes and one real bug. The script mistakes: no "Verify
    email" click; expecting the phone to be rewritten as +234 (the app keeps phones as typed, as at checkout); and
    signing an admin in twice within the one-code-a-minute limit. The real bug was the profile form wiping a typed
    first name when `/auth/me` refreshed, fixed in `40baa39` with a Vitest test that fails without the fix. The run
    after the seller link was added is the evidence.
- **Service worker** ([`service-worker-check.md`](evidence/phase10-remaining/service-worker-check.md)): see the
  finding in section 2.

### MANUAL: Google sign-in (for you, once the OAuth client exists)

1. Create the client (below), set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the API, and restart it.
2. On a phone, open the buyer sign-in page: "Continue with Google" appears.
3. Sign in with a Google account that has never used CampusMart. You land on "Which school are you at?", then home.
4. Sign out. Sign in with Google again: you go straight home.
5. With a seller's Google account, signing in sends you back to the sign-in page with "Google sign-in is for buyer
   accounts. Sign in with your email and password."

## 4. Deviations and assumptions

1. **Google sign-in without `passport-google-oauth20`.**
   - The guide names that package. A small service does the same OAuth steps with `fetch`, adding PKCE and a state
     cookie, and tests run against nock.
   - Any verified Google email may sign up as a buyer: T1 replaces the guide's "only emails whose domain maps to an
     institution" for buyers.
2. **Support reports carry no `listingId`.** Listing problems use Phase 9's "Report this listing", which has its own
   reasons and thresholds (M4). The help form points there.
3. **Phone verification page deleted, not hidden (T3)**, and the account-security two-factor switch removed; both
   were samples that did nothing.
4. **Open orders now include the Phase 6 dispatch states.** This also changes what blocks switching a school off and
   deleting a listing (section 2).
5. **Account deletion also clears the address and phone on past orders.** T6 says personal details are anonymised and
   orders kept; the amounts, items and dates stay for tax.
6. **Admins and riders can't delete themselves.** An admin first has their role removed by another admin; a rider is
   switched off by an admin.
7. **`@nestjs/terminus` 11.1.1, not 12.** Version 12 is published only as an ES module, which the CommonJS backend's
   Jest can't load. 11.1.1 supports Nest 11.
8. **`@sentry/nestjs` 10.76.0, not 11.x.** 11 came out three weeks ago and I know 10's API; 10.x still gets patches.
   Upgrade later.
9. **Sentry reports only unexpected errors.** Deliberate `HttpException`s such as 503 `UPLOADS_NOT_CONFIGURED`
   or 502 Paystack answers aren't reported, and every report is stripped of bodies, cookies, query strings and
   credential headers. Sentry is on the API only; see "Needs from you".
10. **`GET /api/health`.** The guide writes `GET /health`; the API's global `/api` prefix applies, as for every other
    route.
11. **Phones are kept as typed.** The profile stores `08031234567` as entered, as checkout does; nothing rewrites it as
    +234.
12. **Terms and Privacy:**
    - **Draft content:** the text follows the decisions. Words in `[brackets]` need your details. A few clauses are
      my assumptions for you or a lawyer to confirm: the age rule (18, or a parent's or guardian's permission),
      sellers being responsible for their own tax, the liability limit, and Lagos courts.
    - **What the text promises:** that any platform fee will be added to the Terms before it applies. Admins can
      change the fee in settings today, so that promise is kept by process, not code.
    - **Numbers admins can change:** the text states the current deadlines and fees. If an admin changes one in
      settings (for example the drop-off deadline), the Terms need the same change; the comment in
      `lib/constants/legal.ts` says so.
13. **Local dev data:**
    - **Accounts:** the walk created buyers `walk.buyer.<n>@gmail.com` and then deleted them, so they're anonymised
      rows now. Tobi's username is `tobi_b`.
    - **Notifications:** Tobi has walk notifications, all read.
    - **Reports:** there are open support reports from Tobi; you can close them in `/admin/reports`.

## 5. Needs from you

- **Google sign-in:**
  - Create the OAuth client (consent screen and a Web client) with the redirect URI
    `https://<frontend>/api/auth/google/callback` (and `http://localhost:3000/api/auth/google/callback` for local).
  - Put the keys in the cloud environment's settings as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, not in chat.
  - Then do the MANUAL check above.
- **Support contacts (T4):** set `SUPPORT_EMAIL`, `SUPPORT_PHONE` and `SUPPORT_WHATSAPP` in production. Each one unset
  says "coming soon".
- **Monitoring (T8):**
  - Create a Sentry project and set `SENTRY_DSN` (and optionally `SENTRY_ENVIRONMENT`, such as `staging`) on the API.
  - Add an uptime check on `https://<api-host>/api/health` (UptimeRobot or Better Stack); it answers 503 when the
    database is unreachable.
- **Terms and Privacy (T5):**
  - Read [`docs/legal/terms-and-privacy.md`](../legal/terms-and-privacy.md), ideally with a lawyer.
  - Fill in the `[brackets]`: registered business name, address and courts.
  - Confirm or change the clauses in deviation 12.
  - Tell me the effective date; I'll set `LEGAL_EFFECTIVE_DATE` so the "Draft" label goes.
- ~~**Decision: the service worker build.**~~ **Decided 2026-10-19: a, `next build --webpack`.** You set it on the
  Vercel staging project; the repo's build script uses it too, so CI builds the same way. The first webpack build
  found a page file exporting more than a page (`INTRO_SLIDES`), which only webpack's type check rejects; fixed by
  moving the slides to `app/onboarding/intro/slides.ts`.
- **Decision: Sentry for browser errors?** T8 named `SENTRY_DSN` for the API, so that's what's built. Reporting
  errors in the browser too would add `@sentry/nextjs` and a `NEXT_PUBLIC_SENTRY_DSN`. Say if you want it.
- **Carried over:**
  - **Email (`MAIL_*`, S4):** codes, order emails and admin alerts print to the console until it's set.
    - **Staging (2026-10-19):** Render's free instance type blocks SMTP, so you asked for the emails to be logged
      instead while testing. `MAIL_TRANSPORT=console` does that on a production server too: emails print to the log
      as warnings, the API warns at every start, and Cloudinary is still required. Checked locally
      ([`staging-config-check-output.txt`](evidence/staging-config/staging-config-check-output.txt)): with no
      `MAIL_*` set the API started, printed the sign-up code, and the code verified the account.
  - **Proxy hops:** `TRUST_PROXY_HOPS` (default 1, as before) replaces the fixed 1, to be measured on staging (setup
    checklist, section 5). The same local check sent `102.89.1.10, 76.76.21.21`: with 2 the session recorded
    `102.89.1.10` (the visitor), with 1 `76.76.21.21` (the proxy).
  - **Banned words:** review the starter list.
  - **Other admins:** they sign up, then you make them admins.
  - **Waitlist:** the page still simulates its submission (unchanged since before Phase 1, "as now" in G4). Say if it
    should store the request.
