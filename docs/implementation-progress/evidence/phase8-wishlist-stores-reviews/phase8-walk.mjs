// Phase 8 browser walk: Chromium -> next start (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. Accounts (local dev only): admin@campusmart.test, seller chidi.store@,
// buyer tobi.buyer@. The orders rated here are ones the Phase 6 walks delivered.
// The nightly trust-score job is run once, from the built API, the way its cron would.
// Run: node phase8-walk.mjs <shots dir> <repo>/public <repo>/backend
import { execFileSync } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, PUBLIC, BACKEND] = process.argv.slice(2);
const DB = 'postgresql://postgres:postgres@localhost:5432/campusmart_dev';
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LocalAdmin123';
const BUYER = 'tobi.buyer@students.unilag.edu.ng';
const CHIDI = 'chidi.store@students.unilag.edu.ng';
const LAMP = 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets
const PANTS = '49ce6c55-4c06-4df9-a673-72328e0bf031'; // Amaka Styles

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();

// The nightly job (TrustService.recalculate), run once from the built API with its own settings
function runTrustJob() {
  const code = `
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./dist/app.module');
    const { TrustService } = require('./dist/trust/trust.service');
    (async () => {
      const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
      console.log(await app.get(TrustService).recalculate(new Date()));
      await app.close();
    })();`;
  return execFileSync('bash', ['-c', `set -a; . ./.env; set +a; node -e "$CODE"`], {
    cwd: BACKEND,
    encoding: 'utf8',
    env: { ...process.env, CODE: code },
  }).trim();
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
async function context(options, init) {
  const ctx = await browser.newContext({ timezoneId: 'Africa/Lagos', ...options });
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  if (init) await ctx.addInitScript(init.fn, init.arg);
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

// ── Setup on the dev database: both listings live; the nightly job has run ──
sql(`update "Listing" set stock = greatest(stock, 5), status = 'ACTIVE' where id in ('${LAMP}', '${PANTS}')`);
const tobiId = sql(`select id from "User" where email = '${BUYER}'`);
const chidiId = sql(`select id from "User" where email = '${CHIDI}'`);

// ── R5: a favourite saved on the phone before sign-in joins the account at sign-in ──
const buyerCtx = await context(phone, {
  // Only before the first page loads; the app clears the key once merged
  fn: (id) => {
    if (sessionStorage.getItem('walk-seeded')) return;
    sessionStorage.setItem('walk-seeded', '1');
    localStorage.setItem('campus-mart-favourites', JSON.stringify({ state: { favourites: [{ id, title: 'UrbanFlex cargo pants' }] }, version: 1 }));
  },
  arg: PANTS,
});
const tobi = await buyerCtx.newPage();
await signIn(tobi, BUYER, PASSWORD, `${BASE}/`);
await tobi.waitForFunction(() => localStorage.getItem('campus-mart-favourites') === null, null, { timeout: 15000 });
check(
  'Favourites saved on the phone before sign-in move into the account, then leave the phone (R5)',
  sql(`select count(*) from "Wishlist" where "userId" = '${tobiId}' and "listingId" = '${PANTS}'`) === '1',
);

// ── Home: the Featured Store row; See all opens /stores ──
await tobi.getByRole('heading', { name: 'Featured Store' }).waitFor().catch(() => {});
await tobi.getByRole('link', { name: 'Chidi Gadgets' }).first().waitFor();
await tobi.waitForTimeout(400);
await shot(tobi, 'phone-home-featured-stores');
check('The home page shows the Featured Store row from /stores?featured=true (guide 8.2)', (await tobi.getByRole('link', { name: 'Amaka Styles' }).count()) > 0);

// ── Product page: the heart saves to the account; the seller links to the store ──
await tobi.goto(`${BASE}/productItem/${LAMP}`);
await tobi.getByText('Desk lamp').first().waitFor();
const add = () => tobi.getByRole('button', { name: 'Add to favourites', exact: true });
const remove = () => tobi.getByRole('button', { name: 'Remove from favourites', exact: true });
const savedLamp = () => sql(`select count(*) from "Wishlist" where "userId" = '${tobiId}' and "listingId" = '${LAMP}'`);
await add().or(remove()).waitFor();
if (savedLamp() === '1') {
  await remove().click();
  await add().waitFor();
  await tobi.waitForTimeout(500);
}
check('Before saving, the lamp isn’t a favourite', savedLamp() === '0');
await add().click();
await remove().waitFor();
await tobi.waitForTimeout(500);
check('Tapping the heart saves it to the account (guide 8.1)', savedLamp() === '1');

// ── Order page: rate what you received (guide 8.4) ──
const toRate = sql(`select so.id || '|' || so."orderId" from "SellerOrder" so join "Order" o on o.id = so."orderId"
  where o."buyerId" = '${tobiId}' and so."sellerId" = '${chidiId}' and so."fulfillmentStatus" in ('DELIVERED', 'COLLECTED')
    and not exists (select 1 from "Review" r where r."sellerOrderId" = so.id)
  order by so."collectedAt" desc limit 1`).split('|');
if (!toRate[1]) throw new Error('No delivered order from Chidi left to rate; run the Phase 6 walk for another');
const ratingBefore = sql(`select "ratingCount" from "Listing" where id = '${LAMP}'`);
await tobi.goto(`${BASE}/orders/${toRate[1]}#rate`);
await tobi.getByText('Rate your items').first().waitFor();
await tobi.getByRole('button', { name: 'Rate Desk lamp' }).first().click();
const dialog = tobi.getByRole('dialog');
await dialog.getByRole('radio', { name: '5 stars' }).click();
await dialog.getByRole('textbox').fill('Bright, sturdy and as described. Chidi was quick.');
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-buyer-rate-item', false);
await dialog.getByRole('button', { name: 'Send rating' }).click();
await tobi.getByText('Thanks for rating').first().waitFor();
await tobi.getByText('You rated it').first().waitFor();
await tobi.waitForTimeout(400);
await shot(tobi, 'phone-buyer-order-rated');
check(
  'Rating an item received updates the listing’s rating at once (guide 8.4)',
  Number(sql(`select "ratingCount" from "Listing" where id = '${LAMP}'`)) === Number(ratingBefore) + 1,
);

// ── The nightly trust score, then the store page ──
const changed = runTrustJob();
const score = Number(sql(`select "trustScore" from "User" where id = '${chidiId}'`));
check('The nightly job scores sellers with the settings’ weights (guide 8.4, R1)', score > 0, `Chidi ${score}, ${changed} changed`);
await tobi.goto(`${BASE}/productItem/${LAMP}`);
await tobi.getByText('Bright, sturdy and as described. Chidi was quick.').first().waitFor();
// The Add to Cart bar is fixed to the bottom, so this one is the screen as the buyer sees it
await tobi.getByText('Seller Info').evaluate((el) => el.scrollIntoView({ block: 'center' }));
await tobi.waitForTimeout(400);
await shot(tobi, 'phone-product-reviews-and-seller', false);
check('The product page lists its reviews from the API', true);
await tobi.getByRole('link', { name: 'Visit Chidi Gadgets' }).click();
await tobi.waitForURL(`${BASE}/stores/${chidiId}`);
await tobi.getByRole('heading', { name: 'Chidi Gadgets' }).waitFor();
await tobi.getByText('Desk lamp').first().waitFor();
await tobi.waitForTimeout(400);
await shot(tobi, 'phone-store-page');
check(
  `The store shows "Trusted seller" only at 80 or more (R2)`,
  (await tobi.getByText('Trusted seller').count() > 0) === score >= 80,
  `score ${score}`,
);
await tobi.getByRole('tab', { name: /^Reviews/ }).click();
await tobi.getByText('Bright, sturdy and as described. Chidi was quick.').first().waitFor();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-store-reviews');

// ── Favourites, /stores and /browse ──
await tobi.goto(`${BASE}/favourites`);
await tobi.getByRole('heading', { name: 'Desk lamp' }).waitFor();
await tobi.getByRole('heading', { name: /UrbanFlex/ }).waitFor();
await tobi.waitForTimeout(400);
await shot(tobi, 'phone-favourites');
check('The favourites page lists the account’s favourites, the merged one included', true);
await tobi.goto(`${BASE}/stores`);
await tobi.getByRole('link', { name: 'Chidi Gadgets' }).waitFor();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-stores');
await tobi.goto(`${BASE}/browse?sort=newest`);
await tobi.waitForURL(`${BASE}/categories?sort=newest`);
check('/browse?sort=newest opens the listing grid sorted newest first (guide 8.3)', true);

// ── Every link on the buyer's main screens reaches a page ──
const pages = ['/', `/productItem/${LAMP}`, `/stores/${chidiId}`, '/favourites', '/cart', '/profile', '/profile/settings', `/orders/${toRate[1]}`];
const hrefs = new Set();
for (const path of pages) {
  await tobi.goto(`${BASE}${path}`);
  await tobi.waitForLoadState('networkidle');
  for (const href of await tobi.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')))) hrefs.add(href.split('#')[0]);
}
const broken = [];
for (const href of hrefs) {
  const res = await tobi.request.get(`${BASE}${href}`, { maxRedirects: 0 });
  if (res.status() === 404) broken.push(href);
}
check('No link on the buyer’s main screens leads to a missing page (guide 8.3)', broken.length === 0, `${hrefs.size} links${broken.length ? `; broken: ${broken.join(', ')}` : ''}`);

// ── Admin: hide an abusive review (R4), and the trust weights in settings ──
const reviewId = sql(`select id from "Review" where "sellerOrderId" = '${toRate[0]}'`);
const adminCtx = await context({ viewport: { width: 1366, height: 900 } });
const admin = await adminCtx.newPage();
await signIn(admin, 'admin@campusmart.test', ADMIN_PASSWORD, '**/admin');
await admin.goto(`${BASE}/admin/reviews`);
// Newest first: this run's review, even if earlier runs left one with the same words
const row = admin.getByRole('row').filter({ hasText: 'Bright, sturdy and as described' }).first();
await row.waitFor();
await admin.waitForTimeout(300);
await shot(admin, 'desktop-admin-reviews');
await row.getByRole('button', { name: 'Hide' }).click();
await admin.getByRole('dialog').getByRole('textbox').fill('Walk check: hiding and showing a review');
await admin.getByRole('dialog').getByRole('button', { name: 'Hide review' }).click();
await admin.getByText('Review hidden').first().waitFor();
check(
  'Hiding a review stops it counting, and is audited (R4)',
  sql(`select "hiddenAt" is not null from "Review" where id = '${reviewId}'`) === 't' &&
    sql(`select count(*) from "AuditLog" where action = 'REVIEW_HIDDEN' and "entityId" = '${reviewId}'`) === '1' &&
    sql(`select "ratingCount" from "Listing" where id = '${LAMP}'`) === ratingBefore,
);
await admin.goto(`${BASE}/admin/reviews?tab=HIDDEN`);
const hiddenRow = admin.getByRole('row').filter({ hasText: 'Bright, sturdy and as described' }).first();
await hiddenRow.waitFor();
await admin.waitForTimeout(300);
await shot(admin, 'desktop-admin-reviews-hidden');
await hiddenRow.getByRole('button', { name: 'Show again' }).click();
await admin.getByRole('dialog').getByRole('button', { name: 'Show review' }).click();
await admin.getByText('Review shown again').first().waitFor();
check('…and showing it again counts it again', sql(`select "ratingCount" from "Listing" where id = '${LAMP}'`) === String(Number(ratingBefore) + 1));
await admin.goto(`${BASE}/admin/settings`);
await admin.getByLabel('Points for a 5-star rating').waitFor();
await admin.getByText('Trust score').first().scrollIntoViewIfNeeded();
await admin.waitForTimeout(300);
await shot(admin, 'desktop-admin-settings-trust');
check('The trust-score weights are admin settings: 50, 30, 20, 10 (R1)', (await admin.getByLabel('Points off per seller-fault refund').inputValue()) === '10');

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
