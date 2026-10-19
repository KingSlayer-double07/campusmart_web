// Can every admin link be reached? Chromium -> next start (:3000) -> NestJS -> local campusmart_dev.
// Laptop (1366x768): the sidebar's links and Sign out. Phone (390x844): the bottom bar's links, and the current
// page's link showing without scrolling. Admin: admin@campusmart.test (local dev), code read from the API log.
// Run: node admin-nav-check.mjs <screenshots dir> <api log file> <before|after>
import { readFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, API_LOG, LABEL] = process.argv.slice(2);
const results = [];
const check = (name, ok, extra = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const inView = async (page, locator) => {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 0.5 && box.y + box.height <= height + 0.5;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
const page = await ctx.newPage();
await page.goto(`${BASE}/onboarding/buyers/sign-in`);
await page.getByPlaceholder(/^(School email|Email)$/).fill('admin@campusmart.test');
await page.getByPlaceholder('Password').fill(process.env.ADMIN_PASSWORD ?? 'LocalAdmin123');
await page.getByRole('button', { name: /sign in/i }).click();
await page.getByPlaceholder('6-digit code').waitFor();
const blocks = readFileSync(API_LOG, 'utf8').split('[dev mail] to=admin@campusmart.test template=admin-sign-in');
await page.getByPlaceholder('6-digit code').fill(blocks.at(-1).match(/code is (\d{6})/)[1]);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(`${BASE}/admin`, { timeout: 20000 });
await page.waitForLoadState('networkidle');

// ── Laptop sidebar ──
const sidebar = page.locator('aside nav');
const links = sidebar.locator('a');
const count = await links.count();
let reachable = 0;
for (let i = 0; i < count; i++) {
  await links.nth(i).scrollIntoViewIfNeeded();
  if (await inView(page, links.nth(i))) reachable++;
}
check(`Laptop: every sidebar link can be scrolled to (${count} links)`, reachable === count, `${reachable} reachable`);
check('Laptop: Sign out is on screen', await inView(page, page.locator('aside').getByRole('button', { name: 'Sign out' })));
await sidebar.evaluate((el) => (el.scrollTop = 0));
await page.screenshot({ path: `${OUT}/${LABEL}-laptop-sidebar.png` });

// ── Phone bottom bar ──
await page.setViewportSize({ width: 390, height: 844 });
for (const path of ['/admin', '/admin/settings']) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  const bar = page.locator('nav[aria-label="Admin"]').last();
  const current = bar.locator('a[aria-current="page"]');
  check(`Phone ${path}: its own link shows in the bottom bar without scrolling`, await inView(page, current));
  if (path === '/admin/settings') await page.screenshot({ path: `${OUT}/${LABEL}-phone-bottom-bar.png` });
}
const barLinks = page.locator('nav[aria-label="Admin"]').last().getByRole('link');
const n = await barLinks.count();
let onScreen = 0;
for (let i = 0; i < n; i++) {
  await barLinks.nth(i).scrollIntoViewIfNeeded();
  if (await inView(page, barLinks.nth(i))) onScreen++;
}
check(`Phone: every bottom-bar link can be scrolled to (${n} links)`, onScreen === n, `${onScreen} reachable`);
check('Phone: the page itself never scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
