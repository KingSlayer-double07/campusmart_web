# CampusMart API

NestJS 11 backend for CampusMart, using Prisma 7 with Neon Postgres. Browsers never call it directly: the
Next.js app rewrites `/api/*` to this server (decision D1 in [the implementation guide](../docs/implementation-guide.md)).

## Prerequisites

- Node.js 22
- A Postgres database. The project uses Neon; any Postgres 15+ works for local development.

## Setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Fill in `.env`. Every variable is validated at startup by the zod schema in [`src/config/env.ts`](src/config/env.ts);
if one is missing or malformed the app stops before it starts and names each offending variable. Treat that file as
the source of truth when this table and `.env.example` disagree.

| Variable | Required | Default | Notes |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | | `development` | `development`, `test` or `production` |
| `PORT` | | `4000` | |
| `FRONTEND_URL` | | `http://localhost:3000` | CORS origin, for Swagger and local tools only |
| `APP_URL` | | `http://localhost:3000` | Frontend URL used in emails and the Paystack callback |
| `DATABASE_URL` | ✓ | | Pooled connection string, used by the app at runtime |
| `DIRECT_URL` | ✓ | | Direct (unpooled) connection string, used by the Prisma CLI for migrations |
| `JWT_SECRET` | ✓ | | At least 32 random characters |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | production | | SMTP. In development emails print to the console |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from Phase 3 | | Image uploads |
| `PAYSTACK_SECRET_KEY` | when payments are enabled | | Use an `sk_test_…` key locally |
| `PAYMENTS_ENABLED` | | `false` | Checkout returns no payment URL while `false` |
| `PLATFORM_FEE_BPS` | | `0` | Basis points; 100 = 1% |
| `ORDER_PAYMENT_TTL_MINUTES` | | `30` | |
| `DROP_OFF_DEADLINE_DAYS` | | `3` | |
| `ESCROW_DISPUTE_WINDOW_HOURS` | | `48` | `0` is allowed for testing |
| `LOW_STOCK_THRESHOLD` | | `3` | |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed only | | Read by `prisma/seed.ts`, never by the API |

### 3. Set up the database

```bash
npx prisma migrate dev
npx prisma generate
```

`migrate dev` applies the migrations in `prisma/migrations` to the database named by `DIRECT_URL`. Prisma 7 no longer
generates the client as part of `migrate dev`, so run `generate` afterwards. The client is written to
`src/generated/prisma`, which is git-ignored; run `generate` again after every pull that touches `prisma/schema.prisma`.

To change the schema, edit `prisma/schema.prisma` and run `npx prisma migrate dev --name <short_description>`.
CI fails when the schema and the migrations disagree.

### 4. Start the server

```bash
npm run dev
```

This starts the server in watch mode at `http://localhost:4000/api`. Every route is under the `/api` prefix.

## API docs

Swagger UI is served at **http://localhost:4000/api/docs**. The raw OpenAPI JSON is at
`http://localhost:4000/api/docs-json`; the frontend generates its types from it. Swagger is not mounted when
`NODE_ENV=production`. Authenticated routes use the `access_token` cookie, so sign in through
`POST /api/auth/login` first and Swagger sends the cookie with later requests.

## Responses and errors

Success: `{ "success": true, "data": …, "timestamp": "…" }`. Errors:

```json
{
  "statusCode": 409,
  "code": "OUT_OF_STOCK",
  "message": "Only 2 left",
  "details": { "listingId": "…", "available": 2 },
  "path": "/api/orders",
  "timestamp": "2026-09-30T12:00:00.000Z"
}
```

Branch on `code`, not `message`. The generic codes are `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `INVALID_REFERENCE`, `RATE_LIMITED` and `INTERNAL`. Feature errors add their own:

```ts
throw new ConflictException({ code: 'OUT_OF_STOCK', message: 'Only 2 left', details });
```

## Tests

```bash
npm test            # unit tests, Prisma mocked
npm run test:e2e    # supertest against a real Postgres
```

The e2e suites truncate every table, so they refuse to run unless the database name in `DATABASE_URL` contains
`test`. Point them at a throwaway database:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/campusmart_test
export DIRECT_URL=$DATABASE_URL
npx prisma migrate deploy
npm run test:e2e
```

## Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Run in watch mode |
| `npm run debug` | Watch mode with the Node inspector attached |
| `npm run build` / `npm run prod` | Compile to `dist/` and run it |
| `npm run lint` | ESLint (checks only; `npx eslint --fix` to fix) |
| `npm test` / `npm run test:e2e` | Unit and end-to-end tests |
