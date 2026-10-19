// A seller goes shopping and comes back (D8: sellers can also buy). Chromium (phone) -> next start (:3000) ->
// NestJS -> local campusmart_dev, as chidi.store@ (local dev account) buying one of amaka.store@'s listings.
// Run: node seller-shop-walk.mjs <screenshots dir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT] = process.argv.slice(2);
const AMAKA_LISTING = '49ce6c55-4c06-4df9-a673-72328e0bf031'; // UrbanFlex cargo pants, another seller's
const results = [];
const check = (name, ok, extra = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
const page = await ctx.newPage();
await page.goto(`${BASE}/onboarding/sellers/sign-in`);
await page.getByPlaceholder(/^(School email|Email)$/).fill('chidi.store@students.unilag.edu.ng');
await page.getByPlaceholder('Password').fill(process.env.WALK_PASSWORD ?? 'Campus2026');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(`${BASE}/sellers`, { timeout: 20000 });

await page.goto(`${BASE}/sellers/profile`);
const shop = page.getByRole('link', { name: /Shop on CampusMart/ });
await shop.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/seller-profile-shop-entry.png` });
check('The seller Profile page has "Shop on CampusMart"', await shop.isVisible());
await shop.click();
await page.waitForURL(`${BASE}/`);
await page.waitForLoadState('networkidle');
check('It opens the shop, with the school\'s listings', (await page.getByRole('button', { name: /favourites/i }).count()) > 0);
await page.screenshot({ path: `${OUT}/seller-in-shop.png` });

await page.goto(`${BASE}/productItem/${AMAKA_LISTING}`);
await page.waitForLoadState('networkidle');
await page.getByRole('radio', { name: 'M', exact: true }).click(); // the size
await page.getByRole('button', { name: 'Add to Cart' }).click();
await page.waitForTimeout(1000);
await page.goto(`${BASE}/cart`);
await page.waitForLoadState('networkidle');
check('The seller can put another store\'s item in the cart', await page.getByText('UrbanFlex cargo pants').first().isVisible());

await page.goto(`${BASE}/profile`);
const back = page.getByRole('link', { name: /Sellers page/ });
check('The shop\'s Profile tab leads back to the seller pages', await back.isVisible());
await back.click();
await page.waitForURL(`${BASE}/sellers`);
check('...and back on the seller dashboard', new URL(page.url()).pathname === '/sellers');

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
