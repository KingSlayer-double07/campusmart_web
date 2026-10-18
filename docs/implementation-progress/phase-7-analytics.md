# Phase 7: seller analytics

Branch: `feat/phase-7-analytics` (off `backend`).
Status: **DONE**

Built from the guide's 7.1–7.2 as changed by [execution-plan.md](execution-plan.md#phase-7-seller-analytics):
- revenue is item subtotals only;
- the low-stock level is 5 (A1) and admins can change it;
- a view counts once per viewer per listing per day, never the seller's own (A2).

## 1. Checklist

The guide's Phase 7 list:

- [x] A seller's revenue for a range equals the sum of their paid seller-order subtotals in that range, checked in
      SQL. The e2e test compares the API with its own SQL for two sellers. The walk does the same against the dev
      database: ₦40,500 from 9 orders over 7 days, shown on Chidi's dashboard.
- [x] Seller A's stats never include seller B's orders. In e2e, a shared two-store order counts for each seller once,
      and B's sales and views never reach A's stats, trend or best sellers.
- [x] A listing with 2 units left appears in the alerts, and restocking removes it (e2e, and the walk through the
      Restock button).

The plan's additions:

- [x] Low-stock alert at 5, editable in settings (A1). The e2e test and the walk change it at `/admin/settings`, and
      the change is audited.
- [x] Views: one per viewer per listing per day, the seller's own excluded (A2). The Phase 3 e2e test is updated,
      and the walk shows two visits by one buyer and one by the seller adding one view.
