# Phase 0: security and hygiene quick wins

Branch: `feat/phase-0-security` (off `origin/develop`, with `origin/backend` merged in; see Deviations).
Status: **DONE** (all items verified automatically; no manual items).

## 1. Checklist

From the guide, verbatim:

- [x] `PATCH /api/users/me/profile` response has no `password` or `passwordResetToken`.
- [x] `GET /api/users/<id>` returns no email; a non-UUID returns 400.
- [x] Changing the password with a wrong current password returns 401.
- [x] The 6th login attempt in a minute returns 429.
- [x] `grep -r "@prisma/client" backend/src` finds nothing outside `generated/`.
- [x] `npm test` passes in `backend/`.
- [x] A forced 500 appears in the production-mode logs.

Gate items:

- [x] Backend `npx tsc --noEmit` passes.
- [x] Backend `npm run lint -- --max-warnings 0` passes.
- [x] Backend `npm run build` passes.
- [x] Backend `npm run test:e2e` passes.
- [x] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run` and `npm run build` pass.
- [x] `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` is clean.
- [x] CI workflow `.github/workflows/ci.yml` exists (Testing section).

## 2. Changes

Starting point: the `backend` branch had already done part of Phase 0 (and a little of Phase 1). Each section
below says what was already there and what this phase changed.

### Branch setup
- `feat/phase-0-security` created from `origin/develop`; `origin/backend` merged in (commit `148593d`). One conflict,
  `lib/api/client.ts`, resolved with the `backend` version (the newer envelope-aware client; Phase 1.2 owns it).

### 0.1 Repo cleanup
- Already done before this phase: no `frontend/` folder exists, `public/sw.js` is untracked and ignored together with
  `public/sw.js.map` and `public/swe-worker-*.js`, `backend/.env.example` uses `ep-xxxx-pooler.region.aws.neon.tech`
  (git history of that file holds no real host either), and `main.ts` has no `All` import. No changes needed.

### 0.6 Prisma client (done early, as instructed)
- `backend/src/prisma/prisma.service.ts`: now the guide's class. It `extends PrismaClient` with `PrismaPg`. The old
  version forwarded every model getter to a second, module-level client, so `$transaction` would have run on a
  different client from the models.
- Imports were already on `src/generated/prisma/client|enums`; `PrismaModule` was already `@Global()`;
  `prisma.config.ts` already used `env('DIRECT_URL')`.
- `backend/prisma.config.ts`: added optional `shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL` (Prisma 7 removed
  `--shadow-database-url`).
- `backend/src/institutions/dto/create-institution.dto.ts`, `institutions.service.ts`: `domain` → `domains: string[]`,
  because the committed `auth_sessions` migration had already made that schema change, which broke the build.
- `backend/tsconfig.build.json`: excludes `prisma.config.ts` and `prisma/`. Before, the build emitted
  `dist/src/main.js` and `npm run prod` (`node dist/main`) could not start.

### Lint baseline (supports the CI gate)
- `backend/eslint.config.mjs`: ignores `src/generated/**` and `dist/**`; `_`-prefixed unused bindings allowed;
  `no-unsafe-*` and `unbound-method` relaxed for `*.spec.ts` and `test/**` only.
- `backend/.prettierignore` added; one formatting-only commit (`df7eae8`) ran Prettier over `src/` and `test/`.
- `backend/package.json`: `lint` no longer passes `--fix` (guide, Testing section).

### 0.2 One safe user shape
- `backend/src/users/user.select.ts`: fixed `userName` → `username`. `username` and `emailVerifiedAt` already exist in
  the schema (the `auth_sessions` migration landed early), so both are included.
- `backend/src/users/users.service.ts`: `create`, `findById`, `updateProfile` select `safeUserSelect`; `findByEmail`
  selects `safeUserSelect + password` for the hash compare only (`validateUser` strips it).
- Test: `backend/src/users/users.service.spec.ts`.

### 0.3 Public profile
- `ParseUUIDPipe` and the email-free select were already in place; the dead `if (!id)` branch was already gone.
- `backend/src/users/users.controller.ts`: `GET /users/:id` now requires sign-in (endpoint index lists it under
  "signed in"); `@ApiBearerAuth()` → `@ApiCookieAuth()`.

### 0.4 Password change needs the current password
- Already implemented (`currentPassword` in the DTO, `compare`, 401 on mismatch, 400 when new equals current).
- Added `@Throttle({ default: { limit: 5, ttl: 60_000 } })` to `PATCH /users/me/password` ("every code/password
  route"). Session revocation is Phase 1.

### 0.5 Rate limiting and headers
- `backend/src/app.module.ts`: `APP_GUARD` imported from `@nestjs/core` instead of the string literal.
- `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])`, `@Throttle` on login/register, `helmet()` and
  `trust proxy` were already present.
- New `backend/src/app.setup.ts` (`configureApp`) holds helmet, trust proxy, cookie parser, `/api` prefix,
  validation pipe, filter, interceptor and CORS; `main.ts` and the e2e tests both call it.
- Later change (decided 2026-10-09): the limits are keyed per email/account instead of per IP, via
  `AccountThrottlerGuard`. See phase-1-integration.md, "Rate limits per account". The checklist item below still
  holds: the 6th login for the same email within a minute is a 429.

### 0.7 Error format and logging
- `AllExceptionsFilter` already had the codes, Prisma P2002/P2003/P2025 mapping, 5xx `logger.error(exception)` and 4xx
  `warn`. Tightened typing of the `message` passthrough.
- `backend/src/common/interceptors/transform.interceptor.ts`: `success` is always `true` (D2). Before, a `void`
  handler produced `success: false` and logged an error.
- Test: `backend/src/common/filters/http-exception.filter.spec.ts`.

### 0.8 Institutions
- Already done (`NotFoundException`, `ParseUUIDPipe`). Test: `backend/src/institutions/institutions.service.spec.ts`.

### 0.9 Swagger
- Already done (`addCookieAuth('access_token')`, not mounted in production, `jsonDocumentUrl: 'api/docs-json'`).
  Controllers now use `@ApiCookieAuth()` to match.

### 0.10 Validate env at startup
- `backend/src/config/env.ts` rewritten: every appendix variable. Required at boot: `DATABASE_URL`, `DIRECT_URL`,
  `JWT_SECRET` (32+ characters). SMTP is required in production. `PAYSTACK_SECRET_KEY` is required once
  `PAYMENTS_ENABLED=true`. Everything else is optional or has a default until its phase.
- Renamed `PAYSTACK_ENABLED` → `PAYMENTS_ENABLED` (default `false`) and added `DROP_OFF_DEADLINE_DAYS`.
  `ESCROW_DISPUTE_WINDOW_HOURS` now allows 0.
- Test: `backend/src/config/env.spec.ts`.
- New env var (tooling only): `SHADOW_DATABASE_URL`.

### 0.11 Tests and docs
- Scaffold tests: the unit test already expected `'Campusmart API is running'`; `backend/test/app.e2e-spec.ts` now
  expects it inside the envelope.
- `backend/README.md` rewritten (env table, `prisma migrate dev`, `npm run dev`, Swagger URL, safe e2e runs).
- Root `README.md`: `API_ORIGIN` replaces `NEXT_PUBLIC_API_URL`. It already said Next.js 16 and Paystack, and had no
  `/v1`.
- Root `.env.example` added (`API_ORIGIN`); `.env*.local` added to root `.gitignore`.
- `next.config.ts`: `res.cloudinary.com` in `images.remotePatterns`.
- `backend/.env.example` matches the new schema; the Resend block is removed (D18 = nodemailer).

### CI and test harness (Testing section)
- `.github/workflows/ci.yml` added.
- e2e harness `backend/test/utils.ts`: `createTestApp()` (uses `configureApp`), `truncateAll()` (refuses any database
  whose name lacks `test`), per-client `X-Forwarded-For` so per-IP limits don't leak between tests,
  `createUser()`/`signIn()`. `test/jest-e2e.json`: `maxWorkers: 1`, 30 s timeout.
- `backend/test/phase0-security.e2e-spec.ts`: the Phase 0 checklist as tests.
- Frontend: `vitest` + `jsdom` dev dependencies, `vitest.config.mts` (frontend files only), first test
  `lib/api/client.test.ts`. Root ESLint ignores `backend/**` and generated service-worker files.

Migrations created: none. New endpoints: none.

## 3. Verification evidence

Local Postgres 16; `DATABASE_URL=DIRECT_URL=postgresql://postgres:postgres@localhost:5432/campusmart_test`.

| Item | Evidence |
|---|---|
| Profile PATCH has no password | `test/phase0-security.e2e-spec.ts` › "PATCH /api/users/me/profile response has no password or passwordResetToken" (also asserts no bcrypt `$2` string anywhere in the body); unit `users.service.spec.ts` › "returns only the safe user shape". |
| `GET /users/<id>` no email; non-UUID 400 | e2e › "GET /api/users/<id> returns no email", "GET /api/users/<non-uuid> returns 400" (code `VALIDATION_FAILED`). |
| Wrong current password 401 | e2e › "changing the password with a wrong current password returns 401" (code `UNAUTHENTICATED`, old password still signs in); unit › "rejects a wrong current password with 401". |
| 6th login → 429 | e2e › "the 6th login attempt in a minute returns 429" (5 × 401, then 429 `RATE_LIMITED` even with the right password). |
| No `@prisma/client` imports | `grep -r "@prisma/client" backend/src \| grep -v src/generated \| wc -l` → `0`. |
| `npm test` passes | `Test Suites: 5 passed, 5 total; Tests: 30 passed, 30 total`. |
| Forced 500 in production logs | Built server run with `NODE_ENV=production` and `DATABASE_URL` pointing at a missing database; `GET /api/institutions` → `HTTP/1.1 500`. The server log shows `ERROR [AllExceptionsFilter] PrismaClientKnownRequestError: … Database does_not_exist does not exist` with the full stack. In the same run `GET /api/docs` → 404 (Swagger off in production). Unit: filter spec › "logs 5xx with logger.error and the exception itself". |
| tsc / lint / build | `npx tsc --noEmit` exit 0; `npm run lint -- --max-warnings 0` exit 0; `npm run build` exit 0, and `dist/main.js` exists. |
| e2e | `Test Suites: 2 passed; Tests: 12 passed`. The guard was checked too: running against `campusmart_dev` throws "Refusing to run e2e tests against database campusmart_dev". |
| Frontend | `npm run lint` → 0 errors, 2 pre-existing warnings (unused eslint-disable in `app/profile/page.tsx`, `app/sellers/profile/page.tsx`); `npx tsc --noEmit` exit 0; `npx vitest run` → 3 passed; `API_ORIGIN=http://localhost:4000 npm run build` succeeded. |
| migrate diff | `SHADOW_DATABASE_URL=… npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` → "No difference detected", exit 0. |
| CI exists | `.github/workflows/ci.yml` (commit `ec48eb9`). It now runs on GitHub on every push (resolved 2026-10-09; the latest run on `backend` is green). Every CI step was run locally with the CI env values. |

## 4. Deviations and assumptions

1. **Branch base.** `develop` has neither the guide nor the 22 backend commits, so a phase branch cut purely from
   `develop` would have started without the API work. I branched from `develop` and merged `backend` in. Phase
   branches are pushed under their own names. `backend` (this session's designated branch) is updated to the same
   commits at the gate.
2. **The repo was already part-way through Phases 0 and 1.** The `auth_sessions` migration (Session, EmailCode,
   `domains`, optional names, `username`, `phone`, `emailVerifiedAt`) is committed. So `safeUserSelect` includes
   `username`/`emailVerifiedAt` now, and the institutions DTO uses `domains` in Phase 0, not Phase 2.
3. **CI yaml (Prisma 7).** `--to-schema-datamodel` → `--to-schema`; `--shadow-database-url "$DATABASE_URL"` →
   `SHADOW_DATABASE_URL` env read by `prisma.config.ts`. It points at the built-in `postgres` database, because
   `migrate diff` wipes the shadow database and would have emptied the e2e database.
4. **Env validation.** "Every variable in the appendix" is validated, but variables from later phases are optional
   until those phases. The guide's CI only sets the DB, `JWT_SECRET` and `NODE_ENV`, so required Cloudinary/Paystack
   would stop CI from booting. SMTP is required in production. `JWT_SECRET` must be ≥ 32 characters (appendix
   "32+"). `PAYSTACK_ENABLED` → `PAYMENTS_ENABLED` (appendix name, default `false`). `ESCROW_DISPUTE_WINDOW_HOURS`
   allows 0, which the Phase 5 checklist needs.
5. **`GET /users/:id` requires sign-in.** The endpoint index lists it as "signed in"; it was public.
6. **Envelope `success` always `true`.** D2 says so; the interceptor previously emitted `success: false` for empty
   payloads.
7. **README script name.** The guide says `start:dev`; the team renamed the scripts to `dev`/`prod`
   (commit `52b938c`), so the README documents `npm run dev`.
8. **Lint config.** Test files relax `no-unsafe-*`; `_`-prefixed bindings are allowed. Root ESLint ignores
   `backend/**` (the backend has its own config) and generated SW output.
9. **`summary_diff.patch`** (a 116 KB UTF-16 diff committed on `develop`) looks accidental. I left it alone and
   scanned it: no credentials.

## 5. Needs from you

- ~~**GitHub push access**~~: resolved 2026-10-09, see Phase 1.
- **Protect `master` and `develop`** so both CI jobs must pass (GitHub branch protection, guide Testing section).
- **Trust proxy hops in production.** `trust proxy` is `1` as the guide says. If production traffic passes through
  Vercel and then a load balancer in front of the API, `req.ip` will be the Vercel egress IP. Rate limits and the
  Active Sessions IP would then be per-proxy, not per-user. Confirm the hop count once the API host is chosen.
- ~~**Should `summary_diff.patch` be deleted from `develop`?**~~ Dropped (2026-10-09): leave it.
