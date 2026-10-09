# Phase 1: integration foundation

Branch: `feat/phase-1-integration` (stacked on `feat/phase-0-security`; see Deviations).
Status: **DONE pending manual checks** (one MANUAL item: two real phones).

## 1. Checklist

From the guide, verbatim:

- [x] Sign-up with a non-school domain lands on `/waitlist`.
- [x] Sign-up with a school email reaches verify-email; a wrong code 5 times locks that code.
- [x] After 15 minutes idle, the next request refreshes silently.
- [ ] MANUAL: Logging out on phone A leaves phone B signed in; "Sign out other devices" signs B out. (Automated equivalents pass; see evidence. Needs two real phones.)
- [x] A reused old refresh token revokes its session.
- [x] `grep -r "auth_token\|dev-mock" app lib middleware.ts` finds nothing.
- [x] `npm run gen:api` produces no diff.

Gate items:

- [x] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [x] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [x] `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` is clean.
- [x] Every new endpoint meets the definition of done: request DTO with unknown fields rejected, auth checked in the
  service, documented response DTO, shared error codes, a unit test plus e2e happy and forbidden paths, and frontend
  loading/empty/error states.

## 2. Changes

### 1.1 Same-origin proxy (D1)
- Already in place: the `next.config.ts` rewrite to `${API_ORIGIN}/api/:path*`, `BASE_URL = '/api'` in
  `lib/api/client.ts`, no `app/api/`, no `NEXT_PUBLIC_API_URL` in code. CORS kept for tools only (`app.setup.ts`).
  Cookies have no `Domain`.
- `next.config.ts`: throws a clear error when `API_ORIGIN` is missing.

### 1.2 API client
- `lib/api/client.ts` (the envelope unwrap, `ApiError(status, code, message, details)`, `ApiError(0,'NETWORK')`, 15 s
  `AbortController` timeout and shared refresh promise came from the `backend` branch):
  - The refresh exclusion covers only credential routes: `/auth/login`, `/auth/register`, `/auth/refresh`,
    `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`. Signed-in routes such as `/auth/me` refresh.
  - A rejected refresh clears auth and redirects only if someone was signed in. Guests are never redirected.
- `app/providers.tsx` retry rule was already the guide's.
- Tests: `lib/api/client.test.ts` (11).

### 1.3 Auth migration
- Already committed as `20260930054021_auth_sessions`: `Session`, `EmailCode`, `EmailCodePurpose`, `username`,
  `phone`, `emailVerifiedAt`, optional names, `Institution.domains`, dropped `passwordResetToken/Expiry`.
- New migration `backend/prisma/migrations/20261008055611_user_role_pickup_agent`, the only gap:
  `ALTER TYPE "UserRole" ADD VALUE 'PICKUP_AGENT';` (additive, no reset). Applied to local Postgres only.

### 1.4 Auth endpoints (backend)
- Endpoints (all under `/api`): `POST /auth/register` (201), `POST /auth/verify-email`,
  `POST /auth/verify-email/resend` (204), `POST /auth/login`, `POST /auth/refresh` (204), `POST /auth/logout` (204),
  `GET /auth/me`, `POST /auth/forgot-password` (always 204), `POST /auth/reset-password` (204),
  `GET /users/me/sessions`, `DELETE /users/me/sessions/:id` (204), `DELETE /users/me/sessions` (204).