- [x] Revenue leaves out delivery fees (it's `SellerOrder.subtotalKobo`).
- [x] Guide 7.2.4: a seller is told once when their low-stock list goes from empty to not empty, and again only
      after it empties (e2e; the walk waited for the real 10-minute job).

Gate items:

- [x] Backend `pnpm exec tsc --noEmit`, `pnpm run lint --max-warnings 0`, `pnpm run build`, `pnpm test`,
      `pnpm run test:e2e` pass.
- [x] Frontend `pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run build` pass.
- [x] `gen:api` produces no diff; `prisma migrate diff ... --exit-code` is clean.
- [x] GitHub CI is green on the branch.
- [x] Every new endpoint meets the definition of done: validated queries that reject unknown fields, the seller's
      id taken from the session only, documented responses, shared error codes, and unit and e2e tests with a
      forbidden path (a buyer gets 403, no session gets 401).

## 2. Changes

### Schema

`20261019090000_seller_analytics` (additive):

| Change | Why |
|---|---|
| `ListingView` (listing, viewer, Lagos date; one row each) | A2: a view counts once per viewer per listing per day |
| `SellerProfile.lowStockAlertedAt` | Guide 7.2.4: tell a seller once when their list stops being empty |

### Backend (`src/analytics/`)

All four routes take the seller from the session; there is no way to ask for another seller's numbers.

| Endpoint | Returns |
|---|---|
| `GET /sellers/me/stats?range=7d\|30d\|90d` | `views`, `orders`, `revenueKobo`, each with its change in % against the same number of days before (`null` when that was 0); `heldKobo`, `releasedKobo` and `paidOutKobo` |
| `GET /sellers/me/analytics/timeseries?range=&metric=revenue\|orders\|views` | One `{ date, value }` per Lagos day of the range, zero-filled |
| `GET /sellers/me/analytics/top-listings?range=&limit=5` | Best sellers by units, then revenue: units sold, revenue, views and conversion |
| `GET /sellers/me/inventory/alerts` | `{ threshold, items }`. Live and sold-out listings, or their options, at or below the level, out of stock first |

- **Definitions** (in Swagger too):
  - **Orders:** the seller's store orders in a `PAID` order, placed in the range, not cancelled.
  - **Revenue:** their `subtotalKobo`.
  - **Views:** the sum of `ListingDailyStat.views`.
  - **Ranges:** Lagos days, today included.
- **Caching:** stats, timeseries and top listings are kept in memory for 60 seconds per seller and query
  (`@nestjs/cache-manager`). The alerts are always fresh.
- **Jobs** (`analytics.jobs.ts`, off in tests):
  - every 10 minutes, `LowStockService.notifyNewlyLow()` sends `LOW_STOCK` (in the app, not by email) to sellers
    whose list just became non-empty, and re-arms sellers whose list is empty again;
  - at 03:30 Lagos time, `ListingView` rows from before today are pruned.
- **Views:** `ListingsService.recordView` inserts the `ListingView` row and adds to `ListingDailyStat` only if the
  row is new, in one statement.
- **Settings:** `lowStockThreshold`, from `LOW_STOCK_THRESHOLD` (default now 5) until an admin saves a value.

### Frontend

- **Dashboard** (`app/sellers/page.tsx`):
  - Views, Orders and Sales for 7, 30 or 90 days, each with its change.
  - The best seller of the range, hidden until something sells.
  - Loading and error states, with a retry.
- **Analytics** (`app/sellers/analytics`):
  - Revenue with its change; orders and views.
  - A daily trend of revenue, orders or views (`recharts` 3.10.1, loaded only on this page).
  - The top five sellers with conversion.
  - "Running low", with Restock opening the edit page.
  - Payouts held, on the way and paid out.
  - Each part has its own loading, empty and error state.
- **State:** `useSellerStore` keeps only the chosen range, so the dashboard and analytics agree. The mock numbers are
  gone. The hooks are in `lib/api/hooks/useSellerAnalytics.ts`.
- **Admin settings:** a "Low stock alert at" field. The saved toast names it.
- **Removed:** the mock `RevenueBarChart`.

### Tests

- **e2e:** `test/phase7-analytics.e2e-spec.ts`, 3 tests:
  - revenue against SQL for two sellers, with changes, views, the trend and best sellers;
  - access (403 and 401) and query checks (400);
  - alerts, restock, the once-only notification and the setting.
- **e2e, updated:** the Phase 3 view test (A2) and the Phase 5 settings test.
- **Unit:**
  - `analytics-rules.spec.ts`: Lagos days, ranges across month ends, change and conversion rounding, alert order;
  - `analytics.service.spec.ts`: the stats come from the seller's own rows; the 60-second cache; zero-filling;
    best sellers.
- **Frontend:**
  - the dashboard: numbers, range switch, best seller, error and retry;
  - the analytics page: all sections, switching range and metric, empty and error states;
  - the settings form.

## 3. Verification evidence

- **Backend** (local Postgres 16, `campusmart_test`): tsc clean; lint 0 warnings; build OK; unit 297/297 in 43
  suites; e2e 152/152 in 13 suites; `prisma migrate diff --exit-code` clean.
- **Frontend:** lint clean; tsc clean; vitest 256/256; `API_ORIGIN=http://localhost:4000 pnpm run build` OK.
- **gen:api:** regenerated with the backend change; CI re-checks it with no diff.
- **GitHub CI:**
  - [Run 67](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39075196655) on `a191829` (the
    frontend) was green.
  - [Run 68](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39101914916) on `24ed14f` was green.
  - [Run 69](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39102314477) on `53ac686` (the last
    code change) was green.
  - Run 66 on `0469a87` was red only on the frontend type check: the backend commit added the low-stock setting to
    the generated types before the settings form's test was updated, and the next commit fixed it.
- **Browser walk** ([`evidence/phase7-analytics/`](evidence/phase7-analytics/)): Chromium → `next start` → NestJS →
  `campusmart_dev`, in West Africa Time.
  - **Setup.** The sales are the paid orders from the Phase 5 and 6 walks. The walk adds a "Phone charger" for Chidi
    with 1 left, sets the lamp to 2 left, and re-arms Chidi's low-stock alert. The API ran with the Phase 5 Paystack
    stub and made-up `CLOUDINARY_*` values whose cloud name matches the dev seed's photos. That lets a listing that
    keeps its photos be saved; nothing is uploaded to or deleted from Cloudinary.
  - **Result.** Output in `analytics-walk-output.txt`, 12/12:
    - **Views (A2).** The buyer opened the lamp twice and Chidi read it once; today's views went from 0 to 1.
    - **Dashboard.** Chidi's 7-day sales show ₦40,500 from 9 orders, matching the SQL sum
      (`phone-seller-dashboard-7-days`), with "Desk lamp, 9 sold in the last 7 days" as the best seller. Switching to
      30 days shows the 30-day sum.
    - **Analytics.**
      - It keeps the 30-day range, draws the daily trend and lists the best sellers.
      - "Running low" shows the charger (1 left) before the lamp (2 left), and the payouts
        (`phone-seller-analytics`).
      - The orders trend is in `phone-seller-analytics-orders-trend`.
    - **Restock.** Restock opened the lamp's edit page; Chidi set 10 and saved (`phone-seller-restock-lamp`). The lamp
      left the list at once and the charger stayed (`phone-seller-running-low-after-restock`).
    - **Admin.** The settings show "Low stock alert at" 5. Changing it to 4 was audited, and it was set back to 5
      (`desktop-admin-settings-low-stock`).
    - **The 10-minute job.** It sent Chidi one `LOW_STOCK` notification: "1 item has 5 or fewer left. Restock so
      buyers can keep ordering."
  - **Reruns.** The first run stopped at the restock step. Saving a listing re-sends its photos for the ownership
    check, which needs Cloudinary configured (Phase 3). The walk now runs the API with the made-up values above.

    The second run passed 12/12. After it, the revenue card's wording with nothing to compare changed from "New" to
    "No sales in the 30 days before to compare with". The third run, on that build, is the evidence and also passed
    12/12.
  - **Screenshots.**
    - Product photos are placeholders because the walk replaces images.
    - The best seller's conversion reads 450% because the 9 units were bought by API in the earlier walks with only
      2 recorded views; units per view can pass 100%.
    - The app's floating bottom bar sits over the page in full-page captures.

## 4. Deviations and assumptions

- **The guide's day expression is corrected.** `date_trunc('day', "createdAt" AT TIME ZONE 'Africa/Lagos')` would
  read the stored UTC time as Lagos time and shift days the wrong way. The queries use
  `("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos'`.
- **Inventory alerts aren't cached,** so a restock shows at once. The other three are cached for 60 seconds as the
  guide says, so a new order can take a minute to show.
- **The low-stock notification runs every 10 minutes** rather than at the moment stock changes. That catches every
  way stock moves (checkout, cancellations, refunds, edits, admins) in one place, at the cost of up to 10 minutes'
  delay. It's in the app only, not by email.
- **Which listings count for stock:** live and sold-out ones, by option where a listing has options. Drafts, archived,
  flagged and deleted ones don't.
- **Payouts:**
  - `heldKobo` and `releasedKobo` are what's held or on the way now, whatever the range;
  - `paidOutKobo` is what reached the bank in the range;
  - "Held" is the seller's payout (after any platform fee), not the item subtotal.
- **The change for a range that has just started** compares part of today with full days before. The previous range
  always has the same number of days.
- **Best sellers list only listings that sold** in the range; a listing removed since keeps its sales under its
  current title.
- **Exact versions:** `@nestjs/cache-manager` 3.1.3, `cache-manager` 7.2.9, `keyv` 5.6.0, `recharts` 3.10.1 and
  `react-is` 19.2.3 (a recharts peer).

## 5. Needs from you

Nothing. Phase 8 doesn't wait on anything.
