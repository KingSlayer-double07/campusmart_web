// Phase 7 browser walk: Chromium -> next start (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. The sales come from the Phase 5 and 6 walks' paid orders.
// Accounts (local dev only): admin@campusmart.test, seller chidi.store@, buyer tobi.buyer@.
// The walk resets its own setup (stock levels and Chidi's low-stock flag), so it can be repeated.
// Run: node analytics-walk.mjs <shots dir> <repo>/public
import { execFileSync } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, PUBLIC] = process.argv.slice(2);
const DB = 'postgresql://postgres:postgres@localhost:5432/campusmart_dev';
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LocalAdmin123';
const BUYER = 'tobi.buyer@students.unilag.edu.ng';
const CHIDI = 'chidi.store@students.unilag.edu.ng';
const LAMP = 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets
const CHARGER = '7a0c2b1e-5f3d-4e8a-9c61-0d2f4b7e9a10'; // added by this walk for Chidi
const LOW_STOCK_WAIT_MS = 11 * 60_000; // the alert job runs every 10 minutes

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();
const naira = (kobo) => `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(kobo / 100)}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
async function context(options) {
  const ctx = await browser.newContext({ timezoneId: 'Africa/Lagos', ...options });
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  return ctx;
}
async function signIn(page, email, password, landing) {
  await page.goto(`${BASE}/onboarding/buyers/sign-in`);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('School email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(landing, { timeout: 20000 });
}

// ── Setup on the dev database: a second item for Chidi, both running low, alert re-armed ──
const walkStart = new Date().toISOString();
const chidiId = sql(`select id from "User" where email = '${CHIDI}'`);
sql(`insert into "Listing" (id, title, description, "priceKobo", stock, status, category, condition, "sellerId", "institutionId", "updatedAt")
     select '${CHARGER}', 'Phone charger', 'Fast charger, 20W', 350000, 1, 'ACTIVE', category, condition, "sellerId", "institutionId", now()
     from "Listing" where id = '${LAMP}' on conflict (id) do nothing`);
sql(`insert into "ListingImage" (id, url, "publicId", position, "listingId")
     select gen_random_uuid()::text, url, "publicId" || '-charger', 0, '${CHARGER}' from "ListingImage" where "listingId" = '${LAMP}' and position = 0
     and not exists (select 1 from "ListingImage" where "listingId" = '${CHARGER}')`);
sql(`update "Listing" set stock = 1, status = 'ACTIVE' where id = '${CHARGER}'`);
sql(`update "Listing" set stock = 2, status = 'ACTIVE' where id = '${LAMP}'`);
sql(`update "SellerProfile" set "lowStockAlertedAt" = null where "userId" = '${chidiId}'`);
sql(`update "PlatformSetting" set value = '5'::jsonb where key = 'lowStockThreshold'`);

// ── Views (A2): a buyer opening the lamp twice today counts once; the seller's own don't ──
const buyerCtx = await context(phone);
const tobi = await buyerCtx.newPage();
await signIn(tobi, BUYER, PASSWORD, `${BASE}/`);
const tobiId = sql(`select id from "User" where email = '${BUYER}'`);
const today = sql(`select (now() at time zone 'Africa/Lagos')::date`);
const seenBefore = sql(`select count(*) from "ListingView" where "listingId" = '${LAMP}' and "viewerId" = '${tobiId}' and date = '${today}'`) === '1';
const viewsNow = () => Number(sql(`select coalesce(sum(views), 0) from "ListingDailyStat" where "listingId" = '${LAMP}' and date = '${today}'`));
const before = viewsNow();
for (let i = 0; i < 2; i++) {
  await tobi.goto(`${BASE}/productItem/${LAMP}`);
  await tobi.getByText('Desk lamp').first().waitFor();
}
const chidiCtx = await context(phone);
const chidi = await chidiCtx.newPage();
await chidi.request.post(`${BASE}/api/auth/login`, { data: { email: CHIDI, password: PASSWORD } });
await chidi.request.get(`${BASE}/api/listings/${LAMP}`);
await new Promise((r) => setTimeout(r, 500));
check(
  'Two visits by one buyer on one day count as one view; the seller’s own visit doesn’t count (A2)',
  viewsNow() - before === (seenBefore ? 0 : 1),
  `${before} -> ${viewsNow()}${seenBefore ? ', already seen today' : ''}`,
);

// ── Seller dashboard: the real numbers, checked against SQL ──
const revenueSql = (days) =>
  Number(
    sql(`select coalesce(sum(so."subtotalKobo"), 0) from "SellerOrder" so join "Order" o on o.id = so."orderId"
         where so."sellerId" = '${chidiId}' and o.status = 'PAID' and so."fulfillmentStatus" <> 'CANCELLED'
           and so."createdAt" >= ((date_trunc('day', now() at time zone 'Africa/Lagos') - interval '${days - 1} days') at time zone 'Africa/Lagos') at time zone 'UTC'`),
  );
const ordersSql = (days) =>
  Number(
    sql(`select count(*) from "SellerOrder" so join "Order" o on o.id = so."orderId"
         where so."sellerId" = '${chidiId}' and o.status = 'PAID' and so."fulfillmentStatus" <> 'CANCELLED'
           and so."createdAt" >= ((date_trunc('day', now() at time zone 'Africa/Lagos') - interval '${days - 1} days') at time zone 'Africa/Lagos') at time zone 'UTC'`),
  );
await chidi.goto(`${BASE}/sellers`);
await chidi.getByText('Sales in the last 7 days').waitFor();
const week = revenueSql(7);
await chidi.getByText(naira(week), { exact: true }).waitFor();
await chidi.getByText(/sold in the last 7 days/).waitFor();
await chidi.waitForTimeout(500);
await shot(chidi, 'phone-seller-dashboard-7-days', false);
check(
  'The dashboard’s 7-day sales equal the SQL sum of paid store orders (Phase 7 checklist)',
  (await chidi.getByText(naira(week), { exact: true }).count()) === 1,
  `${naira(week)}, ${ordersSql(7)} orders`,
);
check('The dashboard shows the order count from SQL', (await chidi.getByText(String(ordersSql(7)), { exact: true }).count()) >= 1);
check('The best seller of the range shows with units sold', (await chidi.getByText('Desk lamp').count()) >= 1);
await chidi.getByRole('button', { name: '30 days' }).click();
await chidi.getByText('Sales in the last 30 days').waitFor();
await chidi.getByText(naira(revenueSql(30)), { exact: true }).waitFor();
check('Switching to 30 days shows the 30-day sum', true, naira(revenueSql(30)));

// ── Analytics page (same range, remembered) ──
await chidi.getByRole('link', { name: 'View Analytics' }).click();
await chidi.waitForURL(`${BASE}/sellers/analytics`);
await chidi.getByText('Revenue in the last 30 days').waitFor();
await chidi.locator('.recharts-line').first().waitFor();
await chidi.getByText('2 left').waitFor();
await chidi.waitForTimeout(600);
await shot(chidi, 'phone-seller-analytics');
check('The analytics page keeps the range and draws the daily trend (recharts)', (await chidi.locator('.recharts-line').count()) === 1);
check(
  'Items running low list the charger (1 left) before the lamp (2 left), with Restock',
  (await chidi.getByRole('link', { name: /^Restock / }).count()) === 2 &&
    (await chidi.getByRole('link', { name: 'Restock Phone charger' }).count()) === 1,
);
await chidi.getByRole('tab', { name: 'Orders' }).click();
await chidi.getByRole('tab', { name: 'Orders', selected: true }).waitFor();
await chidi.waitForTimeout(600);
await chidi.locator('section[aria-labelledby="trend-title"]').screenshot({ path: `${OUT}/phone-seller-analytics-orders-trend.png` });

// ── Restock from the alert ──
await chidi.getByRole('link', { name: 'Restock Desk lamp' }).click();
await chidi.waitForURL(`${BASE}/sellers/products/${LAMP}/edit`);
await chidi.getByLabel('Quantity in stock').fill('10');
await chidi.waitForTimeout(300);
await shot(chidi, 'phone-seller-restock-lamp', false);
await chidi.getByRole('button', { name: 'Save changes' }).click();
await chidi.waitForURL(`${BASE}/sellers/products/${LAMP}`, { timeout: 20000 });
await chidi.goto(`${BASE}/sellers/analytics#stock`);
await chidi.getByText('1 left').waitFor();
await chidi.waitForTimeout(400);
await chidi.locator('#stock').screenshot({ path: `${OUT}/phone-seller-running-low-after-restock.png` });
check(
  'Restocking takes the lamp off the list at once; the charger stays (Phase 7 checklist)',
  (await chidi.getByRole('link', { name: 'Restock Desk lamp' }).count()) === 0 && sql(`select stock from "Listing" where id = '${LAMP}'`) === '10',
);

