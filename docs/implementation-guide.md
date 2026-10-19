# CampusMart Implementation Guide

Sep 29, 2026 · @Dev Team

Work through the phases in order: Phases 0 and 1 unblock everything, Phase 2 is one schema migration, Phases 3 to 6 are the commerce core, and Phases 7 to 10 can overlap. Every phase ends with a checklist. Don't start the next phase until that checklist passes.

## How to use this guide

|Phase|Goal|Depends on|Size|
|---|---|---|---|
|0|Close the security holes and clean up the repo|nothing|1 to 2 days|
|1|Frontend and backend talk for real: proxy, envelope, auth, sessions, school-email sign-up|0|4 to 6 days|
|2|Commerce schema: money in kobo, seller orders, escrow, variants, pickup stations|1|2 days|
|3|Listings, variants, image uploads, seller store profile|2|4 to 5 days|
|4|Server cart, pickup-station choice, checkout with stock reservation|3|4 days|
|5|Paystack payments, webhooks, escrow, payouts, refunds|4|5 days|
|6|Drop-off, collection, disputes, pickup-agent screens|5|4 days|
|7|Seller analytics and inventory alerts|4 (6 for payout figures)|3 days|
|8|Wishlist, store pages, reviews|3 (6 for reviews)|3 days|
|9|Admin UI and moderation|1, then grows with each phase|5 days|
|10|Notifications, support, profile, Google sign-in, health|varies|4 days|

### Sizes assume one developer and are rough.

### Conventions used throughout

- Branch per phase off `develop` : `feat/phase-3-listings` . Merge to `develop` when the checklist passes; release `develop` to `master` .

- Backend modules follow the existing layout: `src/<module>/<module>.module.ts` , `.controller.ts` , `.service.ts` , `dto/` , and a `.service.spec.ts` beside the service.

- Every endpoint has request DTOs **and** a response DTO class with `@ApiProperty` , so the generated frontend types are correct (Phase 1.5).

- Frontend server state lives in React Query hooks under `lib/api/hooks/` . Zustand is only for UI state and the guest cart.

- Paths in this guide are relative to the repo root. `backend/...` is the API, and everything else is the Next.js app.

### Definition of done for any endpoint

- The request DTO validates every field; unknown fields are rejected.

- Auth, role and ownership are checked in the service, not just the UI.

- The response DTO is documented in Swagger and never includes secrets or other users' emails.

- Errors use the shared codes (Phase 0.7).

- There's a unit test for the service rule and an e2e test for the happy path plus one forbidden path.

- The frontend consumer has loading, empty and error states.

## Decisions record

The decisions below are locked in for everything that follows. The first seven come from your answers. The rest are my calls on the questions you handed back to me.

|#|Topic|Decision|Why|
|---|---|---|---|
|D1|Domains and cookies|The browser only ever talks to the Next.js origin. Next rewrites `/api/*` to the NestJS server. Cookies are first-party, `SameSite=Lax`, with no `Domain` attribute.|Works on any domain you pick later, with no CORS or third-party-cookie problems. Middleware can read the auth cookie.|
|D2|Response shape|Success: `{ success: true, data, timestamp }`. Error: `{ statusCode, code, message, path, timestamp }`. The client unwraps `data`.|Keeps the existing interceptor; one place to change on the client.|

|#|Topic|Decision|Why|
|---|---|---|---|
|D3|Money|Integers in kobo everywhere ( `priceKobo`, `totalKobo`). The UI formats with `formatNaira(kobo)`.|Paystack uses kobo; Prisma `Decimal` serialises as a string and invites rounding bugs.|
|D4|Enums|The API speaks UPPER_SNAKE enum values. The UI maps them to labels in one file, `lib/labels.ts`.|Removes the "In Stock" versus `ACTIVE` drift.|
|D5|Types|Swagger (OpenAPI) is the source of truth. `openapi-typescript` generates `lib/api/schema.d.ts`.|Ends hand-written type drift.|
|D6|Sessions|A 15-minute access JWT in cookie `access_token`, plus a 30-day rotating refresh token in cookie `refresh_token`(path `/api/auth`), hashed in a `Session` table.|Real logout, revocation after a password change, and the Active Sessions page.|
|D7|Sign-up|School email and password are the only required fields. The institution comes from the email domain. A 6-digit email code must be verified before buying or selling. Username, names and phone are optional profile fields.|Your answer 3. The school email proves campus membership.|
|D8|Roles|`BUYER`, `SELLER`, `ADMIN`, `PICKUP_AGENT`. Sellers can also buy. A seller account also has a `SellerProfile`(store name, payout account).|Your answer 7 plus escrow needs someone at the station to confirm hand-overs.|
|D9|Institution scope|Every listing carries its seller's institution. Browsing, cart, checkout and pickup stations are filtered to the viewer's institution on the server.|Your answer 4.|

|#|Topic|Decision|Why|
|---|---|---|---|
|D10|Multi-seller cart|One checkout creates one `Order` (the buyer's payment) and one `SellerOrder` per seller. Fulfilment, escrow, disputes and payouts live on the `SellerOrder`.|Your answer 2. Each seller drops off and gets paid independently.|
|D11|Escrow|All payments land in the platform's Paystack balance. Each `SellerOrder`'s funds are released 48 hours after collection unless the buyer opens a dispute. They're paid out by Paystack Transfer.|Your answer 2.|
|D12|Pickup handover|The seller drops off at the buyer's chosen station; an agent enters the seller-order code. The buyer collects by giving a 6-digit collection code, which the agent enters.|Two independent confirmations; neither the buyer nor the seller can fake the other's step.|
|D13|Variants|Optional `ListingVariant` rows (label, optional price, stock). A listing with variants tracks stock per variant.|Your answer 5.|
|D14|Cart storage|A server-side `CartItem` table for signed-in users. Guests keep the local Zustand cart, which is merged on sign-in.|Stock and price checks need the server. Guests can still browse and add items.|
|D15|Images|Direct browser uploads to Cloudinary with a server-issued signature. The API stores the URL and `publicId`.|Keeps large files off the API server.|
|D16|Admin UI|Lives in the same Next.js app under `app/admin/*`, with its own desktop layout. Pickup agents get `app/agent/*`(mobile). The backend serves both under `/api/admin/*` and `/api/agent/*`.|One deploy, shared API client and types, and the D1 cookies work unchanged. Sign-in state is shared.|

|#|Topic|Decision|Why|
|---|---|---|---|
|D17|Background jobs|`@nestjs/schedule` crons inside the API process: escrow release, unpaid order expiry, drop-off deadlines.|No extra infrastructure yet. Needs a long-running server, not serverless.|
|D18|Email|`nodemailer` over the SMTP settings already in `.env.example`. In development, emails print to the console.|Already planned in env.|
|D19|Real-time|No websockets. Status changes create `Notification` rows; the UI polls every 60 seconds and on window focus.|Enough for campus order volumes.|

## Phase 0: security and hygiene quick wins

Phase 0 closes the password-hash leak and the account-takeover path, and fixes the Prisma client so later schema changes actually reach the code. It changes no product behaviour.

### 0.1 Repo cleanup

1. Delete the `frontend/` folder. It only holds an old `.next` dev cache.

2. Stop tracking the generated service worker: `git rm --cached public/sw.js` , then add `public/sw.js` , `public/sw.js.map` and `public/swe-worker-*.js` to the root `.gitignore` .

3. Replace the real Neon hostname in `backend/.env.example` with `ep-xxxx-pooler.region.aws.neon.tech` .

4. Remove the unused `All` import in `backend/src/main.ts` .

### 0.2 One safe user shape

Create `backend/src/users/user.select.ts` and use it in every user query that returns data to a client, including `updateProfile` .

```
export const safeUserSelect = {
  id: true, email: true, username: true, firstName: true, lastName: true,
  role: true, verificationStatus: true, emailVerifiedAt: true,
  trustScore: true, institutionId: true, isActive: true, isSuspended: true,
  createdAt: true,
} as const;
```

Fields that don't exist yet ( `username` , `emailVerifiedAt` ) arrive in Phase 1. Until then, leave them out of the select.

### 0.3 Public profile

In `users.controller.ts` , change the parameter to `@Param('id', new ParseUUIDPipe()) id: string` and delete the dead `if (!id)` branch. Remove `email` from the select in `getPublicProfile` . The profile now returns only name, role, verification status, trust score, institution and join date.

### 0.4 Password change needs the current password

1. Add `currentPassword` to `ChangePasswordDto` ( `@IsString() @IsNotEmpty()` ).

2. In `changePassword` , load the hash, `await compare(dto.currentPassword, user.password)` , and throw `UnauthorizedException('Current password is incorrect')` on mismatch.

3. Reject `newPassword === currentPassword` with a 400.

4. In Phase 1, also revoke every other session here.

### 0.5 Rate limiting and headers

```
// app.module.ts
imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), ...],
providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
// auth.controller.ts, on login, register and every code/password route
@Throttle({ default: { limit: 5, ttl: 60_000 } })
// main.ts
app.use(helmet());
app.getHttpAdapter().getInstance().set('trust proxy', 1); // real client IP behind the Next proxy
```

### 0.6 Fix the Prisma client

The schema generates to `src/generated/prisma` , but the code imports the stale `@prisma/client` .

1. Replace every `from '@prisma/client'` with an import from `src/generated/prisma/client` (models, `Prisma` ) or `src/generated/prisma/enums` (enums), using relative paths.

2. Make `PrismaService` a real client, so `$transaction` is available:

```
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

3. Mark `PrismaModule @Global()` so modules stop importing it one by one.

4. In `prisma.config.ts` , point migrations at the direct connection: `url: env('DIRECT_URL')` . The app keeps the pooled `DATABASE_URL` .

5. Run `npx prisma generate` , then `npm run build` . The build must pass with zero `@prisma/client` imports left.

### 0.7 Error format and logging

Extend `AllExceptionsFilter` :

   - Add a machine-readable `code` to every error body ( `VALIDATION_FAILED` , `UNAUTHENTICATED` , `FORBIDDEN` , `NOT_FOUND` , `CONFLICT` , `RATE_LIMITED` , `INTERNAL` ).

   - Feature errors add their own codes, such as `OUT_OF_STOCK` or `INSTITUTION_NOT_SUPPORTED` .

   - Map Prisma errors: `P2002` to 409 `CONFLICT` , `P2003` to 400 `INVALID_REFERENCE` , `P2025` to 404 `NOT_FOUND` .

   - Log 5xx responses with `logger.error(exception)` , including the stack. Log 4xx at `warn` without the body.

   - Throw feature errors as `new ConflictException({ code: 'OUT_OF_STOCK', message: '...', details })` and pass `details` through.

### 0.8 Institutions

`getInstitutionById` throws `NotFoundException` instead of returning `null` . Add `ParseUUIDPipe` . Phase 2 replaces `domain` with `domains: string[]` .

### 0.9 Swagger

Replace `addBearerAuth()` with `addCookieAuth('access_token')` . Only mount Swagger when `NODE_ENV !== 'production'` . Serve the JSON at `api/docs-json` for type generation ( `jsonDocumentUrl` option).

### 0.10 Validate env at startup

Add `backend/src/config/env.ts` with a zod schema for every variable in the appendix. Pass `validate: (raw) => envSchema.parse(raw)` to `ConfigModule.forRoot` . A missing `JWT_SECRET` now fails at boot, not on first login.

### 0.11 Tests and docs

1. Update both scaffold tests to expect `'Campusmart API is running'` (the e2e test gets it inside the envelope).

2. Replace `backend/README.md` with setup steps: env, `prisma migrate dev` , `start:dev` , Swagger URL.

3. Fix the root `README.md` : Next.js 16, no `/v1` , Paystack instead of Stripe.

4. Add a root `.env.example` (see the appendix).

5. Add `res.cloudinary.com` to `images.remotePatterns` in `next.config.ts` .

### Phase 0 checklist

- [ ] `PATCH /api/users/me/profile` response has no `password` or `passwordResetToken`.
- [ ] `GET /api/users/<id>` returns no email; a non-UUID returns 400.
- [ ] Changing the password with a wrong current password returns 401.
- [ ] The 6th login attempt in a minute returns 429.
- [ ] `grep -r "@prisma/client" backend/src` finds nothing outside `generated/`.
- [ ] `npm test` passes in `backend/`.
- [ ] A forced 500 appears in the production-mode logs.

## Phase 1: integration foundation

Phase 1 ends with a real account flow: school-email sign-up, email code, login, refresh, logout and the Active Sessions page. All of it goes through the Next.js proxy with no mock code left. It includes one small migration for the auth tables.

### 1.1 Same-origin proxy (D1)

```
// next.config.ts
const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_ORIGIN}/api/:path*` }];
  },
  // ...existing images, turbopack
};
```

   - `API_ORIGIN` is a **server-only** variable, for example `http://localhost:4000` . Delete `NEXT_PUBLIC_API_URL` .

   - In `lib/api/client.ts` , set `BASE_URL = '/api'` .

   - No page may use the Next route path `app/api/` , or it will shadow the rewrite.

   - The backend keeps CORS only for Swagger and local tools. Browsers never call it directly.

   - Don't set a cookie `Domain` , so cookies bind to the frontend host automatically.