- Rules:
  1. Institution from email: `src/institutions/email-domain.ts` (pure, unit-tested) and
     `InstitutionsService.findForEmail`. Lowercased; exact or parent domain; the most specific match wins.
     422 `INSTITUTION_NOT_SUPPORTED`.
  2. `@IsCampusMartPassword()` (`src/auth/decorators/is-campusmart-password.decorator.ts`): 8+ characters, upper,
     lower and digit. Used by register, reset and change.
  3. `EmailCodesService` (`src/auth/email-codes.service.ts`): `randomInt` 6 digits, bcrypt hash, 10 min, 5 attempts
     (reserved atomically before comparing), single use, a new code invalidates older ones.
  4. Tokens: JWT `{ sub, sid, role }`, 15 min (`JwtModule` `expiresIn: '15m'`). Refresh token = 32 random bytes in
     base64url; `Session.refreshTokenHash` = SHA-256; 30 days, sliding on rotation.
  5. Rotation and reuse detection: `SessionsService.rotate` (`src/sessions/sessions.service.ts`). Cookie
     `<sid>.<token>`, `timingSafeEqual`, rotation conditional on the old hash; a mismatch revokes the session.
  6. `JwtStrategy`: one query loads the live session together with the safe user; suspended or inactive users are
     rejected.
  7. Cookies: `src/auth/auth-cookies.ts`. `access_token` path `/`, 15 min; `refresh_token` path `/api/auth`,
     30 days; httpOnly, `sameSite: 'lax'`, `secure` in production, no Domain.
  8. `@RequireVerifiedEmail()` (`src/auth/decorators/require-verified-email.decorator.ts` + `VerifiedEmailGuard`):
     403 `EMAIL_NOT_VERIFIED`. No endpoint uses it yet (commerce starts in Phase 3).
  9. `accountType: 'SELLER'` → role `SELLER` (`SellerProfile` comes in Phase 2).
  10. `MailModule` / `MailService.send(to, template, vars)` on nodemailer (`src/mail/`). Prints to the console when
      `NODE_ENV` isn't production.
  11. A password change revokes every other session (`UsersService.changePassword`, in one transaction). The
      endpoint now returns 204.
- New module `src/sessions/` (module, controller, service, `dto/session.dto.ts`, spec).
- Login moved from the passport-local guard into `AuthService.login`, so the DTO validates first. `passport-local`
  was removed; unknown emails are compared against a dummy hash so timing doesn't reveal them.
- `UpdateProfileDto` no longer accepts `email` or `institutionId` (D7, D9).
- New feature error codes: `INSTITUTION_NOT_SUPPORTED` (422), `EMAIL_NOT_VERIFIED` (403), `INVALID_CODE`
  (400, `details.attemptsLeft`), `CODE_LOCKED` (400), `CODE_EXPIRED` (400), `RATE_LIMITED` (429,
  `details.retryAfterSeconds`).
- Dependencies: `nodemailer`, `@types/nodemailer` added; `passport-local`, `@types/passport-local` removed.
- Tests: `auth.service.spec.ts`, `email-codes.service.spec.ts`, `sessions.service.spec.ts`,
  `verified-email.guard.spec.ts`, `is-campusmart-password.decorator.spec.ts`, `email-domain.spec.ts`,
  `mail.service.spec.ts`, `users.service.spec.ts`; e2e `test/phase1-auth.e2e-spec.ts` (22 tests).

### 1.5 Generated types (D5)
- Response DTOs: `UserDto` (+ `toUserDto`), `SessionDto`, `PublicProfileDto`, `VerificationRequestDto`,
  `InstitutionDto`, `ErrorResponseDto`.
- `ApiOkEnvelope(model, { status })` (`src/common/swagger/api-envelope.decorator.ts`) documents
  `{ success, data, timestamp }`; it accepts `[Model]` for arrays and `String`.
- `src/openapi.ts` `buildOpenApiDocument()` is shared by `/api/docs-json` and the new `npm run openapi:export`
  (`src/scripts/export-openapi.ts`). operationIds are stable (`Controller_method`).
- Frontend: `openapi-typescript` dev dependency; `"gen:api": "openapi-typescript http://localhost:4000/api/docs-json -o lib/api/schema.d.ts"`;
  `lib/api/schema.d.ts` committed.
- `lib/api/auth.ts`: `User = components['schemas']['UserDto']` plus `UserRole`, `Session`, `AccountType` aliases.
- CI (`.github/workflows/ci.yml`, backend job): exports the document, regenerates `schema.d.ts` and fails on any diff.

### 1.6 Frontend auth wiring
1. `app/store/useAuthStore.ts`: mock and `auth_token` writes gone; `login` calls `authApi.login`; persists only
   `user` (`partialize`).
2. `app/components/AuthProvider.tsx` uses `useMe()` (`lib/api/hooks/useMe.ts`). It clears auth only on a 401 and
   keeps the user on network errors.
3. Sign-up: `app/onboarding/components/SignUpForm.tsx`, used by both sign-up pages. School email, password and
   confirm, validated by `signUpSchema` (`lib/validations/auth.ts`, rewritten). Sends `accountType`; 422
   `INSTITUTION_NOT_SUPPORTED` → `/waitlist`. The seller page keeps an optional store name.
4. New `app/onboarding/verify-email/page.tsx`: 6-digit input, resend button with a 60 s countdown (`useCountdown`).
   Buyers then go to `/`, sellers to `/sellers`.
