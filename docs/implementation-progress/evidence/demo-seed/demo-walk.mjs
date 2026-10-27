// The demo data in the app: Chromium -> next start (:3000) -> NestJS (:4000) -> a fresh local database with the
// base seed and `pnpm run seed:demo` (DEMO_PASSWORD=DemoPass2026, local only). Listing photos are swapped for
// local files: this sandbox can't reach images.unsplash.com.
// Run: node demo-walk.mjs <shots dir> <repo>/public <api log file>
import { readFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, PUBLIC, API_LOG] = process.argv.slice(2);
const PASSWORD = 'DemoPass2026';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function context(options, init = {}) {
  const ctx = await browser.newContext({ timezoneId: 'Africa/Lagos', colorScheme: 'light', ...options });
  await ctx.addInitScript((init) => {
    localStorage.setItem('pwa_prompt_dismissed', 'true');
    for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v);
  }, init);
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  return ctx;
}
async function signIn(page, email, code) {
  await page.goto(`${BASE}/onboarding/buyers/sign-in`);
  await page.getByPlaceholder(/^(School email|Email)$/).fill(email);
  await page.getByPlaceholder('Password').fill(code ? 'LocalAdmin123' : PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  if (code) {
    await page.getByPlaceholder('6-digit code').waitFor();
    const blocks = readFileSync(API_LOG, 'utf8').split(`[dev mail] to=${email} template=admin-sign-in`);
    await page.getByPlaceholder('6-digit code').fill(blocks.at(-1).match(/code is (\d{6})/)[1]);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 20000 });
}
const api = (page, path) => page.evaluate(async (p) => (await fetch(`/api${p}`)).json(), path);
const settle = async (page) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
};
const text = (page) => page.locator('main').first().innerText();

// ── A guest browsing Test University ──
const schoolId = process.env.SCHOOL_ID;
let ctx = await context(phone, {
  'campus-mart-guest': JSON.stringify({ state: { school: { id: schoolId, name: process.env.SCHOOL_NAME ?? 'Test University' }, introSeen: true }, version: 0 }),
});
let page = await ctx.newPage();
await page.goto(`${BASE}/`);
await settle(page);
const cards = await page.getByRole('button', { name: /favourites/i }).count();
check('A guest sees a full shop: products from six stores', cards >= 8, `${cards} product cards on the home page`);
await shot(page, '01-guest-home');
await ctx.close();

// ── A buyer: orders in every state, notifications, favourites, reviews ──
ctx = await context(phone);
page = await ctx.newPage();
await signIn(page, 'ifeoma.eze@demo.campusmart.test');
await page.goto(`${BASE}/orders`);
await settle(page);
const orders = await api(page, '/orders');
check('Ifeoma has five orders, one on its way now', orders.data.items.length === 5, `${orders.data.items.length} orders`);
await shot(page, '02-buyer-orders');
const onTheWay = orders.data.items[0];
await page.goto(`${BASE}/orders/${onTheWay.id}`);
await settle(page);
check('The newest order is with a rider, Grace Udoh', /Grace/.test(await text(page)));
await shot(page, '03-buyer-order-with-rider');
await page.goto(`${BASE}/profile/notifications`);
await settle(page);
const inbox = await api(page, '/notifications');
check('Her notifications tell the story of her orders', inbox.data.items.length >= 10, `${inbox.data.items.length} on the first page`);
await shot(page, '04-buyer-notifications');
await page.goto(`${BASE}/favourites`);
await settle(page);
check('Three favourites', (await api(page, '/wishlist')).data.items.length === 3);
const headphones = (await api(page, '/listings?q=headphones')).data.items[0];
await page.goto(`${BASE}/productItem/${headphones.id}`);
await settle(page);
check('A product shows its rating and reviews', /5\.0|4\.\d/.test(await text(page)) && (await api(page, `/listings/${headphones.id}/reviews`)).data.items.length >= 2);
await shot(page, '05-product-with-reviews');
await page.goto(`${BASE}/stores/${headphones.seller.id}`);
await settle(page);
check('The store page: Gadget Plug, its rating and listings', /Gadget Plug/.test(await text(page)));
await shot(page, '06-store-page');
await ctx.close();

// ── A seller: sales, views, orders and payouts ──
ctx = await context(phone);
page = await ctx.newPage();
await signIn(page, 'emeka.obi@demo.campusmart.test');
await settle(page);
const stats = await api(page, '/sellers/me/stats?range=30d');
check('Gadget Plug\'s dashboard has 30 days of sales and views', stats.data.revenueKobo > 0 && stats.data.views > 0,
  `₦${stats.data.revenueKobo / 100} from ${stats.data.orders} orders, ${stats.data.views} views`);
await shot(page, '07-seller-dashboard');
await page.goto(`${BASE}/sellers/orders`);
await settle(page);
await shot(page, '08-seller-orders');
await page.goto(`${BASE}/sellers/analytics`);
await settle(page);
await shot(page, '09-seller-analytics');
await page.goto(`${BASE}/sellers/earnings`);
await settle(page);
const payouts = await api(page, '/sellers/me/payouts');
check('Its payouts: paid ones and one that failed', payouts.data.items.some((p) => p.status === 'PAID') && payouts.data.items.some((p) => p.status === 'FAILED'));
await shot(page, '10-seller-earnings');
await ctx.close();

// ── A rider: an open job and their own ──
ctx = await context(phone);
page = await ctx.newPage();
await signIn(page, 'musa.bello@demo.campusmart.test');
await settle(page);
const open = await api(page, '/dispatch/jobs?scope=OPEN');
const mine = await api(page, '/dispatch/jobs?scope=MINE');
const done = await api(page, '/dispatch/jobs?scope=DONE');
check('Musa sees an open job, his current one and his history', open.data.items.length === 1 && mine.data.items.length === 1 && done.data.items.length >= 5,
  `${open.data.items.length} open, ${mine.data.items.length} his, ${done.data.items.length} done`);
await shot(page, '11-rider-jobs');
await ctx.close();

// ── The admin console on a laptop ──
ctx = await context({ viewport: { width: 1366, height: 900 } });
page = await ctx.newPage();
await signIn(page, 'admin@campusmart.test', true);
await settle(page);
const overview = (await api(page, '/admin/overview')).data;
check('The admin overview has numbers and things waiting', overview.users >= 20 && overview.openDisputes === 1 && overview.failedPayouts === 1 && overview.listingsToReview === 1,
  `${overview.users} accounts, ${overview.sellers} sellers, ${overview.openDisputes} dispute, ${overview.failedPayouts} failed payout, ${overview.listingsToReview} to review, ${overview.openReports} reports`);
await shot(page, '12-admin-overview');
for (const [path, name] of [
  ['/admin/deliveries', '13-admin-deliveries'],
  ['/admin/disputes', '14-admin-disputes'],
  ['/admin/payouts', '15-admin-payouts'],
  ['/admin/listings', '16-admin-listings'],
  ['/admin/reports', '17-admin-reports'],
  ['/admin/users', '18-admin-users'],
  ['/admin/audit', '19-admin-audit'],
]) {
  await page.goto(`${BASE}${path}`);
  await settle(page);
  await shot(page, name);
}
const audit = await api(page, '/admin/audit-log');
check('The audit log has the history', audit.data.items.length >= 20, `${audit.data.items.length} on the first page`);
await ctx.close();

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
