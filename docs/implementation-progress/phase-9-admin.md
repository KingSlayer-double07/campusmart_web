# Phase 9: admin UI and moderation

Phase 9 is built in slices as the other phases land (guide: "Build the institutions and stations screens right after
Phase 2 ... Add the rest as each phase lands").

| Slice | Branch | Status |
|---|---|---|
| A. Institutions and pickup stations (after Phase 2, Collins' decision 2026-10-09) | `feat/phase-9-admin-institutions-stations` | IN PROGRESS |
| B. Users, verifications, listings, disputes, payouts, reports, audit, overview | later | NOT STARTED |

## 1. Checklist

From the guide, verbatim:

- [ ] Every `/api/admin/*` route returns 403 for a seller and 401 when signed out. Test all of them in a loop from the route list.
- [ ] Suspending a user signs them out within 15 minutes, and immediately on their next refresh.
- [ ] Every admin mutation appears in the audit log with who, what and when.
- [ ] A new campus can go live end to end from the admin UI alone: institution, domains, station, agent.

Slice A gate:

- [ ] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [ ] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [ ] `npm run gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [ ] Inactive institution (Collins, 2026-10-09): sign-up with its domains is blocked with a friendly message; it is
  hidden from the public list; buyers, sellers and pickup agents can't sign in; only admins can; anyone already
  signed in is cut off on their next token refresh.
- [ ] Every new endpoint meets the definition of done.
- [ ] Admin screens follow the existing frontend patterns, are mobile-responsive and have loading, empty and error
  states.

## 2. Changes

## 3. Verification evidence

## 4. Deviations and assumptions

## 5. Needs from Collins