5. Sign-in: `app/onboarding/components/SignInForm.tsx`. Placeholder "School email", `type="email"`, `ApiError`
   message under the form, redirect by role (`lib/auth/redirects.ts`: ADMIN `/admin`, PICKUP_AGENT `/agent`,
   SELLER `/sellers`, else `/`).
6. New `app/onboarding/forgot-password/page.tsx` (email, then code + new password). "Recover it here" links to it.
7. `middleware.ts`: `access_token` or `refresh_token` on `/sellers`, `/profile`, `/admin`, `/agent`,
   `/checkout`, `/cart`, `/orders`; redirects to sign-in with `?next=`.
8. Role layouts: `app/components/RoleGate.tsx` (reads `useMe()`) in `app/sellers/layout.tsx`, new
   `app/admin/layout.tsx` and `app/agent/layout.tsx` (with placeholder pages).
9. Logout: `lib/api/hooks/useLogout.ts`. Calls the API, then `queryClient.clear()`, resets the cart and favourites
   stores and removes their localStorage keys. Used by both profile pages.
10. Query persistence: `lib/api/persistence.ts` `shouldPersistQuery` (only `meta.persist === true`), wired through
    `dehydrateOptions.shouldDehydrateQuery`; `lib/api/react-query.d.ts` types `meta.persist`.
11. `change_password` calls `PATCH /users/me/password`. `active_sessions` uses the sessions endpoints, with
    loading, empty and error states (`lib/api/hooks/useSessions.ts`, `lib/utils/userAgent.ts`). The Google buttons
    are hidden (AuthContainer, both welcome pages).
