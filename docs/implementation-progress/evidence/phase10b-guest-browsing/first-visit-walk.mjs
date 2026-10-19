// Phase 10b browser walk: a brand-new visitor on a phone, from the splash to checkout.
// Chromium -> next start (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000) -> local campusmart_dev.
// The visitor signs up with a new gmail.com address; the email code is read from the API's console,
// where dev mail prints until MAIL_* is set up.
// Run: node first-visit-walk.mjs <shots dir> <repo>/public <api log file>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, PUBLIC, API_LOG] = process.argv.slice(2);
const DB = 'postgresql://postgres:postgres@localhost:5432/campusmart_dev';
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const LAMP = 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets, University of Lagos
const RUN = Date.now();
const NEW_BUYER = `walk.guest.${RUN}@gmail.com`;

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();
const h1 = async (page) => (await page.locator('h1').first().textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
function latestCode(email, template) {
  const blocks = readFileSync(API_LOG, 'utf8').split(`[dev mail] to=${email} template=${template}`);
  return blocks.length > 1 ? (blocks.at(-1).match(/ is (\d{6})/)?.[1] ?? null) : null;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
async function context() {
  const ctx = await browser.newContext({ timezoneId: 'Africa/Lagos', ...phone });
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  return ctx;
}

// ── First visit: splash, intro slides, the three choices ──
const ctx = await context();
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(`${BASE}/`);
await page.waitForURL(/\/splash/);
await page.getByText('Browse. Buy. Sell Items').waitFor();
await shot(page, '01-splash');
check('A first visit opens on the splash', true);
await page.waitForURL(/\/onboarding\/intro/, { timeout: 10000 });
check('…which moves on to the intro slides after about 2 seconds', Date.now() - t0 >= 2000, `${Date.now() - t0} ms`);
await page.getByRole('heading', { name: 'Your campus marketplace' }).waitFor();
await shot(page, '02-intro-1');
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('heading', { name: 'Pay with peace of mind' }).waitFor();
await shot(page, '03-intro-2');
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('heading', { name: 'Delivered on campus' }).waitFor();
await shot(page, '04-intro-3');
check('Three slides, with Next and the dots', (await page.getByRole('tab').count()) === 3);
await page.getByRole('button', { name: 'Get started' }).click();
await page.waitForURL(/\/onboarding\/role-select/);
check('The slides end on the three choices', /How do you want to use/.test(await h1(page)));
check('Browse, Buy and Sell are offered', (await page.getByText('Browse Items').count()) + (await page.getByText('Buy Items').count()) + (await page.getByText('Sell Items').count()) === 3);
await shot(page, '05-three-choices');

// ── Browse without an account: pick a school ──
await page.getByText('Browse Items').click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForURL(/\/onboarding\/guest-school/);
check('Browse asks which school to browse, not for an account', /Which school do you want to browse/.test(await h1(page)));
await page.getByRole('radio', { name: 'University of Lagos' }).click();
await shot(page, '06-guest-school');
await page.getByRole('button', { name: 'Start browsing' }).click();
await page.waitForURL(`${BASE}/`);
await page.getByText('Browsing').waitFor();
// Product cards: each has a favourites button named after the item
const cards = page.getByRole('button', { name: /to favourites$/ });
await cards.first().waitFor({ timeout: 15000 });
check('The home page shows the school\'s listings to a guest', (await cards.count()) > 0, `${await cards.count()} cards`);
check('…with "Browsing University of Lagos", Change and Sign in', (await page.getByText('University of Lagos').isVisible()) && (await page.getByRole('link', { name: 'Change' }).isVisible()) && (await page.getByRole('link', { name: 'Sign in' }).isVisible()));
check('…and no store pages or notification bell', (await page.getByText('Featured Store').count()) === 0 && (await page.getByRole('link', { name: /^Notifications/ }).count()) === 0);
check('The home page fits a phone screen', await noSideScroll(page));
await shot(page, '07-home-as-guest');

// ── Search and categories ──
await page.getByPlaceholder('Search on Campusmart').fill('lamp');
await page.getByPlaceholder('Search on Campusmart').press('Enter');
await page.waitForURL(/\/categories\?q=lamp/);
await cards.first().waitFor({ timeout: 15000 });
check('A guest can search', (await page.getByRole('button', { name: /Add Desk lamp to favourites/ }).count()) > 0);
await shot(page, '08-search-as-guest');

// ── A product: reviews, the heart, Report ──
await page.goto(`${BASE}/productItem/${LAMP}`);
await page.getByRole('button', { name: 'Add to Cart' }).waitFor({ timeout: 15000 });
check('A guest can open a product', (await h1(page)) !== '' || (await page.getByText('Desk lamp').first().isVisible()));
await shot(page, '09-product-as-guest');
await page.getByRole('button', { name: /favourite/i }).first().click();
await page.getByText('Sign in to save favourites').waitFor();
const saveHref = await page.getByRole('link', { name: 'Sign in' }).last().getAttribute('href');
check('The heart asks a guest to sign in, and to come back to the item', saveHref === `/onboarding/buyers/sign-in?next=${encodeURIComponent(`/productItem/${LAMP}`)}`, saveHref);
await shot(page, '10-heart-asks-sign-in');
await page.getByRole('button', { name: 'Not now' }).click();

// ── The cart, then checkout asks to sign in ──
await page.getByRole('button', { name: 'Add to Cart' }).click();
await page.getByRole('button', { name: 'One more' }).waitFor();
await page.goto(`${BASE}/cart`);
await page.getByText('Desk lamp').first().waitFor();
check('A guest opens their cart without signing in', new URL(page.url()).pathname === '/cart');
await shot(page, '11-cart-as-guest');
await page.getByRole('button', { name: /Checkout/ }).click();
await page.waitForURL(/\/onboarding\/buyers\/sign-in/);
check('Checkout asks the guest to sign in, keeping /checkout for after', new URL(page.url()).searchParams.get('next') === '/checkout');
await shot(page, '12-checkout-asks-sign-in');

// ── Sign up from there: email code, the school they browsed, then checkout with the cart ──
await page.getByRole('link', { name: /Create one here/ }).click();
await page.waitForURL(/\/onboarding\/buyers\/sign-up\?next=/);
await page.getByPlaceholder('Email').fill(NEW_BUYER);
await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
await page.getByPlaceholder('Confirm password').fill(PASSWORD);
await page.getByRole('button', { name: 'Create an Account' }).click();
await page.waitForURL(/\/onboarding\/verify-email\?next=/);
await page.waitForTimeout(500);
await page.getByLabel('Verification code').fill(latestCode(NEW_BUYER, 'verify-email'));
await page.getByRole('button', { name: 'Verify email' }).click();
await page.waitForURL(/\/onboarding\/school\?next=/, { timeout: 20000 });
await page.getByText(/You were browsing University of Lagos/).waitFor();
check('The school they browsed is chosen already', (await page.getByRole('radio', { name: 'University of Lagos' }).getAttribute('aria-checked')) === 'true');
await shot(page, '13-school-carried-over');
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForURL(/\/checkout/, { timeout: 20000 });
// Checkout names each item in its photo's alt text
await page.getByAltText('Desk lamp').first().waitFor({ timeout: 15000 });
const newId = sql(`select id from "User" where email = '${NEW_BUYER}'`);
check('They arrive at checkout with the cart they filled as a guest', sql(`select count(*) from "CartItem" where "userId" = '${newId}' and "listingId" = '${LAMP}'`) === '1');
await shot(page, '14-checkout-after-sign-up');
await ctx.close();

// ── Store pages need an account; a returning guest goes straight back to browsing ──
const guest = await context();
const g = await guest.newPage();
await g.goto(`${BASE}/stores`);
await g.waitForURL(/\/onboarding\/buyers\/sign-in/);
check('A guest opening a store page is asked to sign in', new URL(g.url()).searchParams.get('next') === '/stores');
const unilag = sql(`select id from "Institution" where name = 'University of Lagos'`);
await g.evaluate((id) => localStorage.setItem('campus-mart-guest', JSON.stringify({ state: { school: { id, name: 'University of Lagos' }, introSeen: true }, version: 0 })), unilag);
await g.goto(`${BASE}/`);
await g.getByText('Browsing').waitFor();
await g.waitForTimeout(500);
check('A returning guest opens straight on the home page, no splash', new URL(g.url()).pathname === '/');
await g.goto(`${BASE}/productItem/${LAMP}`);
await g.getByRole('button', { name: /Report this listing/ }).click();
await g.waitForURL(/\/onboarding\/buyers\/sign-in/);
check('"Report this listing" asks a guest to sign in and come back', new URL(g.url()).searchParams.get('next') === `/productItem/${LAMP}`);
await guest.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