### 1.2 API client

(rewrite `lib/api/client.ts` )

   - Unwrap the envelope: on success, return `body.data` .

   - Throw `ApiError(status, code, message, details)` for non-2xx responses, and `ApiError(0, 'NETWORK', ...)` for network failures and timeouts.

   - Add a 15-second timeout with `AbortController` .

   - On a 401 from any route except `/auth/*` , call `POST /api/auth/refresh` once, then retry the original request. Share one in-flight refresh promise so parallel 401s don't trigger several refreshes. If the refresh fails, clear auth and send the user to sign-in.

   - In `providers.tsx` , set `retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2` .

### 1.3 Auth migration

Add these to `schema.prisma` and run `npx prisma migrate dev --name auth_sessions` :

```
enum UserRole { BUYER SELLER ADMIN PICKUP_AGENT }

model User {
  // existing fields, plus:
  username        String?   @unique
  firstName       String?          // was required
  lastName        String?          // was required
  phone           String?
  emailVerifiedAt DateTime?
  sessions        Session[]
  emailCodes      EmailCode[]
}

model Session {
  id               String    @id @default(uuid())
  userId           String
  refreshTokenHash String
  userAgent        String?
  ipAddress        String?
  lastUsedAt       DateTime  @default(now())
  expiresAt        DateTime
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, revokedAt])
}

enum EmailCodePurpose { VERIFY_EMAIL RESET_PASSWORD }

model EmailCode {
  id        String           @id @default(uuid())
  userId    String
  purpose   EmailCodePurpose
  codeHash  String
  attempts  Int              @default(0)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime         @default(now())
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, purpose])
}
```

Also replace `Institution.domain` with `domains String[]` . Some schools use several domains, such as student and staff addresses. Drop the unused `passwordResetToken` and `passwordResetExpiry` columns; `EmailCode` replaces them.

### 1.4 Auth endpoints (backend)

|Method and path|Body|Result|
|---|---|---|
|`POST /auth/register`|`{ email, password, accountType: 'BUYER' \| 'SELLER' }`|201, user, both cookies set, verification code emailed|
|`POST /auth/verify-email`|`{ code }`(signed in)|user with `emailVerifiedAt` set|
|`POST /auth/verify-email/resend`|none|204. At most 1 a minute and 5 an hour|
|`POST /auth/login`|`{ email, password }`|user, both cookies set|
|`POST /auth/refresh`|none (refresh cookie)|204, both cookies rotated|
|`POST /auth/logout`|none|204, session revoked, cookies cleared|
|`GET /auth/me`|none|user|
|`POST /auth/forgot-password`|`{ email }`|always 204, so accounts can't be probed|
|`POST /auth/reset-password`|`{ email, code, newPassword }`|204, every session revoked|
|`GET /users/me/sessions`|none|`[{ id, userAgent, ipAddress, lastUsedAt, current }]`|
|`DELETE /users/me/sessions/:id`|none|204|
|`DELETE /users/me/sessions`|none|204, every session except the current one revoked|

Rules to implement:

1. **Institution from email.** Lowercase the email and take the part after `@` . Find the institution whose `domains` contain that domain, or a parent of it ( `students.unilag.edu.ng` matches `unilag.edu.ng` ). If there's no match, return 422 with code `INSTITUTION_NOT_SUPPORTED` ; the frontend sends the user to `/waitlist` .

2. **Password policy** (one rule, used by register, reset and change): at least 8 characters, with 1 uppercase letter, 1 lowercase letter and 1 digit. Put it in one `@IsCampusMartPassword()` decorator. Mirror it in the frontend zod schema and the `passwordRequirements` list.

3. **Email codes.** Generate 6 random digits with `crypto.randomInt` and store a bcrypt hash. They expire after 10 minutes, allow 5 attempts, and are single-use. A new code invalidates older unused ones.

4. **Tokens.** The access JWT payload is `{ sub, sid, role }` , valid for 15 minutes. The refresh token is 32 random bytes in base64url; store its SHA-256 hash in `Session.refreshTokenHash` , valid for 30 days.

5. **Rotation and reuse detection.** On refresh, look up the session by `sid` from the refresh cookie value `<sid>.<token>` . If the hash matches, issue new tokens and a new hash. If it doesn't match, someone replayed an old token: revoke that session and return 401.

6. **JwtStrategy.** Load the user and check that the session `sid` isn't revoked, in one query with the existing suspended and inactive checks.

7. **Cookies.** `access_token` : path `/` , maxAge 15 minutes. `refresh_token` : path `/api/auth` , maxAge 30 days. Both `httpOnly` , `sameSite: 'lax'` , and `secure` in production.

8. **Verified-email guard.** Add `@RequireVerifiedEmail()` , which returns 403 `EMAIL_NOT_VERIFIED` . Every commerce endpoint from Phase 3 onward uses it.

9. **Sellers.** `accountType: 'SELLER'` sets role `SELLER` and creates an empty `SellerProfile` (Phase 2). Until Phase 2, just set the role.

10. **Mail.** Add a `MailModule` with `MailService.send(to, template, vars)` on nodemailer. When `NODE_ENV=development` , print to the console instead.

11. **Password change.** Changing the password (0.4) now also revokes every other session.

### 1.5 Generated types (D5)

1. Give each endpoint a response DTO ( `UserDto` , `SessionDto` , and so on). Add a decorator `ApiOkEnvelope(UserDto)` that documents the `{ success, data, timestamp }` wrapper.

2. Frontend: `npm i -D openapi-typescript` , then add the script `"gen:api": "openapi-typescript http://localhost:4000/api/docs-json -o lib/api/schema.d.ts"` .

3. Commit `schema.d.ts` . Rerun it whenever a DTO changes; CI checks it's current (see Testing).

4. Replace the hand-written `User` , `SellerProduct` and `SellerOrder` types with aliases like `type User = components['schemas']['UserDto']` .

### 1.6 Frontend auth wiring

1. **`useAuthStore` .** Delete the mock and every `auth_token` cookie write. `login` calls `authApi.login` . Persist only `user` , for an instant first paint. The cookie is the truth, and `AuthProvider` refreshes `user` from `GET /auth/me` on every app start.

2. **`AuthProvider` .** Clear auth only on an `ApiError` with status 401. Keep the user on network errors, so the PWA works offline.

3. **Sign-up pages.** Both pages become controlled forms with school email, password and confirm password, validated by `signUpSchema` from `lib/validations/auth.ts` (rewrite it to these three fields). They call `POST /auth/register` with `accountType` . On a 422 `INSTITUTION_NOT_SUPPORTED` , go to `/waitlist` . The seller page keeps an optional store name field, saved in Phase 3 through `PATCH /sellers/me` .

4. **New page** **`/onboarding/verify-email` .** A 6-digit code input with a resend button and a 60-second countdown (reuse `useCountdown` ). After sign-up, route here. Buyers then go to `/` , sellers to `/sellers` .

5. **Sign-in pages.** Change the placeholder to "School email" and use `type="email"` . Show the `ApiError` message under the form. Redirect by `user.role` : `ADMIN` goes to `/admin` , `PICKUP_AGENT` to `/agent` , `SELLER` to `/sellers` , and everyone else to `/` .