12. `app/page.tsx`: `useRequireAuth()` is on again (`useRequireAuth` now keys off `user`).
- Also: `AuthContainer` is a real `<form>` with an `error` prop. `passwordRequirements` mirrors the API ("Contains
  a number"). The splash routes by role and verification. The profile card and `email_verification` page show the
  real user instead of mock data.
- Tests (Vitest + Testing Library, `@testing-library/react` added): `SignUpForm.test.tsx`,
  `AuthProvider.test.tsx`, `useLogout.test.tsx`, `persistence.test.ts`, `redirects.test.ts`,
  `validations/auth.test.ts`, `userAgent.test.ts`, `middleware.test.ts`, `client.test.ts`. 60 tests in total.

New env vars: none (Phase 1's `APP_URL` and `MAIL_*` were already in the schema). New migration: one (above).

### Rate limits per account (Collins' decision, 2026-10-09)
- `backend/src/common/guards/account-throttler.guard.ts`: `AccountThrottlerGuard` replaces `ThrottlerGuard` as the
  global `APP_GUARD`. Same limits (120/min overall; 5/min on login, register, verify, resend, forgot, reset and
  password change), but keyed by a *verified* access token's user id, else the request body's email, else the IP.
  Students behind one campus NAT address no longer share a limit.
- Trade-off: one IP can now try many different emails (password spraying isn't capped per IP). A loose per-IP
  ceiling could be added later if abuse shows up.
- Tests: unit `account-throttler.guard.spec.ts` (6); e2e `phase0-security` › "the login limit follows the email, so
  another student behind the same IP can still sign in" and `phase1-auth` › "code routes are limited per account,
  not per shared IP". e2e suites reset the in-memory throttler store between tests (`resetRateLimits`).

## 3. Verification evidence

Backend tests ran against local Postgres `campusmart_test`. The browser smoke run used Chromium → `next start` (:3000,
`API_ORIGIN=http://localhost:4000`) → NestJS (:4000) → local `campusmart_dev`. Output:
[`evidence/phase1-browser-smoke.txt`](evidence/phase1-browser-smoke.txt); script:
[`evidence/phase1-browser-smoke.mjs`](evidence/phase1-browser-smoke.mjs).

| Item | Evidence |
|---|---|
| Non-school domain → `/waitlist` | e2e `phase1-auth` › "a non-school domain is rejected with 422 INSTITUTION_NOT_SUPPORTED" (no user created). Vitest `SignUpForm.test.tsx` › "sends a non-school domain to /waitlist". Browser smoke: `PASS Sign-up with a non-school domain lands on /waitlist`. |
| School email → verify-email; 5 wrong codes lock | e2e › "a school email … creates the account, sets both cookies and emails a code" and "a wrong code 5 times locks that code; a resent code works" (4 × `INVALID_CODE` with attemptsLeft 4→1, 5th `CODE_LOCKED`, right code then `CODE_LOCKED`). Unit `email-codes.service.spec.ts`. Browser smoke Run A: `PASS … reaches /onboarding/verify-email`, `PASS Wrong codes 1-4 report the tries left`, `PASS The 5th wrong code locks the code`, `PASS After the lock even the right code is refused`. |
| 15 minutes idle → silent refresh | e2e › "after the access cookie expires (15 minutes idle), refresh restores access silently" (an expired JWT gets 401; `/auth/refresh` 204 rotates both cookies; `/auth/me` 200). Vitest `client.test.ts` › "silently refreshes once on a 401 and retries", "refreshes for GET /auth/me too", "shares one in-flight refresh". Cookie `Max-Age=900` asserted in e2e. Browser smoke: `PASS With the access cookie expired, /profile restores the session silently` (the access cookie is deleted, as the browser does at Max-Age). |
| Phone A / phone B | MANUAL (needs two real phones; steps below). Automated equivalents pass: e2e › "logging out on phone A leaves phone B signed in; 'sign out other devices' signs B out" (two agents with separate IPs), and the browser smoke Run B, two isolated browser contexts with iPhone/Android user agents: `PASS Phone B is still signed in after phone A logs out`, `PASS Active Sessions lists the other devices`, `PASS "Sign out other devices" signs phone B out`. |
| Reused refresh token revokes its session | e2e › "a reused old refresh token revokes its session" (replaying R1 after rotation → 401, `Session.revokedAt` set, R2 and the session's access token also → 401). Unit `sessions.service.spec.ts` › "revokes the session when an old … token is replayed", "revokes when a concurrent refresh already rotated". |
| No `auth_token` / `dev-mock` | `grep -r "auth_token\|dev-mock" app lib middleware.ts` → no output, exit 1. `middleware.test.ts` › "never looks for the old auth_token cookie". |
| `npm run gen:api` no diff | API running on :4000: `npm run gen:api` then `git diff --exit-code lib/api/schema.d.ts` → no diff. The CI path (`npm run openapi:export` + `openapi-typescript backend/openapi.json`) produces a byte-identical file (`diff -q` → identical). |
| Backend gate | `npx tsc --noEmit` exit 0; `npm run lint -- --max-warnings 0` exit 0; `npm run build` exit 0; `npm test` → 12 suites, 95 tests passed; `npm run test:e2e` → 3 suites, 34 tests passed; `grep @prisma/client` outside generated → 0. |
| Frontend gate | `npm run lint` exit 0 (0 errors, the 2 pre-existing warnings); `npx tsc --noEmit` exit 0; `npx vitest run` → 9 files, 60 tests passed; `API_ORIGIN=http://localhost:4000 npm run build` exit 0. |
| migrate diff | `--exit-code` → "No difference detected", exit 0. |
| Definition of done | Unknown fields: e2e "rejects a client-sent institutionId or role". Forbidden paths: verify-email and sessions need sign-in (401); another user's session → 404; reset with an unknown email gives the same 400 as a wrong code. Response DTOs are in `schema.d.ts`; no password, hash, session id or other users' emails. |

### MANUAL: phone A / phone B (for Collins)

1. On a laptop on the same Wi-Fi as both phones: `cd backend && npm run dev`, then in the repo root
   `API_ORIGIN=http://localhost:4000 npx next dev -H 0.0.0.0 -p 3000`. Cookies aren't `secure` outside production,
   so plain http on the LAN works.
2. Make sure an institution exists with your school's email domain (as an admin: `POST /api/institutions`, or
   insert a row in the dev DB).
3. Phone A: open `http://<laptop-LAN-IP>:3000`, sign up with your school email, enter the code (it is printed in
   the backend console as `[dev mail]`).
4. Phone B: sign in with the same email and password.
5. Phone A: Profile → Logout. Expect the role-select screen.
6. Phone B: Profile → Account security → Active sessions. Expect the page to load with "This device" and phone A
   not listed (still signed in).
7. Phone A: sign in again → Active sessions → "Sign Out All Other Devices".
8. Phone B: reload or navigate. Expect to be sent to the sign-in page.

## 4. Deviations and assumptions

1. **Branching.** `feat/phase-1-integration` is cut from `feat/phase-0-security`, not `develop`, because Phase 0
   isn't merged into `develop` (you asked me not to merge).
2. **Migration name.** The guide's `auth_sessions` migration already existed, so the one missing piece
   (`PICKUP_AGENT`) is a separate additive migration, `user_role_pickup_agent`.
3. **Client refresh scope (1.2).** "Except `/auth/*`" would make `GET /auth/me` sign the user out after 15 idle
   minutes instead of refreshing. Only the credential routes skip the refresh.
4. **Middleware vs. refresh cookie path (1.6.7 vs. D6).** The refresh cookie's path is `/api/auth`, so browsers
   never send it with page requests. Once the 15-minute access cookie expires, the middleware sees no cookie at all.
   I kept both rules verbatim: the middleware redirects to sign-in with `?next=`, and the sign-in page first tries a
   silent `POST /api/auth/refresh`, bouncing straight back on success (verified in the browser smoke run). The
   alternative is changing a cookie rule, which I didn't do without asking.
5. **Send limits.** "1 a minute and 5 an hour" counts every verification code for the user, including the one sent
   at sign-up (there's no column to tell them apart), so the first resend is possible after 60 s.
   Forgot-password uses the same limits silently: it still returns 204.
6. **Reset-password errors.** Any failure (unknown email, wrong, expired or locked code) returns the same 400
   `INVALID_CODE` with no `attemptsLeft`, so accounts can't be probed. Verify-email (signed in) gives the detailed
   codes.
7. **Login without passport-local.** Credentials are checked in `AuthService.login` after DTO validation;
   `passport-local` was removed.
8. **Profile DTO.** `email` and `institutionId` are no longer editable (D7: the school email is the identity; D9:
   the institution comes from it). Username and phone wait for Phase 10.
9. **Password change returns 204** instead of `{ message }`.
10. **Unverified sign-ins** go to `/onboarding/verify-email` first, then the role redirect; a same-origin `?next=`
    is honoured.
11. **1.5.4.** Only `User` is aliased to generated types. `SellerProduct` and `SellerOrder` have no backend DTOs
    until Phases 3 and 6, so `types/index.ts` keeps them hand-written for now.
12. **CI schema check.** The guide says CI checks `schema.d.ts` but its yaml had no step; I added one to the
    backend job.
13. **Seller store name.** Kept on the sign-up page and held in localStorage `campus-mart-pending-store-name` until
    Phase 3 saves it via `PATCH /sellers/me`.
14. **`/admin` and `/agent`** have placeholder pages so the role redirects don't 404.
15. **Mock data removed beyond the list.** The profile user card and the email-verification page now show the
    signed-in user (they showed "John Doe" and a hard-coded verified email). The "Change email" action is gone,
    since the email isn't editable.
16. **AuthProvider** calls `GET /auth/me` on start only when a user is persisted; guests make no auth calls.
17. **Throttle message.** `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])` is kept verbatim, so a 429 shows
    Nest's default text "ThrottlerException: Too Many Requests" in the UI. It's harmless but unfriendly; it could be
    changed with the `errorMessage` option if you want.

## 5. Needs from Collins

- **GitHub push access (blocker).** Pushes to `ArnoldMidalla/campusmart_web` return 403 "Claude doesn't have GitHub
  access". The fork `KingSlayer-double07/campusmart_web` is pushable, but this session can't attach it because it
  has the same repo name as the upstream already attached here. To fix: start a session with the fork as its source,
  or push the bundle yourself (see the gate summary).
- ~~Rate limits behind campus NAT~~ **Decided 2026-10-09:** limits follow the email/account, not the IP (see
  "Rate limits per account" below).
- **Middleware approach** (deviation 4): OK as is, or do you prefer a different cookie rule?
- **Production SMTP:** `MAIL_HOST/PORT/USER/PASS/FROM`, pending the domain (Collins, 2026-10-09). Until it's set,
  a `NODE_ENV=production` API refuses to boot (env schema), because nobody could receive a verification code.
  Development and test print codes to the console, so local work is unaffected.
- **Neon dev branch:** apply the new migration there (`npx prisma migrate deploy` against your dev `DIRECT_URL`). I
  only applied it to a local Postgres.
- **Institutions for testing sign-up:** until the Phase 2 seed exists, create one with your school's domains
  (admin `POST /api/institutions`).
- **FYI, strict refresh rotation:** with reuse detection as specified, two tabs refreshing at the same instant can
  trip it and sign that device out. The client shares one refresh per tab; cross-tab coordination could come later
  if it shows up in practice.
