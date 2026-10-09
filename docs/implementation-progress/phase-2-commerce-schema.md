# Phase 2: commerce schema migration

Branch: `feat/phase-2-commerce-schema` (off `backend`).
Status: **IN PROGRESS**

## 1. Checklist

From the guide, verbatim:

- [ ] `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` is empty.
- [ ] The seed creates an institution, two stations and an admin you can sign in with.
- [ ] No `Decimal` remains in the schema.
- [ ] A user can receive two reviews.

Gate items:

- [ ] Backend `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, `npm run build`, `npm test`, `npm run test:e2e` pass.
- [ ] Frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- [ ] `npm run gen:api` produces no diff.
- [ ] `prisma migrate reset` run on the local dev database only (after Collins confirmed the migration SQL summary).

## 2. Changes

## 3. Verification evidence

## 4. Deviations and assumptions

## 5. Needs from Collins