6. **Forgot password.** "Recover it here" links to a new `/onboarding/forgot-password` page (email, then code plus new password).

7. **`middleware.ts` .** Check for the `access_token` **or** `refresh_token` cookie on `/sellers` , `/profile` , `/admin` , `/agent` , `/checkout` , `/cart` and `/orders` . This is a UX redirect only.

8. **Role layouts.** In `app/sellers/layout.tsx` , `app/admin/layout.tsx` and `app/agent/layout.tsx` , read `useMe()` and redirect when the role doesn't fit. The server enforces the real rule.

9. **Logout.** Call the API, then `queryClient.clear()` , reset the cart and favourites stores, and remove their localStorage keys.

10. **Query persistence.** Persist only queries marked `meta: { persist: true }` (public catalogue data), through `dehydrateOptions.shouldDehydrateQuery` .

11. **Wire the existing pages.** `change_password` calls `PATCH /users/me/password` with `{ currentPassword, newPassword }` . `active_sessions` uses the sessions endpoints. Hide the "Continue with Google" button until Phase 10.

12. **Home page.** Turn `useRequireAuth()` back on in `app/page.tsx` once the flow works.

### Phase 1 checklist

- [ ] Sign-up with a non-school domain lands on `/waitlist`.
- [ ] Sign-up with a school email reaches verify-email; a wrong code 5 times locks that code.
- [ ] After 15 minutes idle, the next request refreshes silently.
- [ ] Logging out on phone A leaves phone B signed in; "Sign out other devices" signs B out.
- [ ] A reused old refresh token revokes its session.
- [ ] `grep -r "auth_token\|dev-mock" app lib middleware.ts` finds nothing.
- [ ] `npm run gen:api` produces no diff.

## Phase 2: commerce schema migration

One migration, `commerce_core` , reshapes the order model around seller orders and escrow. It moves money to kobo, adds variants, pickup stations, payouts, disputes and notifications, and fixes the one-review-per-user bug. Because nothing is in production, reset the dev database instead of writing data conversions.

### 2.1 Before you start

1. Create a Neon branch `dev-phase2` from your dev database, and point `DATABASE_URL` and `DIRECT_URL` at it while you iterate.

2. If the Neon database holds anything you want to keep, export it first. `prisma migrate reset` drops everything.

### 2.2 Schema changes

(add or replace in `backend/prisma/schema.prisma`)

```prisma
model User {
  // after Phase 1, plus:
  pickupStationId  String?         // set only for PICKUP_AGENT
  pickupStation    PickupStation?  @relation("StationAgents", fields: [pickupStationId], references: [id])
  sellerProfile    SellerProfile?
  cartItems        CartItem[]
  notifications    Notification[]
  sellerOrders     SellerOrder[]   @relation("SellerOrders")
  reviewsReceived  Review[]        @relation("Reviewee")  // was Review? (the bug)
}

model Institution {
  id         String    @id @default(uuid())
  name       String    @unique
  domains    String[]
  isActive   Boolean   @default(true)
  createdAt  DateTime  @default(now())
  // relations: users, listings, pickupStations, orders
}

model SellerProfile {
  userId                 String    @id
  storeName              String?
  bio                    String?
  logoUrl                String?
  isOnline               Boolean   @default(false)
  ratingAvg              Float     @default(0)
  ratingCount            Int       @default(0)
  payoutBankName         String?
  payoutAccountLast4     String?
  payoutAccountName      String?
  paystackRecipientCode  String?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
  user                   User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model PickupStation {
  id             String       @id @default(uuid())
  institutionId  String
  name           String
  address        String
  contactName    String
  contactPhone   String
  openingHours   Json         // [{ day: 'MON', open: '09:00', close: '17:00' }]
  isActive       Boolean      @default(true)
  institution    Institution  @relation(fields: [institutionId], references: [id])
  agents         User[]       @relation("StationAgents")
  orders         Order[]
  @@index([institutionId, isActive])
}

model Listing {
  id             String              @id @default(uuid())
  title          String
  description    String
  priceKobo      Int                 // was Decimal price
  stock          Int                 // was quantity; sum of variants when present
  category       ListingCategory
  condition      ProductCondition
  status         ListingStatus       @default(DRAFT)
  sellerId       String
  institutionId  String              // now required
  ratingAvg      Float               @default(0)
  ratingCount    Int                 @default(0)
  isDeleted      Boolean             @default(false)
  isPromoted     Boolean             @default(false)
  isFlagged      Boolean             @default(false)
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  variants       ListingVariant[]
  dailyStats     ListingDailyStat[]
  // existing relations: seller, institution, images, reviews, wishlistedBy, moderationLogs, orderItems
  @@index([institutionId, status, isDeleted, createdAt])
  @@index([sellerId, status])
}

model ListingImage {
  id         String   @id @default(uuid())
  url        String
  publicId   String
  position   Int
  listingId  String
  listing    Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
}

model ListingVariant {
  id         String   @id @default(uuid())
  listingId  String
  label      String   // e.g. 'M', 'Black / XL', '500 ml'
  priceKobo  Int?     // null = listing price
  stock      Int
  isActive   Boolean  @default(true)
  listing    Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  @@unique([listingId, label])
}

model ListingDailyStat {
  listingId  String
  date       DateTime  @db.Date
  views      Int       @default(0)
  listing    Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  @@id([listingId, date])
}

model CartItem {
  id          String    @id @default(uuid())
  userId      String
  listingId   String
  variantKey  String    @default("")  // variantId, or '' for none; keeps the unique index strict
  variantId   String?
  quantity    Int
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  listing     Listing   @relation(fields: [listingId], references: [id])
  @@unique([userId, listingId, variantKey])
}

enum OrderStatus { PENDING_PAYMENT PAID CANCELLED EXPIRED } // CART, DISPUTED removed

enum PaymentMethod { CARD BANK_TRANSFER OPAY PALMPAY }

model Order {
  id               String         @id @default(uuid())
  buyerId          String
  institutionId    String
  pickupStationId  String
  status           OrderStatus    @default(PENDING_PAYMENT)
  paymentMethod    PaymentMethod
  subtotalKobo     Int
  totalKobo        Int
  idempotencyKey   String         @unique
  expiresAt        DateTime       // unpaid orders expire (Phase 4)
  paidAt           DateTime?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  sellerOrders     SellerOrder[]
  payment          Payment?
  // relations: buyer, institution, pickupStation
  @@index([buyerId, createdAt])
}

enum FulfillmentStatus { PENDING AWAITING_DROPOFF DROPPED_OFF COLLECTED CANCELLED DISPUTED }

enum EscrowStatus { PENDING HELD RELEASED REFUNDED }

model SellerOrder {
  id                  String             @id @default(uuid())
  orderId             String
  sellerId            String
  code                String             @unique  // 'CM-7F3K2Q', printed on the parcel
  collectionCode      String             // 6 digits, shown only to the buyer
  collectionAttempts  Int                @default(0)
  fulfillmentStatus   FulfillmentStatus  @default(PENDING)
  escrowStatus        EscrowStatus       @default(PENDING)
  subtotalKobo        Int
  platformFeeKobo     Int                @default(0)
  sellerPayoutKobo    Int
  dropOffDeadline     DateTime?
  droppedOffAt        DateTime?
  collectedAt         DateTime?
  releaseAt           DateTime?          // collectedAt + dispute window
  cancelledAt         DateTime?
  cancelReason        String?
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  order               Order              @relation(fields: [orderId], references: [id])
  seller              User               @relation("SellerOrders", fields: [sellerId], references: [id])
  items               OrderItem[]
  payout              Payout?
  dispute             Dispute?
  reviews             Review[]
  @@index([sellerId, fulfillmentStatus, createdAt])
  @@index([fulfillmentStatus, escrowStatus, releaseAt])
}

model OrderItem {
  id             String       @id @default(uuid())
  sellerOrderId  String
  listingId      String
  variantId      String?
  titleSnapshot  String
  variantLabel   String?
  imageUrl       String?
  unitPriceKobo  Int
  quantity       Int
  sellerOrder    SellerOrder  @relation(fields: [sellerOrderId], references: [id])
  listing        Listing      @relation(fields: [listingId], references: [id])
}

model Payment {
  id          String         @id @default(uuid())
  orderId     String         @unique
  provider    String         @default("PAYSTACK")
  reference   String         @unique
  amountKobo  Int
  status      PaymentStatus  @default(PENDING)
  channel     String?
  paidAt      DateTime?
  rawEvent    Json?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  order       Order          @relation(fields: [orderId], references: [id])
}

enum PayoutStatus { AWAITING_ACCOUNT PENDING PROCESSING PAID FAILED }

model Payout {
  id             String        @id @default(uuid())
  sellerOrderId  String        @unique
  sellerId       String
  amountKobo     Int
  status         PayoutStatus  @default(PENDING)
  reference      String        @unique
  failureReason  String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  sellerOrder    SellerOrder   @relation(fields: [sellerOrderId], references: [id])
}

enum DisputeStatus { OPEN RESOLVED_REFUND RESOLVED_RELEASE }

model Dispute {
  id              String         @id @default(uuid())
  sellerOrderId   String         @unique
  openedById      String
  reason          String
  evidenceUrls    String[]
  status          DisputeStatus  @default(OPEN)
  resolutionNote  String?
  resolvedById    String?
  createdAt       DateTime       @default(now())
  resolvedAt      DateTime?
  sellerOrder     SellerOrder    @relation(fields: [sellerOrderId], references: [id])
}

model Review {
  id             String       @id @default(uuid())
  rating         Int          // 1 to 5, checked in the DTO
  comment        String?
  reviewerId     String
  revieweeId     String       // the seller; no longer @unique
  listingId      String
  sellerOrderId  String
  createdAt      DateTime     @default(now())
  sellerOrder    SellerOrder  @relation(fields: [sellerOrderId], references: [id])
  // relations: reviewer, reviewee, listing
  @@unique([sellerOrderId, listingId])
  @@index([revieweeId])
  @@index([listingId, createdAt])
}

model Notification {
  id         String     @id @default(uuid())
  userId     String
  type       String     // 'ORDER_PAID', 'READY_FOR_PICKUP', ...
  title      String
  body       String
  data       Json?
  readAt     DateTime?
  createdAt  DateTime   @default(now())
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt, createdAt])
}

model SupportReport {
  id             String    @id @default(uuid())
  userId         String
  type           String    // 'BUG', 'ORDER', 'PAYMENT', 'LISTING', 'OTHER'
  message        String
  screenshotUrl  String?
  listingId      String?
  status         String    @default("OPEN")
  createdAt      DateTime  @default(now())
}

model AuditLog {
  id          String    @id @default(uuid())
  actorId     String?   // null = system job
  action      String    // 'ESCROW_RELEASED', 'USER_SUSPENDED', ...
  entityType  String
  entityId    String
  meta        Json?
  createdAt   DateTime  @default(now())
  @@index([entityType, entityId])
}
```

