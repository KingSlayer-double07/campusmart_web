# CampusMart API

NestJS 11 backend for CampusMart, using Prisma 7 with Neon Postgres. Paystack handles payments.

## Prerequisites

- Node.js 20+
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

Then fill in `.env`. Every variable is validated at startup by the zod schema in [`src/config/env.ts`](src/config/env.ts). If anything is missing or malformed, the app stops before it starts and names each offending variable. Treat that file as the source of truth when this table and `.env.example` disagree.

| Variable | Required | Default | Notes |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | | `development` | `development`, `test` or `production` |
| `PORT` | | `4000` | |
| `FRONTEND_URL` | | `http://localhost:3000` | CORS origin; cookies are sent cross-origin to it |
| `APP_URL` | | `http://localhost:3000` | |
| `DATABASE_URL` | ✓ | | Pooled connection string, used by the app at runtime |
| `DIRECT_URL` | ✓ | | Direct (unpooled) connection string, used by Prisma CLI for migrations |
| `JWT_SECRET` | ✓ | | |
| `CLOUDINARY_CLOUD_NAME` | ✓ | | Image uploads |
| `CLOUDINARY_API_KEY` | ✓ | | |
| `CLOUDINARY_API_SECRET` | ✓ | | |
| `MAIL_HOST` | ✓ | | SMTP |
| `MAIL_PORT` | ✓ | | |
| `MAIL_USER` | ✓ | | |
| `MAIL_PASS` | ✓ | | |
| `MAIL_FROM` | ✓ | | e.g. `CampusMart <noreply@campusmart.com>` |
| `PAYSTACK_SECRET_KEY` | ✓ | | Use an `sk_test_…` key locally |
| `PAYSTACK_ENABLED` | | `true` | |
| `PLATFORM_FEE_BPS` | | `0` | Basis points; 100 = 1% |
| `ORDER_PAYMENT_TTL_MINUTES` | | `30` | |
| `ESCROW_DISPUTE_WINDOW_HOURS` | | `48` | |
| `LOW_STOCK_THRESHOLD` | | `3` | |
| `SEED_ADMIN_EMAIL` | ✓ | | |
| `SEED_ADMIN_PASSWORD` | ✓ | | |

### 3. Set up the database

```bash
npx prisma migrate dev
npx prisma generate
```

`migrate dev` applies the migrations in `prisma/migrations` to the database named by `DIRECT_URL`. Prisma 7 no longer generates the client as part of `migrate dev`, so run `generate` afterwards. The client is written to `src/generated/prisma`, which is git-ignored, so run `generate` again after every pull that touches `prisma/schema.prisma`.

To change the schema, edit `prisma/schema.prisma` and run `npx prisma migrate dev --name <short_description>`.

### 4. Start the server

```bash
npm run start:dev
```

This starts the server in watch mode. The API runs at `http://localhost:4000/api`, and every route is under the `/api` prefix.

## API docs

Swagger UI is served at **http://localhost:4000/api/docs**. The raw OpenAPI JSON is at `http://localhost:4000/api/docs-json`; point frontend type generation at that URL.

Swagger is not mounted when `NODE_ENV=production`.

## Error format

Every error response has this shape:

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

Branch on `code`, not `message`. The generic codes are `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_REFERENCE`, `RATE_LIMITED` and `INTERNAL`. Feature errors add their own codes:

```ts
throw new ConflictException({ code: 'OUT_OF_STOCK', message: 'Only 2 left', details });
```

## Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run start:dev` | Run in watch mode |
| `npm run start:debug` | Watch mode with the Node inspector attached |
| `npm run build` / `npm run start:prod` | Compile to `dist/` and run it |
| `npm run lint` | ESLint with auto-fix |
| `npm test` / `npm run test:e2e` | Unit and end-to-end tests |
