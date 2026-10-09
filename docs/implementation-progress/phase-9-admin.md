# Phase 9: admin UI and moderation

Phase 9 is built in slices as the other phases land (guide: "Build the institutions and stations screens right after
Phase 2 ... Add the rest as each phase lands").

| Slice | Branch | Status |
|---|---|---|
| A. Institutions and pickup stations (after Phase 2, Collins' decision 2026-10-09) | `feat/phase-9-admin-institutions-stations` | DONE pending manual checks |
| B. Users and roles, verifications, listings, disputes, payouts, reports, audit, overview metrics | later, as Phases 3 to 10 land | NOT STARTED |

## 1. Checklist

From the guide, verbatim. These close when slice B is done; the notes say where slice A leaves each one.

- [ ] Every `/api/admin/*` route returns 403 for a seller and 401 when signed out. Test all of them in a loop from the route list.
  *Slice A: passing for all 6 admin routes so far. The test reads the route list from the OpenAPI document, so new
  routes are covered automatically.*
- [ ] Suspending a user signs them out within 15 minutes, and immediately on their next refresh.
  *Slice B (Users area).*
- [ ] Every admin mutation appears in the audit log with who, what and when.
  *Slice A: passing for all 4 mutations so far (create/edit institution, create/edit station).*
- [ ] A new campus can go live end to end from the admin UI alone: institution, domains, station, agent.
  *Slice A: institution, domains and station work from the UI. The agent step needs the Users screen
  (`PATCH /admin/users/:id/role`), slice B.*

Slice A gate:

- [x] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [x] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [x] `npm run gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] Inactive institution (Collins, 2026-10-09): sign-up with its domains is blocked with a friendly message; it is
  hidden from the public list; buyers, sellers and pickup agents can't sign in; only admins can; anyone already
  signed in is cut off on their next token refresh.
- [x] Every new endpoint meets the definition of done.
- [x] Admin screens follow the existing frontend patterns, are mobile-responsive and have loading, empty and error
  states.
- [ ] MANUAL: Collins looks over the console on a phone and a laptop and confirms it's easy to understand (steps below).

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

### Inactive institutions (Collins' rule)
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

New migrations: none. New env vars: none. New error codes: `INSTITUTION_INACTIVE` (403), `DOMAIN_IN_USE` (409).

## 3. Verification evidence

Local Postgres 16; e2e on `campusmart_test`; browser walk on `campusmart_dev` (seeded).

| Item | Evidence |
|---|---|
| Admin routes 401 / 403 | e2e `test/phase9-admin.e2e-spec.ts` › access: "every /api/admin/* route returns 401 when signed out", "every /api/admin/* route returns 403 for a SELLER" (and BUYER, PICKUP_AGENT). The routes come from `buildOpenApiDocument(app).paths`; "lists the admin routes it checks" asserts at least 6. |
| Audit log: who, what, when | e2e › "an admin adds an institution; it is audited with who, what and when" (`actorId` = admin, `action`, `createdAt`), "switching one off needs a reason, and logs INSTITUTION_DEACTIVATED", "an admin adds a station…; it is audited", "edits a station… lists by institution" (`meta.changes` from/to), "switching a station off needs a reason and is audited". Unit `admin-institutions.service.spec.ts`, `admin-pickup-stations.service.spec.ts`, `audit.service.spec.ts`. |
| Inactive institution | e2e › "an inactive institution": "blocks sign-up with its domains, with a friendly message" (403, no user created), "is hidden from the public list and lookup", "stops a BUYER/SELLER/PICKUP_AGENT signing in, with the same message", "still lets an admin of that institution sign in", "cuts off a signed-in user on their next token refresh" (403, 0 live sessions, cookies cleared → `/auth/me` 401), "lets everyone back in once it is switched on again". Unit `auth.service.spec.ts` (register/login/refresh cases), `institution-access.spec.ts`, `institutions.service.spec.ts`. Vitest `SignUpForm.test.tsx` › "shows the friendly message for a switched-off school instead of the waitlist". Browser: `PASS Sign-up with a switched-off school shows the friendly message (not the waitlist)` + `evidence/phase9-admin/phone-signup-switched-off.png`. |
| Definition of done | Unknown fields → 400 (e2e "rejects unknown fields and bad domains"; `institutionId` in a station PATCH → 400). Role checks on the controller class. Response DTOs in `schema.d.ts`, with no emails or secrets. Shared codes (`VALIDATION_FAILED`, `CONFLICT`, `DOMAIN_IN_USE`, `INVALID_REFERENCE`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`). Unit tests for every service rule; e2e happy paths and forbidden paths. Frontend loading, empty and error states in `DataTable` (Vitest `DataTable.test.tsx`). |
| Frontend patterns, mobile, states | Browser walk `evidence/phase9-admin/admin-walk.mjs` → `admin-walk-output.txt`: **17/17 PASS**, including no sideways scrolling at 390 px, cards on phones, pill nav visible, form as a bottom sheet, inline errors for a bad domain and for hours that close before they open, a reason required to switch off, filters in the URL. Screenshots: `desktop-overview.png`, `desktop-institution-added.png`, `desktop-switch-off-dialog.png`, `desktop-station-form.png`, `desktop-station-added.png`, `phone-overview.png`, `phone-institutions.png`, `phone-stations-viewport.png`, `phone-station-form.png`. Vitest: `DataTable`, `ConfirmDialog`, `DomainsInput`, `FilterBar` (300 ms debounce, keeps a trailing space while typing), `InstitutionForm`, `StationForm`, `AppFrame` (wide only on `/admin`), `openingHours`, `institution` validations. |
| Backend gate | `npx tsc --noEmit` exit 0; `npm run lint -- --max-warnings 0` exit 0; `npm run build` exit 0; `npm test` → 20 suites, 146 tests passed; `npm run test:e2e` → 5 suites, 65 tests passed. |
| Frontend gate | `npm run lint` exit 0 (0 errors, the 2 pre-existing warnings); `npx tsc --noEmit` exit 0; `npx vitest run` → 19 files, 100 tests passed; `API_ORIGIN=http://localhost:4000 npm run build` exit 0 (`/admin`, `/admin/institutions`, `/admin/stations` built). |
| `gen:api` / migrate diff | CI path (`npm run openapi:export` + `openapi-typescript`) and `npm run gen:api` against the running API produce byte-identical files (`diff -q`). `migrate diff --from-migrations … --exit-code` → exit 0 (no schema change in this slice). |

### MANUAL: look over the admin console (for Collins)

1. `cd backend && npm run dev`, then in the repo root `API_ORIGIN=http://localhost:4000 npx next dev -H 0.0.0.0 -p 3000`.
2. On a laptop, open `http://localhost:3000/onboarding/buyers/sign-in` and sign in as the seed admin
   (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Expect the "Admin console" overview.
3. Institutions: add one with two domains, edit it, switch it off (you'll be asked for a reason), switch it back on.
   Try the search and the Active / Switched off tabs.
4. Pickup stations: add one for your school, change its opening hours, filter by institution.
5. Repeat steps 2–4 on your phone (`http://<laptop-LAN-IP>:3000`). Expect cards instead of a table, the pill nav at
   the bottom, and forms that slide up from the bottom.
6. Tell me anything that felt unclear (wording, order of fields, what a button does).

## 4. Deviations and assumptions

1. **Built out of order.** Slice A of Phase 9 came right after Phase 2, as the guide recommends and Collins chose.
2. **Inactive institutions follow Collins' rule** (not in the guide). `INSTITUTION_INACTIVE` is a 403 on register,
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
10. **Overview** is a setup checklist plus active counts, not the guide's `GET /admin/overview` metrics (GMV,
    escrow, disputes), which need Phase 5 data. The nav lists only screens that exist, so there are no dead links.
11. **Shared components touched:** `Modal` gained dialog semantics (no visual change). The install prompt is hidden
    on `/admin` (it advertises "a better shopping experience" and covered the admin nav on phones).
12. **Station form's institution picker** loads up to 100 institutions (one page). Fine for now; revisit if there
    are ever more than 100 schools.
13. **Admin routes don't require a verified email.** The guide doesn't ask for it, and the seed admin is verified.
14. **Local dev data.** The browser walk left demo rows in `campusmart_dev`: institutions Lagos State University,
    Yaba College of Technology, Federal College of Education and Lagos City Polytechnic (all switched off), and
    University of Lagos stations "Faculty of Science Pickup Point", "Library Pickup Point" and "Hostel Gate Pickup
    Point". Local only; a reset plus seed clears them.

## 5. Needs from Collins

- **MANUAL check** above: the console on a phone and a laptop.
- **Switching off a school with orders in progress (decide before Phase 6).** Under the inactive-institution rule,
  that school's pickup agents can't sign in, so parcels already dropped off can't be handed over and their escrow
  stays held until the school is switched back on. Options: (a) block switching off while any seller order there is
  open; (b) let pickup agents keep signing in; (c) leave it as is and handle it by hand. My suggestion is (a),
  showing the count of open orders in the dialog.