Also:

- Remove the old `Order.fulfillmentStatus`, `Order.review` and `Order.items` relations. Remove `Wishlist`'s redundant `@@index([userId, listingId])`; the unique index already covers it.
- Add `UNFLAG` and `SUSPEND_USER` to `ModerationActionType` , plus an optional `targetUserId` on `ModerationAction` .
- `VerificationRequest` stays. From Phase 9 it carries seller ID checks.

### 2.3 Run it

1. `npx prisma migrate dev --name commerce_core`

2. `npx prisma generate` , then fix the compile errors. They'll mostly be in `users.service.ts` ( `firstName` is optional now) and the institutions DTO ( `domains` ).

3. Write `prisma/seed.ts` : one institution with your real domains, two pickup stations, and one admin. The admin's email and password come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` . Register it in `prisma.config.ts` under `migrations.seed` .

4. Run `npx prisma migrate reset` . It re-applies every migration and runs the seed.

### Phase 2 checklist

- [ ] `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` is empty.
- [ ] The seed creates an institution, two stations and an admin you can sign in with.
- [ ] No `Decimal` remains in the schema.
- [ ] A user can receive two reviews.

## Phase 3: listings, variants and uploads

Phase 3 replaces the mock catalogue in `app/components/data.ts` with real, institution-scoped listings. It gives sellers a working add, edit and stock flow with Cloudinary images.

### 3.1 Backend: `listings` module

|Method and path|Who|Notes|
|---|---|---|
|`GET /listings`|verified user|Query: `q`, `category`, `condition`, `minPriceKobo`, `maxPriceKobo`, `sort` ( `newest`, `price_asc`, `price_desc`, `popular`), `cursor`, `limit`(max 50, default 20). Returns `{ items: ListingCardDto[], nextCursor }`.|
|`GET /listings/:id`|verified user|Full `ListingDto` with images, variants, seller card and rating. Records a view.|
|`GET /listings/:id/related`|verified user|Up to 10, same category, same institution|
|`GET /sellers/me/listings`|SELLER|`status` filter, every status including drafts|
|`POST /listings`|SELLER, verified|`CreateListingDto`(below)|
|`PATCH /listings/:id`|owner|Partial update. `images` and `variants`, when sent, replace the whole set.|
|`PATCH /listings/:id/status`|owner|`{ status: 'DRAFT' \| 'ACTIVE' \| 'ARCHIVED' }`|
|`DELETE /listings/:id`|owner|Soft delete ( `isDeleted = true`). 409 if it has open seller orders.|
|`GET /sellers/me`, `PATCH /sellers/me`|SELLER|Store profile: `storeName`, `bio`, `logoUrl`, `isOnline`|
|`POST /uploads/signature`|verified user|`{ purpose: 'LISTING' \| 'AVATAR' \| 'VERIFICATION' }` returns `{ cloudName, apiKey, timestamp, signature, folder }`|

`CreateListingDto` fields:

- `title`: 3 to 120 characters.
- `description`: up to 2,000 characters.
- `priceKobo`: integer, at least 100 (₦1).
- `stock`: integer, 0 or more. Ignored when variants are sent.
- `category`: a `ListingCategory` value.
- `condition`: a `ProductCondition` value.
- `images`: 1 to 8 items of `{ url, publicId }`.
- `variants` (optional): up to 20 items of `{ label, priceKobo?, stock }`.
- `status`: `DRAFT` or `ACTIVE`.

#### Rules