// ── Admin: the low-stock level is a setting (A1) ──
const adminCtx = await context({ viewport: { width: 1366, height: 900 } });
const admin = await adminCtx.newPage();
await signIn(admin, 'admin@campusmart.test', ADMIN_PASSWORD, '**/admin');
await admin.goto(`${BASE}/admin/settings`);
const level = admin.getByLabel('Low stock alert at');
await level.waitFor();
check('The admin settings show the low-stock level, 5 by default (A1)', (await level.inputValue()) === '5');
await level.fill('4');
await admin.getByRole('button', { name: 'Save settings' }).click();
await admin.getByText(/saved/i).first().waitFor();
check('Saving it is audited', sql(`select count(*) from "AuditLog" where action = 'SETTING_CHANGED' and "entityId" = 'lowStockThreshold' and "createdAt" > '${walkStart}'`) === '1');
await level.fill('5');
await admin.waitForTimeout(300);
await shot(admin, 'desktop-admin-settings-low-stock', false);
await admin.getByRole('button', { name: 'Save settings' }).click();
await admin.waitForTimeout(800);
check('…and set back to 5', sql(`select value from "PlatformSetting" where key = 'lowStockThreshold'`) === '5');

// ── The alert job tells Chidi once, within 10 minutes (guide 7.2.4) ──
const toldSince = () =>
  Number(sql(`select count(*) from "Notification" where "userId" = '${chidiId}' and type = 'LOW_STOCK' and "createdAt" > '${walkStart}'`));
const deadline = Date.now() + LOW_STOCK_WAIT_MS;
while (toldSince() === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 15_000));
check('The 10-minute job sends Chidi one low-stock notification', toldSince() === 1, sql(`select body from "Notification" where "userId" = '${chidiId}' and type = 'LOW_STOCK' order by "createdAt" desc limit 1`));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
