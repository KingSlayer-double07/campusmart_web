# Phase 9: admin UI and moderation

Phase 9 is built in slices as the other phases land (guide: "Build the institutions and stations screens right after
Phase 2 ... Add the rest as each phase lands").

| Slice | Branch | Status |
|---|---|---|
| A. Institutions and pickup stations (after Phase 2, decided 2026-10-09) | `feat/phase-9-admin-institutions-stations` | DONE pending manual checks |
| B. Seller verification (with Phase 3, decided 2026-10-09) | `feat/phase-3-seller-verification` | DONE pending manual checks; logged in [Phase 3, 3.3](phase-3-listings.md) |
| C. Users and suspension, listing moderation, reports, audit log, overview, admin sign-in code (disputes and payouts came with Phases 5 and 6) | `feat/phase-9-admin-moderation` | DONE pending manual checks |

## 1. Checklist

From the guide, verbatim.

- [x] Every `/api/admin/*` route returns 403 for a seller and 401 when signed out. Test all of them in a loop from the route list.
  *e2e `test/phase9-admin.e2e-spec.ts` › access: the routes come from the OpenAPI document (44 now, every admin
  screen from slices A to C and Phases 4b–8). Each returns 401 signed out and 403 `FORBIDDEN` for a SELLER, BUYER,
  PICKUP_AGENT and, since slice C, a DISPATCH rider. The test also pins the slice C routes so none can drop out.*
- [x] Suspending a user signs them out within 15 minutes, and immediately on their next refresh.
  *Immediately, on their very next request. Suspending revokes every session, and the access-token check reads the
  session on each request. e2e `phase9-moderation.e2e-spec.ts` › "suspending signs the user out at once…" (`/auth/me`
  401, refresh 401, 0 live sessions). Walk: "Their sessions end at once".*
- [x] Every admin mutation appears in the audit log with who, what and when.
  *Slice C's: `ROLE_CHANGED`, `USER_SUSPENDED` (with `automatic` for M4d), `USER_UNSUSPENDED`, `LISTING_MODERATED`,
  `REPORT_CLOSED`, `REPORT_REOPENED`, `SETTING_CHANGED` (banned words), each checked in e2e with `actorId` and
  `createdAt`. The earlier screens' mutations were checked in their phases: slice A, Phase 3 verification, 4b
  places and fees, Phase 5 payouts and settings, Phase 6 riders, deliveries and disputes, Phase 8 reviews. All of
  it is now readable at `/admin/audit` (walk: "The audit log shows the suspension, its lifting and both role
  changes, by the admin").*
- [x] A new campus can go live end to end from the admin UI alone: institution, domains, station, agent.
  *With delivery replacing stations (DL9), the steps are: institution and domains (slice A walk), campus places and
  the delivery fee (Phase 4b walk), and riders instead of agents (Phase 6 walk: "An admin invites a rider for a
  campus"). All are on the overview's "Get a new campus live" checklist.*

Slice A gate:

- [x] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [x] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [x] `npm run gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] Inactive institution (decided 2026-10-09): sign-up with its domains is blocked with a friendly message; it is
  hidden from the public list; buyers, sellers and pickup agents can't sign in; only admins can; anyone already
  signed in is cut off on their next token refresh.
- [x] Every new endpoint meets the definition of done.
- [x] Admin screens follow the existing frontend patterns, are mobile-responsive and have loading, empty and error
  states.
- [ ] MANUAL: you look over the console on a phone and a laptop and confirm it's easy to understand (steps below).

Slice C, the plan's additions ([execution-plan.md](execution-plan.md#phase-9-admin-and-moderation)):

- [x] Users: other admins sign up, then an admin sets their role (M1). Suspend and lift, and the user sees the
  admin's reason (M6). e2e and the walk.
- [x] Listings: moderation with the M3 reasons; listings go live at once (M2). e2e and the walk.
- [x] Reports and the audit log. e2e and the walk.
- [x] Sellers confirm "not on the prohibited list" before publishing (M4a). e2e, Vitest and the walk.
- [x] Listings using a banned word wait for review; admins edit the list in settings (M4c). e2e and the walk.
- [x] 5 different buyers' reports flag a listing (M4); a prohibited-item report hides it at once (M4b). e2e and
  the walk.
- [x] A confirmed prohibited item suspends the seller automatically until an admin lifts it (M4d, M4e), but not
  for a listing the banned-word check held before it went live (M4f). e2e and unit; the walk shows the M4f case.
- [x] A 6-digit email code at every admin sign-in, printed to the console until S4 (M7). e2e, unit, Vitest and
  the walk.

Slice C gate:

- [x] Backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm run build`, `pnpm test`,
  `pnpm run test:e2e` pass.
- [x] Frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build` pass.
- [x] `gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] GitHub CI is green on the branch.
- [x] Every new endpoint meets the definition of done (section 3).
- [ ] MANUAL: the same look-over for the new screens (steps below).

## 2. Changes

### Slice A backend: institutions, pickup stations, audit log
- New `src/audit/` (`AuditModule`, global): `AuditService.record({ actorId, action, entityType, entityId, meta }, tx?)`
  and `changedFields()` (`{ field: { from, to } }`). Phases 5 and 6 will reuse it.
- New `src/admin/` (`AdminModule`). `@AdminOnly()` (`admin.guards.ts`) puts `JwtAuthGuard`, `RolesGuard` and
  `@Roles(ADMIN)` on each **controller class** (guide 9.1).
- Endpoints (all under `/api`):
  - `GET /admin/institutions?q&status&cursor&limit` → `{ items: AdminInstitutionDto[], nextCursor }` (with
    `stationCount`, `userCount`).
  - `POST /admin/institutions { name, domains }` → 201. 409 `DOMAIN_IN_USE` (`details.domain`) or `CONFLICT` (name).
  - `PATCH /admin/institutions/:id { name?, domains?, isActive?, reason? }`; `reason` is required when `isActive` is
    false.
  - `GET /admin/pickup-stations?institutionId&q&status&cursor&limit` → `{ items: AdminPickupStationDto[], nextCursor }`.
  - `POST /admin/pickup-stations { institutionId, name, address, contactName, contactPhone, openingHours }` → 201.
    400 `INVALID_REFERENCE` for an unknown institution, 409 for a duplicate name at that institution.
  - `PATCH /admin/pickup-stations/:id` (everything but `institutionId`, plus `isActive`/`reason`).
- Audit actions: `INSTITUTION_CREATED`, `INSTITUTION_UPDATED`, `INSTITUTION_DEACTIVATED`, `INSTITUTION_REACTIVATED`,
  `STATION_CREATED`, `STATION_UPDATED`, `STATION_DEACTIVATED`, `STATION_REACTIVATED`. Updates store
  `meta.changes` and `meta.reason`. A PATCH that changes nothing writes nothing.
- Shared: `src/common/pagination.ts` (`CursorQueryDto`, `cursorArgs`, `toPage`), `src/common/transforms.ts` (`Trim`).
  Opening hours DTO and validator: `src/admin/dto/opening-hours.dto.ts`.
- Removed `POST /institutions` and `src/institutions/dto/create-institution.dto.ts` (endpoint index: replaced by
  `/admin/institutions`).
- **Orders in progress block switching off (decided 2026-10-09).** `src/admin/open-orders.ts`
  `openSellerOrdersWhere()` counts seller orders at the school that are: unpaid and not yet expired; paid and
  waiting for drop-off, at the station or disputed; or collected with escrow still held (48-hour dispute window).
  Switching off with any of them → 409 `INSTITUTION_HAS_OPEN_ORDERS`, "University of Lagos has 3 orders in progress.
  Switch it off once every order has been collected and its 48-hour dispute window has passed.",
  `details.openOrders`. The count runs in the same transaction as the update. The `ConfirmDialog` shows API refusals
  in a "Couldn't switch off" banner, and the switch-off dialog lists the rule up front.

### Inactive institutions (your rule)
- `src/institutions/institution-access.ts`: `institutionInactive()` → 403 `INSTITUTION_INACTIVE`, "CampusMart isn't
  available at your school right now. Please check back soon."; `blockedByInstitution()` (everyone but `ADMIN`).
- `AuthService.register`: a matching but inactive institution → 403 (no account created).
- `AuthService.login`: after the password check, a non-admin at an inactive institution → 403.
- `AuthService.refresh`: a non-admin at an inactive institution → all their sessions revoked, 403, cookies cleared.
- `GET /institutions` and `GET /institutions/:id` hide inactive institutions (404). `findForEmail` still matches
  them, so sign-up can explain instead of sending the student to the waitlist.
- Swagger documents the 403 on register, login and refresh. Frontend: no change needed. Both forms show the API
  message, and a rejected refresh already signs the user out.

### Slice A frontend: the admin console
- `app/components/AppFrame.tsx`: the root layout's phone-width frame. On `/admin` it uses the full width (guide
  9.2.1). Only class names change, never the element tree, so providers keep their state.
- `app/admin/layout.tsx` + `components/AdminShell.tsx`: on desktop (≥1024 px), a left sidebar and content up to
  `max-w-6xl`. On phones and tablets, a top bar and the app's floating pill nav. Sign out in both. Admins only
  (`RoleGate`).
- Reusable pieces in `app/admin/components/`:
  - `DataTable`: column config. A table on wide screens and cards on phones, with loading, error + retry, empty,
    and "Load more" for cursor paging.
  - `ConfirmDialog`: a reason is required for destructive actions and sent to the API. Shows API errors.
  - `FilterBar`: debounced search plus All / Active / Switched off tabs.
  - `useUrlFilters`: filters live in the URL.
  - Also `useDialog`, `fields` (inputs in the app's style, `Toggle`), `DomainsInput` (chips), `StatusBadge`,
    `EmptyState`, `AdminPageHeader`, and `adminNav` (only existing screens).
- Pages:
  - `/admin`: overview with active institution and station counts, plus a "Get a new campus live" checklist.
  - `/admin/institutions`: list, search, status tabs, add/edit form and switch off/on.
  - `/admin/stations`: list, institution filter, search, status tabs, add/edit form with a weekly opening-hours
    editor, and switch off/on.
- Data: `lib/api/admin.ts` (generated types), `lib/api/hooks/useAdminInstitutions.ts`,
  `lib/api/hooks/useAdminStations.ts` (infinite queries, no `meta.persist`, guide 9.2.4), `lib/openingHours.ts`
  (summary such as "Mon–Fri 09:00–17:00", editor rows, checks; Phase 4's station picker can reuse it),
  `lib/validations/institution.ts`.
- `app/components/Modal.tsx`: `role="dialog"`, `aria-modal`, `aria-label`. `app/components/PWAInstallPrompt.tsx`:
  not shown on `/admin`.
- `lib/api/schema.d.ts` regenerated.

New migrations: none. New env vars: none. New error codes: `INSTITUTION_INACTIVE` (403), `DOMAIN_IN_USE` (409),
`INSTITUTION_HAS_OPEN_ORDERS` (409).

### Slice C: users, moderation, reports, audit log, overview, admin sign-in code

**Schema.** Migration `20261021090000_moderation` (additive):

| Change | Why |
|---|---|
| `User.suspendedAt`, `suspendedReason`, `suspendedById` | M6: the suspended user sees the admin's reason |
| `Listing.heldAt`, `heldWords`, `wentLiveAt`, `prohibitedConfirmedAt`, `moderationReason` | M2–M4: held by a banned word; went live (M4f); the seller's confirmation (M4a); the reason the seller sees (M3) |
| `SupportReport.reason`, `resolvedAt`, `resolvedById`, `resolutionNote`; unique `(userId, listingId)` | Listing reports, one per user per listing, and closing them |
| `EmailCodePurpose.ADMIN_SIGN_IN` | M7 |

The migration counts listings buyers could already see (active, sold out, archived) as having gone live.

**Backend** (`src/moderation/`, plus changes in `auth`, `listings` and `settings`):

| Endpoint | What it does |
|---|---|
| `GET /admin/users?q&role&institutionId&suspended` | Search by email or name, newest first |
| `PATCH /admin/users/:id/role { role }` | BUYER, SELLER or ADMIN (M1). Not your own role; riders are managed on the riders screen (`CANNOT_CHANGE_ROLE`); a seller needs a school (`NO_INSTITUTION`). Signs the user out; a seller who stops selling has their live listings archived. Audited `ROLE_CHANGED` |
| `POST /admin/users/:id/suspend { reason }` | Revokes every session at once, archives live listings (open orders stay). Not yourself or an admin (`CANNOT_SUSPEND`), not twice (`ALREADY_SUSPENDED`). Audited `USER_SUSPENDED` |
| `POST /admin/users/:id/unsuspend` | Archived listings stay archived (`NOT_SUSPENDED` if not suspended). Audited |
| `GET /admin/listings?view=REVIEW\|HIDDEN\|ALL&q` | REVIEW (oldest first): held by a banned word, flagged by reports or an admin, or edited after being taken down. With open report counts and reasons |
| `POST /admin/listings/:id/moderate { type, reason?, note? }` | APPROVE puts it live (again) and closes its reports. REJECT needs an M3 reason, hides it and closes its reports; `PROHIBITED_ITEM` on a listing that went live suspends the seller in the same transaction (M4d–M4f). FLAG and UNFLAG move a visible listing in and out of the queue. `SELLER_SUSPENDED`, `MODERATION_NOT_APPLICABLE`. Audited `LISTING_MODERATED`, plus a `ModerationAction` row |
| `POST /listings/:id/report { reason, details? }` | Verified users, live listings at their school, not their own (`OWN_LISTING`), once each (`ALREADY_REPORTED`). The 5th open report from a different user flags it (M4); `PROHIBITED_ITEM` hides it at once (M4b). Admins are alerted once |
| `GET /admin/support-reports?status&type`, `PATCH /admin/support-reports/:id { status, note }` | Closing needs a note. Audited |
| `GET /admin/audit-log?entityType&entityId&actorId&action` | Newest first, with the actor's email |
| `GET /admin/overview` | Accounts, sellers, paid orders (7 and 30 days), sales (30 days), escrow held, and what's waiting: listings to review, open reports, open disputes, verifications, failed payouts, suspended users |
| `GET/PUT /admin/settings/banned-words` | M4c. Starts from the M5 list; saved lower case, de-duplicated. Audited with what was added and removed |

- **Publishing (M4a, M4c):** `POST /listings` with `ACTIVE`, and `PATCH /listings/:id/status` to `ACTIVE`, need
  `confirmNotProhibited` (400 `CONFIRM_NOT_PROHIBITED`), once per listing. A banned word in the title or
  description (whole words, any case) saves it as `FLAGGED` with `heldAt` and alerts admins. Editing a live
  listing to use one does the same. Editing a listing an admin took down sends it back to the queue.
- **The seller's view:** `ListingDto` gains owner-only `heldForReview` and `moderationReason`.
- **Sign-in:**
  - A suspended user gets 401 `ACCOUNT_SUSPENDED` with the reason (M6), after the password check.
  - An admin's right password gets 401 `ADMIN_CODE_REQUIRED` and an emailed code (template `admin-sign-in`). The
    same `POST /auth/login` with `code` finishes it; a wrong code is 401 with its reason (`INVALID_CODE`,
    `CODE_EXPIRED`, `CODE_LOCKED`).
- **Notifications:** sellers are told in the app when a listing is approved, taken down or hidden by a report;
  admins are alerted (in the app and by email, P10) about held, resubmitted, flagged and hidden listings.

**Frontend:**

- **New admin screens:** `/admin/users`, `/admin/listings`, `/admin/reports`, `/admin/audit`, each with loading,
  empty and error states.
- **Overview:** platform numbers and a "Waiting for you" list.
- **Settings:** a banned-words editor.
- **Navigation:** the new screens are in the nav.
- **Dialogs:** `RoleDialog` and `RejectDialog`, the latter warning when it will suspend the seller.
  `ConfirmDialog` takes a label for its text field; `FilterBar` takes its own tabs.
- **Sign-in:** the admin code step, and the suspension message with the reason.
- **Sellers:** the "not on the prohibited list" tick with the list (`ProhibitedConfirm`, `lib/prohibitedItems.ts`)
  in the add form and the Publish action, and a `ModerationNotice` on the product and edit pages.
- **Buyers:** "Report this listing" on the product page (`ReportListingSheet`).
- **Data:** `lib/api/moderation.ts`, `lib/api/hooks/useAdminModeration.ts` and `useReportListing.ts` (admin
  queries aren't persisted), plus regenerated `lib/api/schema.d.ts`.

**Tests.**

- **e2e:**
  - `test/phase9-moderation.e2e-spec.ts`, 23 tests: the admin code, users and roles, suspension, banned words and
    the confirmation, moderation, reports, the audit log and the overview.
  - The access loop now includes riders.
  - The test helper `signIn` finishes an admin's code.
  - Older suites send `confirmNotProhibited` when they publish.
- **Unit:**
  - `moderation-rules`, `suspension`, `admin-users`, `admin-listings`, `listing-reports` and `banned-words`.
  - The auth spec covers the code and the reason; the listings spec covers resubmission.
- **Vitest:** the four new pages, `BannedWordsForm`, `ReportListingSheet`, the sign-in form, the listing form's
  confirmation, and the Publish dialog with `ModerationNotice`.

## 3. Verification evidence

Local Postgres 16; e2e on `campusmart_test`; browser walk on `campusmart_dev` (seeded).

| Item | Evidence |
|---|---|
| Admin routes 401 / 403 | e2e `test/phase9-admin.e2e-spec.ts` › access: "every /api/admin/* route returns 401 when signed out", "every /api/admin/* route returns 403 for a SELLER" (and BUYER, PICKUP_AGENT). The routes come from `buildOpenApiDocument(app).paths`; "lists the admin routes it checks" asserts at least 6. |
| Audit log: who, what, when | e2e › "an admin adds an institution; it is audited with who, what and when" (`actorId` = admin, `action`, `createdAt`), "switching one off needs a reason, and logs INSTITUTION_DEACTIVATED", "an admin adds a station…; it is audited", "edits a station… lists by institution" (`meta.changes` from/to), "switching a station off needs a reason and is audited". Unit `admin-institutions.service.spec.ts`, `admin-pickup-stations.service.spec.ts`, `audit.service.spec.ts`. |
| Inactive institution | e2e › "an inactive institution": "blocks sign-up with its domains, with a friendly message" (403, no user created), "is hidden from the public list and lookup", "stops a BUYER/SELLER/PICKUP_AGENT signing in, with the same message", "still lets an admin of that institution sign in", "cuts off a signed-in user on their next token refresh" (403, 0 live sessions, cookies cleared → `/auth/me` 401), "lets everyone back in once it is switched on again". Unit `auth.service.spec.ts` (register/login/refresh cases), `institution-access.spec.ts`, `institutions.service.spec.ts`. Vitest `SignUpForm.test.tsx` › "shows the friendly message for a switched-off school instead of the waitlist". Browser: `PASS Sign-up with a switched-off school shows the friendly message (not the waitlist)` + `evidence/phase9-admin/phone-signup-switched-off.png`. |
| Orders in progress block switching off | e2e › "switching off a school with orders in progress": "is refused with the number of orders in progress" (unpaid + at station + in dispute window = 3; a released and an expired order don't count; the school stays active and nothing is audited), "ignores other schools' orders". Unit `admin-institutions.service.spec.ts` › "refuses to switch off a school with orders in progress, and says how many", "does not count orders when only renaming". Vitest `ConfirmDialog.test.tsx` › "shows why the API refused (e.g. orders in progress) and stays open". Browser `evidence/phase9-admin/open-orders-walk.mjs`: `PASS desktop/phone: switching off is refused and the dialog says "has 1 order in progress"`; `desktop-switch-off-blocked.png`, `phone-switch-off-blocked.png`. |
| Definition of done | Unknown fields → 400 (e2e "rejects unknown fields and bad domains"; `institutionId` in a station PATCH → 400). Role checks on the controller class. Response DTOs in `schema.d.ts`, with no emails or secrets. Shared codes (`VALIDATION_FAILED`, `CONFLICT`, `DOMAIN_IN_USE`, `INVALID_REFERENCE`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`). Unit tests for every service rule; e2e happy paths and forbidden paths. Frontend loading, empty and error states in `DataTable` (Vitest `DataTable.test.tsx`). |
| Frontend patterns, mobile, states | Browser walk `evidence/phase9-admin/admin-walk.mjs` → `admin-walk-output.txt`: **17/17 PASS**, including no sideways scrolling at 390 px, cards on phones, pill nav visible, form as a bottom sheet, inline errors for a bad domain and for hours that close before they open, a reason required to switch off, filters in the URL. Screenshots: `desktop-overview.png`, `desktop-institution-added.png`, `desktop-switch-off-dialog.png`, `desktop-station-form.png`, `desktop-station-added.png`, `phone-overview.png`, `phone-institutions.png`, `phone-stations-viewport.png`, `phone-station-form.png`. Vitest: `DataTable`, `ConfirmDialog`, `DomainsInput`, `FilterBar` (300 ms debounce, keeps a trailing space while typing), `InstitutionForm`, `StationForm`, `AppFrame` (wide only on `/admin`), `openingHours`, `institution` validations. |
| Backend gate | `npx tsc --noEmit` exit 0; `npm run lint -- --max-warnings 0` exit 0; `npm run build` exit 0; `npm test` → 20 suites, 148 tests passed; `npm run test:e2e` → 5 suites, 67 tests passed. |
| Frontend gate | `npm run lint` exit 0 (0 errors, the 2 pre-existing warnings); `npx tsc --noEmit` exit 0; `npx vitest run` → 19 files, 100 tests passed; `API_ORIGIN=http://localhost:4000 npm run build` exit 0 (`/admin`, `/admin/institutions`, `/admin/stations` built). |
| `gen:api` / migrate diff | CI path (`npm run openapi:export` + `openapi-typescript`) and `npm run gen:api` against the running API produce byte-identical files (`diff -q`). `migrate diff --from-migrations … --exit-code` → exit 0 (no schema change in this slice). |

### Slice C evidence

- **Backend** (local Postgres 16, `campusmart_test`):
  - tsc clean, lint with 0 warnings, build OK.
  - Unit: 375/375 in 53 suites.
  - e2e: 183/183 in 15 suites, 23 of them in `phase9-moderation.e2e-spec.ts`; the access loop covers 44 admin
    routes.
  - `prisma migrate diff --exit-code` is clean.
- **Frontend:**
  - Lint and tsc clean; Vitest 309/309 in 73 files.
  - `API_ORIGIN=http://localhost:4000 pnpm run build` OK, with `/admin/users`, `/admin/listings`, `/admin/reports`
    and `/admin/audit` built.
- **gen:api:** `lib/api/schema.d.ts` regenerated with the backend changes; CI re-checks it.
- **GitHub CI:**
  - [Run 82](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39159753546) on `e02fcd9` (the
    last code change) is green.
  - Runs 78–81 were red only on the frontend link crawl (`app/routes.test.ts`). The backend's notifications linked to
    `/admin/listings` before that page was built in `e02fcd9`. The backend job passed in all four.
- **Definition of done:**
  - Every new body and query DTO rejects unknown fields (e2e: `extra: true` on a role change, `password=x` on the
    users list, `type: 'DELETE'`).
  - Admin checks sit on each controller class (`@AdminOnly()`); reporting needs a verified email.
  - Rules live in the services: your own role, admins, the reporter's school, own listing.
  - Responses are documented DTOs; errors use shared codes.
  - Each service has unit tests and e2e happy and forbidden paths (401, 403, 400, 404, 409).
  - Each screen has loading, empty and error states.
- **Browser walk** ([`phase9-moderation-walk.mjs`](evidence/phase9-admin/phase9-moderation-walk.mjs) →
  [`phase9-moderation-walk-output.txt`](evidence/phase9-admin/phase9-moderation-walk-output.txt), **32/32**):
  Chromium → `next start` → NestJS → `campusmart_dev`, in West Africa Time. The API ran with the Phase 5 Paystack
  stub and the made-up local `CLOUDINARY_*` values, as in Phase 7.
  - **Seller (phone).**
    - Publishing without the tick is refused.
    - "Toy gun for display" waits for review and admins are alerted (`phone-seller-held-for-review`).
    - Publishing a draft from the products list asks for the tick and shows the list
      (`phone-seller-publish-confirm`), then goes live with the confirmation saved.
  - **Admin sign-in (laptop).** The right password asks for the code. The code printed to the API console. A wrong
    code is refused with its reason, and the right one signs in (`desktop-admin-sign-in-code`).
  - **Overview** with the numbers and what's waiting (`desktop-admin-overview`, `phone-admin-overview`).
  - **Held listing.**
    - The queue shows "Uses: gun" (`desktop-admin-listings-queue`).
    - Taking it down as a prohibited item says the seller won't be suspended (M4f) (`desktop-admin-reject-dialog`).
    - The seller sees "Taken down: Prohibited item: Toy weapons aren't allowed…" and isn't suspended
      (`phone-seller-taken-down`).
  - **Buyer report (phone).**
    - A prohibited-item report on Amaka's desk lamp hides it at once (`phone-buyer-report-sheet`); buyers can no
      longer open it.
    - The admin approves it back, which closes the report.
    - A "misleading" report on the cargo pants is closed with a note (`desktop-admin-reports`).
  - **Suspension (M6).**
    - A throwaway buyer is signed in; the admin suspends them (`desktop-admin-suspend-dialog`), and their next
      request is refused.
    - Signing in again shows "Your account is suspended: Walk test: spam listings…" (`phone-suspended-sign-in`).
    - Lifting it lets them in.
  - **Roles (M1).** Making them a seller opens a store and signs them out; then back to buyer
    (`desktop-admin-role-dialog`, `desktop-admin-users`).
  - **Audit log** for that user (`desktop-admin-audit`). It shows two walk runs; the first run's checks failed on four
    script mistakes (below), but its admin actions were real and audited.
  - **Banned words** (`desktop-admin-banned-words`): adding "airsoft" is saved and audited, then removed.
  - **Phone:** `/admin/users`, `/admin/listings` and `/admin` have no sideways scrolling (`phone-admin-users`,
    `phone-admin-listings-taken-down`, `phone-admin-overview`).
  - **Reruns.** The first run passed 28/32. All four failures were in the script, not the app. Two compared
    booleans with `t` where SQL text gives `true`. Two read the first `role="alert"`, which is Next's route
    announcer; they now read the form's own message. The second run is the evidence.

### MANUAL: look over the admin console (for you)

1. `cd backend && npm run dev`, then in the repo root `API_ORIGIN=http://localhost:4000 npx next dev -H 0.0.0.0 -p 3000`.
2. On a laptop, open `http://localhost:3000/onboarding/buyers/sign-in` and sign in as the seed admin
   (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Expect the "Admin console" overview.
3. Institutions: add one with two domains, edit it, switch it off (you'll be asked for a reason), switch it back on.
   Try the search and the Active / Switched off tabs.
4. Pickup stations: add one for your school, change its opening hours, filter by institution.
5. Repeat steps 2–4 on your phone (`http://<laptop-LAN-IP>:3000`). Expect cards instead of a table, the pill nav at
   the bottom, and forms that slide up from the bottom.
6. Tell me anything that felt unclear (wording, order of fields, what a button does).

### MANUAL: the slice C screens (for you)

1. Start both apps as above and sign in as the seed admin. You'll be asked for a 6-digit code: it prints in the API's
   terminal (`[dev mail] ... template=admin-sign-in`) until email is set up.
2. Overview: the numbers and "Waiting for you". Users: search, filter by role, change a test account's role, suspend
   it with a reason, and sign in as it to see the message. Then lift it.
3. Listings: as a seller, publish something whose title uses a word from Settings → Banned words, and see it wait in
   "To review". Take it down with a reason and look at it as the seller.
4. As a buyer, report a listing; see it in Reports and close it. Look at the Audit log for what you did.
5. Tell me anything that felt unclear.

## 4. Deviations and assumptions

1. **Built out of order.** Slice A of Phase 9 came right after Phase 2, as the guide recommends and you chose.
2. **Inactive institutions follow your rule** (not in the guide). `INSTITUTION_INACTIVE` is a 403 on register,
   login and refresh, because the school exists but is closed. `INSTITUTION_NOT_SUPPORTED` stays 422 → waitlist. The
   check isn't in `JwtStrategy`, so an access token keeps working for up to 15 minutes ("cut off on their next
   token refresh"). The refresh revokes all of that user's sessions.
3. **`POST /institutions` removed now**, since `/admin/institutions` replaces it (endpoint index).
4. **Domains are unique across institutions** (409 `DOMAIN_IN_USE`), so an email maps to one school. A parent and a
   sub-domain at two schools are still allowed; the most specific match wins (the Phase 1 rule). An institution
   needs at least one domain. Domains are trimmed and lowercased, a leading `@` is dropped, and a pasted email keeps
   only its domain.
5. **Names are unique ignoring case:** institutions globally, stations per institution (409 with a readable message).
6. **A station's institution can't change** after it's created (orders and agents belong to its campus); PATCH
   rejects `institutionId`.
7. **Reasons:** switching an institution or station off needs a 3–500 character reason (guide 9.2.3), stored in
   `AuditLog.meta.reason`. Switching back on asks for confirmation without a reason.
8. **List shape:** `{ items, nextCursor }` with cursor paging on `id`, ordered by name (stations by institution, then
   name). `limit` 1–100, default 20. `status` filter values are `ACTIVE`/`INACTIVE` (D4); the UI calls them "Active"
   and "Switched off".
9. **Opening hours:** one entry per day (`MON`…`SUN`), 24-hour `HH:MM`, closing after opening, 1–7 entries, stored
   Monday first. A new station starts Monday–Friday 09:00–17:00. Phone numbers must match `^\+?\d[\d ()-]{6,19}$`.
10. **Overview** was a setup checklist plus active counts in slice A, since the guide's `GET /admin/overview`
    metrics (GMV, escrow, disputes) needed Phase 5 data. Slice C added them. The nav lists only screens that exist,
    so there are no dead links.
11. **Shared components touched:** `Modal` gained dialog semantics (no visual change). The install prompt is hidden
    on `/admin` (it advertises "a better shopping experience" and covered the admin nav on phones).
12. **Station form's institution picker** loads up to 100 institutions (one page). Fine for now; revisit if there
    are ever more than 100 schools.
13. **Admin routes don't require a verified email.** The guide doesn't ask for it, and the seed admin is verified.
14. **Local dev data.** The browser walk left demo rows in `campusmart_dev`: institutions Lagos State University,
    Yaba College of Technology, Federal College of Education and Lagos City Polytechnic (all switched off), and
    University of Lagos stations "Faculty of Science Pickup Point", "Library Pickup Point" and "Hostel Gate Pickup
    Point", plus a demo unpaid order `CM-DEMO01` (buyer `demo-buyer@unilag.edu.ng`, seller
    `demo-seller@unilag.edu.ng`, no passwords) that expires 3 hours after it was made, at which point it stops
    counting. Local only; a reset plus seed clears them.
15. **Orders in progress** (your decision) include unpaid checkouts until they expire and collected orders until
    escrow leaves `HELD`, since the buyer must be able to sign in to dispute. Phase 4's checkout must also refuse a
    buyer whose institution is switched off, because an access token stays valid for up to 15 minutes after the
    switch.

### Slice C

16. **Endpoint shapes differ from the guide's table where a decision changed them:**
    - `GET /admin/listings` takes `view=REVIEW|HIDDEN|ALL` instead of `flagged=true`, because the queue also holds
      banned-word listings.
    - `moderate` takes `{ type, reason, note }` with `reason` an M3 choice.
    - Reports are `PATCH /admin/support-reports/:id { status, note }`, with a note to close.
    - `PATCH /admin/users/:id/role` takes only `{ role }`: pickup agents went with the stations (DL9), and riders
      are invited on their own screen.
    - The buyer report adds optional `details`.
    - Five reports flag a listing (M4), not the guide's three.
17. **Suspension takes effect at once,** not within 15 minutes: the sessions are revoked and every request checks its
    session. Admins can't suspend themselves or another admin (remove the role first). Listings archived by a
    suspension stay archived when it's lifted; the seller publishes what they still sell.
18. **Role changes sign the user out.** A seller who becomes a buyer or admin has their live listings archived; open
    orders carry on. You can't change your own role, and the admin rows are locked in one order while changing, so
    two admins removing each other can't leave none.
19. **A taken-down listing goes back to the queue when its seller edits it.** The decisions didn't say how a seller
    recovers from a rejection. This lets them fix it without a new listing, and admins are alerted.
20. **Approving and unflagging close the listing's open reports;** taking it down does too, with the reason. A hidden
    listing of a suspended seller can't be approved until the suspension is lifted (`SELLER_SUSPENDED`).
21. **Reports:** only live listings at the reporter's school, one report per user per listing even after it's closed,
    never your own. Any one prohibited-item report hides a listing (M4b), so someone could hide a fair listing
    until an admin approves it back; admins are alerted at once.
22. **The admin code** uses the same `POST /auth/login` with an optional `code`, rather than a separate endpoint, so
    the password is checked again with the code. Codes last 10 minutes, 5 wrong tries lock one, and at most 1 is
    sent a minute and 5 an hour (the Phase 1 limits). Until `MAIL_*` is set the code prints to the API console
    (M7); production can't start without `MAIL_*`.
23. **Notifications about moderation are in the app only** (T7: email is for order and payment events). Admin
    alerts go by email too (P10). A suspended user isn't notified; they see the reason at sign-in.
24. **The suspension message** says "Contact CampusMart support" without contact details; the support email,
    phone and WhatsApp come from environment variables in Phase 10 (T4).
25. **Banned words** match whole words and phrases in the title and description, in any case. Changing the list
    doesn't re-check existing listings; it applies when a listing is published or its text edited. The starter
    list is in `backend/src/moderation/moderation-rules.ts`.
26. **Overview numbers:** paid orders and sales count orders by when they were paid, and sales include delivery
    fees; "held in escrow" is the sellers' payouts held now.
27. **The audit log has no index on time.** It reads newest first by `createdAt`; worth an index once it grows
    large.
28. **Local dev data.** The walk created a throwaway buyer `walk.suspended@students.unilag.edu.ng` (password as the
    other local accounts) and soft-deleted its own listings when it finished. Amaka's desk lamp and the cargo pants
    each have a closed report from Tobi.

## 5. Needs from you

- **MANUAL check** above: the console on a phone and a laptop.
- ~~**Switching off a school with orders in progress**~~ **Decided 2026-10-09:** blocked, with the count shown in the
  dialog. Done.
- **Review the starter banned-word list** (Settings → Banned words). It's drawn from your M5 list. Some words are
  common in harmless listings, such as "weed" or "expo" (exam-leak slang), and only send a listing to review, but
  remove any you'd rather not hold.
- **The other admins sign up** with their email, then you make them admins at `/admin/users` (M1).
- **Email (`MAIL_*`, S4)** is needed before admins can sign in on a production server, since the code is emailed
  (already in [setup-checklist.md](setup-checklist.md#14-email-mail_-open-since-phase-1)).
- **MANUAL check** of the slice C screens (above).