1. **Scope.** Every read filters `institutionId = currentUser.institutionId` , `isDeleted = false` , and (except the owner's own endpoints) `status = ACTIVE` . The listing's `institutionId` is copied from the seller on create. The client never sends it.

2. **Ownership.** Owner routes load with `findFirst({ where: { id, sellerId: user.id, isDeleted: false } })` and return **404** (not 403) when nothing matches, so IDs can't be probed.

3. **Stock and status.** With variants, `stock` = the sum of active variant stock, recalculated on every write. When stock reaches 0, set `status = SOLDOUT` . When it rises above 0 on a `SOLDOUT` listing, set `ACTIVE` .

4. **Images.** Accept only URLs starting `https://res.cloudinary.com/<cloudName>/` whose `publicId` sits under the folder issued to this user ( `campusmart/listings/<userId>/` ). When images are replaced, delete the old ones from Cloudinary in the background.

5. **Signature.** Sign `{ folder, timestamp }` with `CLOUDINARY_API_SECRET` (the Cloudinary `api_sign_request` helper). Signatures are valid for 1 hour. Verification uploads use `type: 'authenticated'` , so they aren't public.

6. **Views.** In `GET /listings/:id` , when the viewer isn't the seller, upsert `ListingDailyStat` for today and increment `views` . Don't await it.

7. **Popular sort.** Order by views over the last 7 days, then by `createdAt` . Cursor pagination is on `(createdAt, id)` . Use offset pagination only for `popular` , capped at 200 results.

8. **Search.** Start with `title ILIKE %q% OR description ILIKE %q%` . Move to Postgres full-text search when listings pass about 5,000 per campus.

### 3.2 Frontend

1. **`lib/labels.ts`** : label maps for `ListingCategory` , `ProductCondition` , `ListingStatus` ( `ACTIVE` "In stock", `SOLDOUT` "Out of stock", `DRAFT` "Draft", `ARCHIVED` "Archived", `FLAGGED` "Under review"), `FulfillmentStatus` and `PaymentMethod` . Also `formatNaira(kobo)` .

2. **`lib/api/listings.ts`** : rewrite on the generated types. Add hooks in `lib/api/hooks/useListings.ts` : `useListings(filters)` (an infinite query, `meta.persist = true` ), `useListing(id)` , `useRelatedListings(id)` , `useSellerListings(status)` , and mutations that invalidate `['listings']` and `['seller-listings']` .

3. **Buyer pages.** Replace the `products` import in `app/page.tsx` , `app/categories/page.tsx` , `app/productItem/[id]/page.tsx` , `app/cart/page.tsx` and `app/favourites/page.tsx` with the hooks. Keep `promotions` and `featuredDisplays` static for now; they're marketing content.

4. **Product page.** The variant picker renders from `listing.variants` and replaces the hard-coded S, M, L, XL. Hide it when there are no variants. Remove the review up and down votes (no backend). Wire Share with `navigator.share` , falling back to copying the link.

5. **Search.** `SearchBar` writes `q` into the URL, debounced by 300 ms. The categories page reads `category` , `q` and `sort` from the URL. Map `app/utils/sortOptions.ts` to the API `sort` values.

6. **Add product** ( `app/sellers/addProduct/page.tsx` ):

   - a. On submit, get a signature, then POST each file to `https://api.cloudinary.com/v1_1/<cloudName>/image/upload` as FormData ( `file` , `api_key` , `timestamp` , `signature` , `folder` ). Collect `secure_url` and `public_id` .

   - b. Convert the naira price input to kobo ( `Math.round(Number(price) * 100)` ).

   - c. Call `createListing` , then route to `/sellers/products` .

   - d. Remove `pickupLocation` and `availability` . The pickup station is chosen by the buyer, and availability is the status.

   - e. Add an optional "Sizes or options" editor: rows of label, price override and stock.

   - f. Show upload progress and block submit until every upload finishes. Resize images client-side to 1600 px on the long edge before upload.

   - g. Add an edit mode at `/sellers/products/[id]/edit` that reuses the same form.

7. **Seller products page.** Tabs become `All` , `ACTIVE` , `SOLDOUT` , `DRAFT` and `ARCHIVED` , shown through labels. The card menu offers Publish, Move to draft, Archive, Edit, Delete and "Adjust stock". Show the SKU as the last 6 characters of the ID, or drop it.

8. **Seller profile.** `app/sellers/profile/page.tsx` reads and writes `GET/PATCH /sellers/me` . Delete the mock user. The online toggle calls `PATCH /sellers/me { isOnline }` , and `useSellerStore` loses `isOnline` .

### Phase 3 checklist

- [ ] A seller at school A creates a listing with 3 images and 2 variants; a buyer at school A sees it, and a buyer at school B gets 404 on its ID.
- [ ] Seller B gets 404 on `PATCH /listings/<A's id>`.
- [ ] Selling the last variant unit flips the listing to `SOLDOUT`.
- [ ] An image URL from another Cloudinary account is rejected with 400.
- [ ] `grep -rn "components/data" app` only matches marketing content (promotions, featured displays).

## Phase 4: cart and checkout

Checkout turns the server cart into one `Order` with one `SellerOrder` per seller. It reserves stock atomically and snapshots prices from the database. The client sends item IDs and quantities, never prices.

### 4.1 Backend: `cart` module (verified user; every route checks the buyer's institution)

|Method and path|Body|Notes|
|---|---|---|
|`GET /cart`|none|`{ groups: [{ seller: { id, storeName }, items: [...], subtotalKobo }], subtotalKobo, issues: [...] }`. Each item has `listing` (card), `variant`, `quantity`, `unitPriceKobo`, `available` and `maxQuantity`.|
|`PUT /cart/items`|`{ listingId, variantId?, quantity }`|Sets the absolute quantity; 0 deletes the line.|
|`DELETE /cart/items/:id`|none|204|
|`POST /cart/merge`|`{ items: [{ listingId, variantId?, quantity }] }`|Called once after sign-in. Keeps the larger quantity per line and skips invalid lines.|

`PUT /cart/items` rejects the request when:

- the listing isn't `ACTIVE` or is in another institution (404);
- the listing has variants and no `variantId` was sent (400 `VARIANT_REQUIRED`);
- the buyer is the seller (400 `OWN_LISTING`);
- the quantity is over the available stock (409 `OUT_OF_STOCK`, with `details.available`);
- the cart would pass 50 lines.

`issues` in `GET /cart` lists lines that went out of stock or changed price since they were added, so the UI can warn before checkout.

### 4.2 Backend: pickup stations and checkout (`orders` module)

|Method and path|Who|Notes|
|---|---|---|
|`GET /pickup-stations`|verified user|Active stations in the user's institution|
|`POST /orders/checkout`|verified user|`{ pickupStationId, paymentMethod, idempotencyKey }` returns `{ orderId, totalKobo, authorizationUrl, reference }`|
|`GET /orders`|buyer|Cursor list of the buyer's orders with their seller orders|
|`GET /orders/:id`|buyer (owner)|Full detail. Includes each seller order's `collectionCode` **only for the buyer**.|
|`POST /orders/:id/cancel`|buyer (owner)|Only while `PENDING_PAYMENT`. Restores stock.|

Checkout steps, all inside one `prisma.$transaction` :

1. If an `Order` with this `idempotencyKey` and buyer exists, return it unchanged. The client generates the key with `crypto.randomUUID()` when the checkout page opens.

2. Load the cart lines with their listings and variants. Reject an empty cart, a station outside the buyer's institution, or any line that fails the 4.1 checks.

3. Reserve stock for each line with a conditional decrement, so two buyers can't take the last unit:

```
const res = await tx.listingVariant.updateMany({
  where: { id: variantId, stock: { gte: qty }, isActive: true },
  data: { stock: { decrement: qty } },
}); // or tx.listing.updateMany when there is no variant
if (res.count !== 1) throw new ConflictException({ code: 'OUT_OF_STOCK', message: '...', details: { listingId, variantId } });
```

4. Recalculate `Listing.stock` and `SOLDOUT` for the touched listings.

5. Group the lines by seller. For each group, create a `SellerOrder` :

   - `code` : `CM-` plus 6 characters from an unambiguous alphabet (no 0, O, 1, I).

   - `collectionCode` : 6 digits from `crypto.randomInt` .

   - `subtotalKobo` : the sum of the group's lines.

   - `platformFeeKobo` : `floor(subtotal * PLATFORM_FEE_BPS / 10000)` .

   - `sellerPayoutKobo` : subtotal minus the fee.

   - `OrderItem` rows with title, variant label, image and unit price **snapshotted** .

6. Create the `Order` with `status: PENDING_PAYMENT` and `expiresAt = now + ORDER_PAYMENT_TTL_MINUTES` (30).

7. Delete the buyer's cart lines.

8. After the transaction commits, initialise the Paystack payment (Phase 5.1) and return its `authorizationUrl` . Until Phase 5 lands, keep this behind the `PAYMENTS_ENABLED=false` flag and return `authorizationUrl: null` .

**Expiry job.** Add an `@Cron('*/5 * * * *')` job. It finds `PENDING_PAYMENT` orders past `expiresAt` , sets them to `EXPIRED` , restores their stock with increments, and sets their seller orders to `CANCELLED` . It skips any order whose payment is already `COMPLETED` , because a late webhook wins.

### 4.3 Frontend

1. **Cart store.** `useCartStore` becomes the **guest** cart only. Add a `useCart()` hook: when signed in, it uses `GET /cart` and the mutations; otherwise it uses the local store. After sign-in, `AuthProvider` calls `POST /cart/merge` with the local lines, then clears the local store.

2. **Cart page.** Group by store with a subtotal per store. Show `issues` inline. Cap the quantity stepper at `maxQuantity` . "See all" links go to `/browse` (Phase 8).

3. **Pickup station page.** Load from `GET /pickup-stations` ; the store only keeps the selected `id` . Format opening hours from the JSON.

4. **Checkout page.**

   - Payment options map to `PaymentMethod` ( `CARD` , `BANK_TRANSFER` , `OPAY` , `PALMPAY` ); don't send numeric IDs.

   - Hide the coupon modal; there's no coupon backend.

   - "Proceed to pay" calls checkout, then sets `window.location.href = authorizationUrl` .

   - On `OUT_OF_STOCK` , refetch the cart and show which item.

5. **Order confirmation page.** Read `?orderId` (Paystack returns the buyer here) and poll `GET /orders/:id` every 3 seconds, for up to 60 seconds, until `status = PAID` . Then show each seller order's code, the pickup station and "You'll be told when it's ready".

6. **New buyer orders pages.** `/orders` (list) and `/orders/[id]` (detail). The detail shows a per-seller status timeline, and the collection code in large type once the seller order is `DROPPED_OFF` . Link them from the profile menu in `app/lib/data.ts` .

### Phase 4 checklist

- [ ] Two browsers checking out the last unit at the same time: one succeeds, one gets `OUT_OF_STOCK`.
- [ ] Changing a price in the database after items are in a cart doesn't change the snapshot on an order already placed.
- [ ] Resubmitting checkout with the same `idempotencyKey` returns the same order.
- [ ] An unpaid order expires after 30 minutes and its stock returns.
- [ ] A cart with items from 2 sellers produces 2 seller orders with different codes.

## Phase 5: payments and escrow

Money only moves on a signature-verified Paystack webhook, never on a browser redirect. Funds are held per seller order and paid out by Paystack Transfer after collection plus the dispute window. Build the whole phase against Paystack test keys.

### 5.1 Initialise payment

( `payments` module, called at the end of checkout)

1. `POST https://api.paystack.co/transaction/initialize` with `Authorization: Bearer PAYSTACK_SECRET_KEY` and this body:

   - `email` : the buyer's email.

   - `amount` : `order.totalKobo` .

   - `currency` : `'NGN'` .

   - `reference` : `CM_<orderId>_<attempt>` .

   - `callback_url` : `${APP_URL}/order-confirmation?orderId=<id>` .

   - `channels` : mapped from `paymentMethod` (below).

   - `metadata` : `{ orderId }` .

2. Save a `Payment` row ( `PENDING` , reference, amount) and return `data.authorization_url` .

3. Channel map: `CARD` to `['card']` ; `BANK_TRANSFER` to `['bank_transfer']` . `OPAY` and `PALMPAY` go to `['bank_transfer', 'ussd']` until Paystack confirms a dedicated wallet channel for your account. Ask Paystack support.

4. `PAYSTACK_CALLBACK_URL` is replaced by `APP_URL` . The callback returns to the **frontend** page, which only polls; it never marks anything paid.

### 5.2 Webhook: `POST /payments/webhook`

1. Enable raw bodies with `NestFactory.create(AppModule, { rawBody: true })` and read `req.rawBody` ( `RawBodyRequest<Request>` ).

2. Verify the signature: `createHmac('sha512', PAYSTACK_SECRET_KEY).update(req.rawBody).digest('hex')` must equal the `x-paystack-signature` header, compared with `timingSafeEqual` . On mismatch, return 401.

3. Mark the route `@SkipThrottle()` . As a second layer, allowlist the webhook source IPs listed in Paystack's webhook documentation.

4. Reply 200 quickly and process in the same request. Keep it under 5 seconds; Paystack retries non-200 responses.

5. On `charge.success` , run one idempotent handler (also used by 5.3):

   - a. Find the `Payment` by `data.reference` . If it's already `COMPLETED` , stop.

   - b. Check that `data.amount === payment.amountKobo` , `data.currency === 'NGN'` and `data.status === 'success'` . On any mismatch, mark it `FAILED` , write an `AuditLog` , and alert the admins.

   - c. In one transaction: `Payment` becomes `COMPLETED` (with `paidAt` , `channel` , `rawEvent` ); `Order` becomes `PAID` . Each `SellerOrder` gets `escrowStatus = HELD` , `fulfillmentStatus = AWAITING_DROPOFF` and `dropOffDeadline = now + DROP_OFF_DEADLINE_DAYS` .

   - d. If the order had already `EXPIRED` , first re-reserve its stock. If that fails, refund in full (5.6) and notify the buyer.

   - e. Notify each seller ("New order CM-XXXXXX: drop it at <station> by <date>"), in the app and by email.

6. Handle `transfer.success` , `transfer.failed` and `transfer.reversed` (5.5), and `refund.processed` (5.6).

### 5.3 Verify fallback

`GET /payments/verify/:reference` (buyer, owner) calls `GET https://api.paystack.co/transaction/verify/:reference` and runs the same handler. The confirmation page calls it once if polling hasn't seen `PAID` after 10 seconds.

### 5.4 Seller payout account (SELLER)

|Method and path|Notes|
|---|---|
|`GET /payouts/banks`|Paystack `GET /bank?country=nigeria`, cached for 24 hours|
|`POST /sellers/me/payout-account`|`{ bankCode, accountNumber }`. Resolve the name with `GET /bank/resolve`, then create a recipient with `POST /transferrecipient` (`type: 'nuban'`). Store the recipient code, bank name, last 4 digits and account name. Never store the full account number.|
|`GET /sellers/me/payouts`|Payout history with status|

Add a "Payout account" screen to `app/sellers/profile` . The seller dashboard shows a banner until the account is set.

### 5.5 Escrow release job

Add an `@Cron('*/15 * * * *')` job.

1. Select seller orders with `fulfillmentStatus = COLLECTED` , `escrowStatus = HELD` , `releaseAt <= now` , and no `OPEN` dispute.

2. For each, in a transaction, set `escrowStatus = RELEASED` and create a `Payout` :

   - `amountKobo = sellerPayoutKobo`

   - `reference = PO_<sellerOrderId>`

   - `status` : `PENDING` , or `AWAITING_ACCOUNT` when there's no recipient code.

3. Outside the transaction, call `POST /transfer` with `{ source: 'balance', amount, recipient, reference, reason: 'CampusMart order CM-XXXXXX' }` and set the payout to `PROCESSING` .

4. Webhooks settle it: `transfer.success` sets `PAID` ; `transfer.failed` or `transfer.reversed` sets `FAILED` with the reason. Admins can retry failed payouts (Phase 9).

5. When a seller adds a payout account, queue their `AWAITING_ACCOUNT` payouts.

6. Write an `AuditLog` row for every release and payout.

Paystack prerequisites: a registered business account, Transfers enabled, and the transfer OTP turned off for API transfers (Dashboard, Settings, Preferences). Keep enough balance for payouts; Paystack settles card payments to the balance after its own delay.

### 5.6 Refunds

One `RefundService.refundSellerOrder(sellerOrderId, reason)` :

   - Calls `POST /refund` with `{ transaction: payment.reference, amount: sellerOrder.subtotalKobo }` . That's a partial refund, since other sellers in the same order may be fine.

   - Sets `escrowStatus = REFUNDED` and `fulfillmentStatus = CANCELLED` , restores stock, and notifies both sides.

   - Is used by seller cancellation, missed drop-off deadlines and disputes resolved in the buyer's favour.

### 5.7 Fees

`PLATFORM_FEE_BPS` defaults to 0. Paystack's processing fee is absorbed by the platform at launch. Both are business decisions to confirm before going live.

### Phase 5 checklist

- [ ] A webhook with a bad signature returns 401 and changes nothing.
- [ ] Replaying the same `charge.success` twice leaves one payment and one state change.
- [ ] A payment for less than `totalKobo` doesn't mark the order paid.
- [ ] Visiting the callback URL without paying doesn't mark the order paid.
- [ ] In test mode, collection plus 48 hours (set `ESCROW_DISPUTE_WINDOW_HOURS=0` to test) creates a payout and a Paystack test transfer.
- [ ] Refunding one seller order in a two-seller order leaves the other `HELD`.

## Phase 6: fulfilment and pickup stations

Only a pickup agent can move a seller order to dropped off or collected, and collection needs the buyer's code. Sellers can't mark their own orders complete, and buyers have 48 hours after collection to dispute. The drawing at the end of this section shows the whole lifecycle.

### 6.1 Allowed transitions

(enforce in one `FulfillmentService.transition()` ; anything else is 409 `INVALID_TRANSITION` )

|From|To|Who|Endpoint|
|---|---|---|---|
|`PENDING`|`AWAITING_DROPOFF`|system|Paystack webhook (5.2)|
|`AWAITING_DROPOFF`|`DROPPED_OFF`|agent at the order's station|`POST /agent/dropoffs`|
|`AWAITING_DROPOFF`|`CANCELLED`|seller, or the system when the deadline passes|`POST /sellers/me/orders/:id/cancel`, deadline cron|
|`DROPPED_OFF`|`COLLECTED`|agent, with the buyer's collection code|`POST /agent/collections`|
|`DROPPED_OFF` or `COLLECTED` (before `releaseAt`)|`DISPUTED`|buyer|`POST /orders/:orderId/seller-orders/:id/dispute`|
|`DISPUTED`|`COLLECTED` (escrow released) or `CANCELLED` (refunded)|admin|`POST /admin/disputes/:id/resolve`|

Every transition writes an `AuditLog` row and a `Notification` for the other party.

### 6.2 Seller endpoints

(SELLER)

   - `GET /sellers/me/orders?status=&cursor=` returns rows of `{ id, code, placedAt, buyerDisplayName, pickupStation: { name }, items: [{ title, variantLabel, imageUrl, quantity, unitPriceKobo }], subtotalKobo, sellerPayoutKobo, fulfillmentStatus, escrowStatus, dropOffDeadline }` .

   - `buyerDisplayName` is the buyer's username, or their first name, or "Buyer". Never send the buyer's email or phone to the seller.

   - `POST /sellers/me/orders/:id/cancel { reason }` is allowed only in `AWAITING_DROPOFF` . It triggers the refund (5.6) and lowers the seller's `trustScore` .

### 6.3 Pickup agent endpoints

( `PICKUP_AGENT` ; every query is filtered to `user.pickupStationId` )

   - `GET /agent/orders?status=AWAITING_DROPOFF|DROPPED_OFF&q=<code>` lists what's expected at, or waiting in, the station.

   - `POST /agent/dropoffs { code }` finds the seller order by `code` at this station. It must be `AWAITING_DROPOFF` . Set `DROPPED_OFF` and `droppedOffAt` , then notify the buyer: "Ready for pickup at <station>. Show code <collectionCode> when you collect."

   - `POST /agent/collections { code, collectionCode }` must match a `DROPPED_OFF` order at this station. Set `COLLECTED` , `collectedAt` , and `releaseAt = now + ESCROW_DISPUTE_WINDOW_HOURS` (48). Each wrong code increments `collectionAttempts` . After 5 failures, return 423 `COLLECTION_LOCKED` and alert the admins.

### 6.4 Buyer endpoints

- `POST /orders/:orderId/seller-orders/:id/dispute { reason, evidenceUrls? }` is allowed for the owning buyer from `DROPPED_OFF` until `releaseAt` . It creates a `Dispute` , sets `DISPUTED` , keeps escrow `HELD` , and notifies the admins and the seller.

- The release cron (5.5) already skips seller orders with an open dispute.

### 6.5 Drop-off deadline job

Add an hourly cron. Any seller order still `AWAITING_DROPOFF` after `dropOffDeadline` ( `DROP_OFF_DEADLINE_DAYS` , default 3) is cancelled and refunded (5.6), and the seller's `trustScore` goes down. Send the seller a reminder notification 24 hours before the deadline.

### 6.6 Frontend

1. **Seller orders page** ( `app/sellers/orders/page.tsx` ). Tabs are `AWAITING_DROPOFF` , `DROPPED_OFF` , `COLLECTED` and `DISPUTED` , shown through labels.

2. **`OrderCard` .** Rebuild it as one card per seller order: code in large type, item thumbnails, subtotal, deadline countdown, station name. **Delete the "Mark as" menu.** Sellers get only "Cancel order" (with a reason) while awaiting drop-off.

3. **Agent app** ( `app/agent/*` , mobile layout, role `PICKUP_AGENT` ):

   - `/agent` has two big buttons, "Receive parcel" and "Hand over parcel", plus today's counts.

   - `/agent/receive` : enter or scan the seller-order code, confirm the items shown, then submit.

   - `/agent/handover` : enter the seller-order code and the buyer's 6-digit code, then submit.

   - `/agent/orders` : a searchable list of `AWAITING_DROPOFF` and `DROPPED_OFF` .

   - Scanning: print the code as a QR on the seller's order screen, and read it with the `BarcodeDetector` API where the browser supports it. Manual entry always works.

4. **Buyer order detail.** Show the collection code only once the order is `DROPPED_OFF` . Add a "Report a problem" button (the dispute form) that is visible until `releaseAt` , with a countdown.

```mermaid
flowchart TD
    A["Awaiting payment<br/>order placed, stock reserved"] -->|"Paystack webhook, amount checked"| B["Awaiting drop-off<br/>escrow held"]
    B -->|"seller cancels or deadline passes"| X["Cancelled and refunded<br/>stock restored"]
    B -->|"agent enters seller-order code"| C["Dropped off<br/>waiting at the pickup station"]
    C -->|"agent enters buyer's 6-digit code"| D["Collected<br/>48-hour dispute window open"]
    C -->|"buyer disputes"| E["Disputed<br/>escrow held, admin decides"]
    D -->|"buyer disputes"| E
    D -->|"48 hours pass, no dispute"| F["Escrow released<br/>paid out to the seller"]
    E -->|"admin: refund"| X
    E -->|"admin: release"| F
```

*Figure: seller order lifecycle, 7 states, who moves each step. A seller is paid only after collection and 48 quiet hours.*

Every forward step needs someone other than the seller: Paystack, then the agent twice, then the clock. Separately, an unpaid order expires after 30 minutes and never reaches drop-off.

### Phase 6 checklist

- [ ] An agent at station B gets 404 for an order bound for station A.
- [ ] A seller calling any agent endpoint gets 403.
- [ ] 5 wrong collection codes lock the order.
- [ ] A dispute opened 47 hours after collection blocks the payout; one at 49 hours is rejected.
- [ ] A missed drop-off deadline refunds the buyer automatically.

## Phase 7: seller analytics

The seller dashboard's numbers become real: views, orders, revenue and payouts for a chosen range, with change against the previous range. Add best sellers and low-stock alerts, which is the "simple analysis of sales and inventory" the product promises.

### 7.1 Backend

(SELLER; everything scoped to `sellerId = user.id` )

|Method and path|Returns|
|---|---|
|`GET /sellers/me/stats?range=7d\|30d\|90d`|`{ range, views, viewsChangePct, orders, ordersChangePct, revenueKobo, revenueChangePct, heldKobo, paidOutKobo }`|
|`GET /sellers/me/analytics/timeseries?range=&metric=revenue\|orders\|views`|`[{ date: 'YYYY-MM-DD', value }]`, one row per day, zero-filled|
|`GET /sellers/me/analytics/top-listings?range=&limit=5`|`[{ listingId, title, imageUrl, unitsSold, revenueKobo, views, conversionPct }]`|
|`GET /sellers/me/inventory/alerts`|Listings and variants with stock at or below `LOW_STOCK_THRESHOLD` (3), with out-of-stock items first|

Definitions (put them in the Swagger descriptions too):

- **Orders** : seller orders whose parent order is `PAID` , created in the range, excluding `CANCELLED` .

- **Revenue** : the sum of `subtotalKobo` for those orders.

- **Held** : seller orders with escrow `HELD` .

- **Paid out** : payouts with status `PAID` .

- **Views** : the sum of `ListingDailyStat.views` for the seller's listings.

- **Change %** : `(current - previous) / previous * 100` over the equal-length previous range. Return `null` when the previous value is 0.

- **Conversion** : units sold divided by views, as a percentage.

#### Implementation notes

- Use `$queryRaw` with `date_trunc('day', "createdAt" AT TIME ZONE 'Africa/Lagos')` , so days match the seller's clock.

- The `(sellerId, fulfillmentStatus, createdAt)` index from Phase 2 covers these queries.

Cache each response for 60 seconds per seller in memory ( `@nestjs/cache-manager` ).

### 7.2 Frontend

1. **Dashboard** ( `app/sellers/page.tsx` ). Stat cards come from `useSellerStats(range)` , with a 7d, 30d or 90d switch. Delete `stats` and `setStats` from `useSellerStore` ; the store then only needs UI state, or can be removed.

2. **`BestPerformingCard` .** Render `top-listings[0]` (image, title, units sold in the range). Hide it when there are no sales yet.

3. **New page** **`/sellers/analytics`** (the link already exists):

   - A revenue or orders line chart from `timeseries` , drawn with `recharts` , lazy-loaded so the PWA bundle stays small.

   - A top-listings table.

   - Inventory alerts with "Restock", which opens the edit page (3.2).

   - A payouts summary: held, released and paid out.

4. **Low-stock notification.** Send a notification when an alert list goes from empty to nonempty.

### Phase 7 checklist

- [ ] A seller's revenue for a range equals the sum of their paid seller-order subtotals in that range (checked in SQL).
- [ ] Seller A's stats never include seller B's orders.
- [ ] A listing with 2 units left appears in the alerts; restocking removes it.

## Phase 8: wishlist, stores and reviews

Phase 8 wires the favourites, "Featured Store" and review UI that already exist, and fixes the four dead "See all" links.

### 8.1 Wishlist

(verified user)

   - `GET /wishlist?cursor=` returns listing cards. Items no longer active come back with `available: false` .

   - `PUT /wishlist/:listingId` returns 204 and is idempotent. The listing must be in the user's institution.

   - `DELETE /wishlist/:listingId` returns 204.

- Frontend: favourites need sign-in. A guest who taps the heart gets a sign-in bottom sheet. `useFavouritesStore` is replaced by `useWishlist()` with an optimistic toggle; delete the store and its localStorage key.

### 8.2 Stores (verified user, same institution)

- `GET /stores?featured=true&limit=10` returns sellers with at least 1 active listing, ranked by `ratingAvg * log(1 + ratingCount)` , then by paid orders in the last 30 days. Each row is `{ sellerId, storeName, logoUrl, ratingAvg, ratingCount, verified, listingCount }` .

- `GET /stores/:sellerId` returns the store header, plus `GET /stores/:sellerId/listings?cursor=` .

- Frontend: `FeaturedStoreCard` reads `/stores?featured=true` . Add the pages `/stores` (all stores) and `/stores/[id]` . Seller names on product pages link to the store.

### 8.3 Browse page and dead links

Add a `/browse` page: a listing grid driven by URL params ( `sort` , `category` , `q` ). Then point the links:

- "New in Stock" ( `/new` ) goes to `/browse?sort=newest` .

- "You Might Need" ( `/recommendations` ) goes to `/browse?sort=popular` .

- "Featured Store" ( `/stores` ) goes to the new stores page.

- "View Analytics" goes to `/sellers/analytics` (Phase 7).

### 8.4 Reviews

- `POST /seller-orders/:id/reviews { listingId, rating (1-5), comment? (up to 500 characters) }` is for the buyer only. The seller order must be `COLLECTED` and the listing must be in it, with one review per listing per seller order.

- In the same transaction, update `Listing.ratingAvg` and `ratingCount` , plus `SellerProfile.ratingAvg` and `ratingCount` .

- `GET /listings/:id/reviews?cursor=` and `GET /stores/:sellerId/reviews?cursor=` return `{ id, rating, comment, reviewerDisplayName, createdAt }` .

- **Trust score** (recalculated nightly, 0 to 100, shown as a badge; the weights are a starting point to tune):

   - 50 × (ratingAvg / 5)

   - plus 30 × the completed share of the last 50 seller orders

   - plus 20 when the seller is verified

   - minus 10 per seller-caused cancellation in the last 90 days, floored at 0.

- Frontend: the product page review list reads from the API. The buyer order detail shows "Rate your items" once the order is `COLLECTED` . Send a notification 24 hours after collection asking for a review.

### Phase 8 checklist

- [ ] A buyer can't review an item they haven't collected (403), or review it twice (409).
- [ ] A seller's rating updates right after a review.
- [ ] No link in the app points at a missing route. Check with a crawl of every `href` against the `app/` route list.

## Phase 9: admin UI and moderation

The admin console lives at `/admin` in the same Next.js app (D16), backed by `/api/admin/*` . It's where you onboard campuses and stations, verify sellers, moderate listings, resolve disputes and fix failed payouts. Build the institutions and stations screens right after Phase 2, because nothing works without them. Add the rest as each phase lands.

### 9.1 Backend admin module

Put `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')` on the **controller class** , so no route can be left open by mistake. Every mutation writes an `AuditLog` row with the admin's ID.

|Area|Endpoints|Needed from|
|---|---|---|
|Overview|`GET /admin/overview`: users, sellers, paid orders (7 and 30 days), GMV, escrow held, open disputes, pending verifications, failed payouts|Phase 5|
|Institutions|`GET/POST /admin/institutions`, `PATCH /admin/institutions/:id` (`name`, `domains`, `isActive`)|Phase 2|
|Pickup stations|`GET/POST /admin/pickup-stations`, `PATCH /admin/pickup-stations/:id`|Phase 2|
|Users|`GET /admin/users?q&role&institutionId&cursor`, `PATCH /admin/users/:id/role { role, pickupStationId? }`, `POST /admin/users/:id/suspend { reason }`, `POST /admin/users/:id/unsuspend`|Phase 1|
|Seller verification|`GET /admin/verification-requests?status=PENDING`, `POST /admin/verification-requests/:id/decide { decision: 'VERIFIED' \| 'REJECTED', note }`|Phase 3|
|Listings|`GET /admin/listings?flagged=true&cursor`, `POST /admin/listings/:id/moderate { type: 'APPROVE' \| 'REJECT' \| 'FLAG' \| 'UNFLAG', reason }`|Phase 3|
|Disputes|`GET /admin/disputes?status=OPEN`, `GET /admin/disputes/:id`(both sides, items, timeline, evidence), `POST /admin/disputes/:id/resolve { outcome: 'REFUND' \| 'RELEASE', note }`|Phase 6|
|Payouts|`GET /admin/payouts?status=FAILED\|AWAITING_ACCOUNT`, `POST /admin/payouts/:id/retry`|Phase 5|
|Reports|`GET /admin/support-reports?status=OPEN`, `PATCH /admin/support-reports/:id { status }`|Phase 10|
|Audit|`GET /admin/audit-log?entityType&entityId&actorId&cursor`|Phase 2|

#### Rules

1. **Suspending a user** sets `isSuspended` , revokes all their sessions, and sets their active listings to `ARCHIVED` . Their open seller orders stay for the admins to handle.

2. **Rejecting a listing** sets `status = FLAGGED` (hidden from buyers) and notifies the seller with the reason. **Approving** clears `isFlagged` .

3. **Buyer reports.** Add `POST /listings/:id/report { reason }` for any verified user. It sets `isFlagged` after 3 distinct reports, or immediately when the reason is `PROHIBITED_ITEM` , and creates a `SupportReport` .

4. **Resolving a dispute** calls the refund (5.6) or releases escrow immediately (the 5.5 steps, skipping `releaseAt` ).

5. **Seller verification.** Sellers submit a student ID photo through `POST /users/me/verify` (an authenticated Cloudinary upload, 3.1). A `VERIFIED` decision sets `User.verificationStatus` and shows a badge. Decide whether unverified sellers can list at all; the default here is yes, with lower ranking.

6. **First admin.** The seed script (2.3) creates it. There's never an endpoint that grants `ADMIN` except `PATCH /admin/users/:id/role` , which admins alone can call.

### 9.2 Frontend `app/admin/*`

1. `app/admin/layout.tsx` : a desktop layout with a left sidebar and content up to `max-w-6xl` . It breaks out of the app's mobile width constraint and redirects anyone who isn't `ADMIN` . Exclude `/admin` from the bottom nav.

2. Pages: `/admin` (overview cards), `/admin/institutions` , `/admin/stations` , `/admin/users` , `/admin/verifications` , `/admin/listings` , `/admin/disputes` , `/admin/disputes/[id]` , `/admin/payouts` , `/admin/reports` and `/admin/audit` .

3. Build one reusable `DataTable` (column config, cursor paging, filters in the URL) and one `ConfirmDialog` that requires a reason. Every destructive action goes through it, and the reason is sent to the API.

4. Keep admin queries out of persistence ( `meta.persist` unset).

### Phase 9 checklist

- [ ] Every `/api/admin/*` route returns 403 for a seller and 401 when signed out. Test all of them in a loop from the route list.
- [ ] Suspending a user signs them out within 15 minutes, and immediately on their next refresh.
- [ ] Every admin mutation appears in the audit log with who, what and when.
- [ ] A new campus can go live end to end from the admin UI alone: institution, domains, station, agent.

## Phase 10: remaining features

Phase 10 wires the profile, help and notification screens that exist as UI only, and adds the operational pieces a launch needs. Each item stands alone, so do them in any order.

|Item|Backend|Frontend|Notes|
|---|---|---|---|
|Notifications|`GET /notifications?cursor`, `GET /notifications/unread-count`, `POST /notifications/read { ids? }`(no ids marks all read), `GET/PATCH /users/me/notification-preferences`|`app/profile/notifications/page.tsx` reads real data. A bell badge polls the unread count every 60 seconds and on focus.|Store preferences as JSON on `User`. Email only for order and payment events by default.|
|Profile|`PATCH /users/me/profile { username, firstName, lastName, phone }`|Profile and seller profile edit forms|Email isn't editable; the school email is the identity. `username` is unique (409 on clash) and matches `^[a-z0-9_]{3,20}$`.|
|Support and reports|`POST /support/reports { type, message, screenshotUrl?, listingId? }`|Wire `help/report` and `help/email_support`. Upload screenshots through 3.1.|Admins see these in `/admin/reports`.|
|Seller verification|`POST /users/me/verify { documentUrl }`(exists; switch it to the authenticated upload)|Add a "Get verified" card to the seller profile|Reviewed in 9.1.|
|Account deletion|`DELETE /users/me { password }`|Account security page|Blocked while seller orders or payouts are open. Otherwise it anonymises personal data and keeps order records, for NDPR compliance and tax records.|
|Google sign-in|`GET /auth/google`, `GET /auth/google/callback` ( `passport-google-oauth20`)|Show the button again|Accept only emails whose domain maps to an institution (D7). Link to an existing account by email.|
|Phone verification|Deferred|Hide the `phone_verification` page|Needs an SMS provider such as Termii. It isn't required anywhere in the flows above.|
|Health check|`GET /health` with a database ping ( `@nestjs/terminus`)|none|Used by the host's health check and uptime monitoring.|
|Web push (optional)|`POST /push/subscriptions` with VAPID keys|A permission prompt after the first order|Sends "Ready for pickup" even when the app is closed. Serwist already provides the service worker.|

#### Clean-ups to do alongside

- Remove one of the two offline pages ( `/offline` or `/~offline` ). Keep `/~offline` , which `sw.ts` uses.

- Remove the manual registration in `ServiceWorkerRegister.tsx` if Serwist already registers the worker. Check for two registrations in DevTools, Application tab.

- Remove `console.log` from `productItem/[id]/page.tsx` , `ServiceWorkerRegister.tsx` and `PWAInstallPrompt.tsx` .

- Delete `app/components/data.ts` product entries once nothing imports them.

- Rename `middleware.ts` to `proxy.ts` if your Next.js 16 version warns that `middleware` is deprecated.

## Testing, CI and deployment

Set up CI during Phase 0 so every later phase merges only with green checks. Put the heaviest tests on money, stock and permissions, where a bug costs real naira.

### Backend tests

- **Unit tests** (Jest, Prisma mocked) for the pure rules:

   - fee and payout math;

   - institution matching from an email domain;

   - the transition table in `FulfillmentService` ;

   - trust score;

   - analytics change %.

- **E2E tests** (supertest against a real Postgres, run with `jest --config test/jest-e2e.json` ). Each suite truncates tables in `beforeEach` . Cover at least:

   - sign-up, verify, login, refresh rotation and reuse detection;

   - cross-institution 404s;

   - the concurrent last-unit checkout race (fire 2 requests with `Promise.all` );

   - the webhook: signature, replay, amount mismatch;

   - the agent flow and the collection-code lockout;

   - the release cron with a 0-hour window;

   - every `/admin/*` route returns 403 for a seller.

- Mock Paystack with `nock` in tests. Run one manual end-to-end pass on Paystack test keys before each release.

### Frontend tests

- Vitest and Testing Library for `lib/api/client.ts` (envelope unwrap, refresh retry, timeout), `lib/labels.ts` , and the guest-cart merge.

- Playwright smoke test against a local stack: sign up, verify (read the code from the dev mail log), create a listing as a seller, buy as a buyer, run the agent drop-off and collection, then check the seller dashboard numbers.

#### CI: `.github/workflows/ci.yml`

```yaml
name: ci
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: campusmart_test }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/campusmart_test
      DIRECT_URL: postgresql://postgres:postgres@localhost:5432/campusmart_test
      JWT_SECRET: ci-secret-at-least-32-characters-long
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: backend/package-lock.json }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code --shadow-database-url "$DATABASE_URL"
      - run: npm run lint -- --max-warnings 0
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run test:e2e
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npx vitest run
      - run: npm run build
        env: { API_ORIGIN: http://localhost:4000 }
```

The `migrate diff` step fails the build when someone edits `schema.prisma` without a migration. The shadow database URL can be the same test database here, because CI throws it away. Change `lint` in `backend/package.json` to drop `--fix` so CI checks rather than rewrites. Protect `master` and `develop` so both jobs must pass.

### Deployment (works for any domain you choose)

|Piece|Host|Why|
|---|---|---|
|Next.js app, including `/admin` and `/agent`|Vercel|The existing Vercel Analytics setup; rewrites give the same-origin API (D1)|
|NestJS API|A long-running container host: Render, Railway or Fly.io, in a region close to Nigeria or to your Neon region|The crons (D17) need a process that stays up. Serverless functions would miss them.|
|Postgres|Neon: a `main` branch for production, a `dev` branch, and throwaway branches per phase|Already in use|
|Images|Cloudinary|D15|
|Email|Any SMTP provider (Resend, Postmark, Zoho)|D18|

Once you pick domains, you only set variables; no code changes:

1. On Vercel, set `API_ORIGIN` to the API's internal or public URL.

2. On the API host, set `APP_URL` to the frontend URL, which Paystack uses for `callback_url` .

3. In the Paystack dashboard, set the webhook URL to `https://<apihost>/api/payments/webhook` . Call the API host directly, so the raw body isn't touched by a proxy.

4. On the API, set `FRONTEND_URL` for CORS (Swagger and tools only).

Release steps:

1. `npx prisma migrate deploy` runs in the API's release command before the new version starts.

2. Deploy the API, then the frontend. Both are backward-compatible within a phase.

### Launch checklist

- [ ] Paystack live keys, Transfers enabled, and business verification complete.
- [ ] The first institution's domains and at least one station and agent created in `/admin`.
- [ ] Swagger is off in production; `NODE_ENV=production`; cookies are `secure`.
- [ ] Error alerts from API logs (the host's log alerts, or Sentry) reach you.
- [ ] A test order paid with a real card was refunded successfully.
- [ ] Terms and Privacy overlays describe escrow, the 48-hour dispute window and refunds.

## Appendix: env vars and endpoint index

Every variable below goes in the matching `.env.example` , and the backend's zod env schema (0.10) rejects startup when a required one is missing.

### Environment variables

|Variable|App|Example|Needed from|
|---|---|---|---|
|`API_ORIGIN`|frontend (server-only)|`http://localhost:4000`|Phase 1|
|`DATABASE_URL`|backend|Neon pooled URL|now|
|`DIRECT_URL`|backend (migrations)|Neon direct URL|Phase 0|
|`JWT_SECRET`|backend|32+ random characters|now|
|`PORT`|backend|`4000`|now|
|`NODE_ENV`|both|`development`|now|
|`FRONTEND_URL`|backend (CORS for tools)|`http://localhost:3000`|now|
|`APP_URL`|backend (links in emails, Paystack callback)|`http://localhost:3000`|Phase 1|
|`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`|backend|SMTP settings|Phase 1|
|`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`|backend|from Cloudinary|Phase 3|
|`PAYSTACK_SECRET_KEY`|backend|`sk_test_...`|Phase 5|
|`PAYMENTS_ENABLED`|backend|`false` until Phase 5|Phase 4|
|`PLATFORM_FEE_BPS`|backend|`0`|Phase 4|
|`ORDER_PAYMENT_TTL_MINUTES`|backend|`30`|Phase 4|
|`DROP_OFF_DEADLINE_DAYS`|backend|`3`|Phase 6|
|`ESCROW_DISPUTE_WINDOW_HOURS`|backend|`48`|Phase 5|
|`LOW_STOCK_THRESHOLD`|backend|`3`|Phase 7|
|`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`|backend (seed only)|your email|Phase 2|

Remove `PAYSTACK_PUBLIC_KEY` and `PAYSTACK_CALLBACK_URL` (the redirect flow doesn't need them), and `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_STRIPE_KEY` from the README.

**Endpoint index** (all under `/api` ; details are in the phase named)

|Area|Endpoints|Access|Phase|
|---|---|---|---|
|System|`GET /`, `GET /health`|public|0, 10|
|Auth|`POST /auth/register`, `/auth/verify-email`, `/auth/verify-email/resend`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me`; `GET /auth/google`, `/auth/google/callback`|public or signed in|1, 10|
|Me|`GET/PATCH /users/me/profile`, `PATCH /users/me/password`, `POST /users/me/verify`, `GET/DELETE /users/me/sessions[/:id]`, `GET/PATCH /users/me/notification-preferences`, `DELETE /users/me`; `GET /users/:id`|signed in|0, 1, 10|
|Institutions|`GET /institutions`, `GET /institutions/:id`|public (sign-up and waitlist pages)|0|
|Listings|`GET /listings`, `GET /listings/:id`, `GET /listings/:id/related`, `GET /listings/:id/reviews`, `POST /listings/:id/report`; `POST /listings`, `PATCH /listings/:id`, `PATCH /listings/:id/status`, `DELETE /listings/:id`|verified; owner for writes|3, 8, 9|
|Uploads|`POST /uploads/signature`|verified|3|
|Seller|`GET/PATCH /sellers/me`, `GET /sellers/me/listings`, `GET /sellers/me/orders`, `POST /sellers/me/orders/:id/cancel`, `POST /sellers/me/payout-account`, `GET /sellers/me/payouts`, `GET /sellers/me/stats`, `GET /sellers/me/analytics/timeseries`, `GET /sellers/me/analytics/top-listings`, `GET /sellers/me/inventory/alerts`|SELLER|3 to 7|
|Cart|`GET /cart`, `PUT /cart/items`, `DELETE /cart/items/:id`, `POST /cart/merge`|verified|4|
|Orders|`GET /pickup-stations`; `POST /orders/checkout`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:orderId/seller-orders/:id/dispute`, `POST /seller-orders/:id/reviews`|verified; owner|4, 6, 8|
|Payments|`POST /payments/webhook`(Paystack signature), `GET /payments/verify/:reference`, `GET /payouts/banks`|webhook; owner; SELLER|5|
|Agent|`GET /agent/orders`, `POST /agent/dropoffs`, `POST /agent/collections`|PICKUP_AGENT|6|
|Wishlist and stores|`GET /wishlist`, `PUT/DELETE /wishlist/:listingId`; `GET /stores`, `GET /stores/:sellerId`, `GET /stores/:sellerId/listings`, `GET /stores/:sellerId/reviews`|verified|8|
|Notifications and support|`GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read`; `POST /support/reports`; `POST /push/subscriptions`|signed in|10|
|Admin|`/admin/overview`, `/admin/institutions`, `/admin/pickup-stations`, `/admin/users`, `/admin/verification-requests`, `/admin/listings`, `/admin/disputes`, `/admin/payouts`, `/admin/support-reports`, `/admin/audit-log`|ADMIN|9|

The current `POST /auth/register/buyer` , `POST /auth/register/seller` and `POST /institutions` are removed in Phases 1 and 9; `/admin/institutions` replaces the last one.