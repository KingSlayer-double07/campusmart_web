// Reproduces "sent to sign-in although the session is live": Chromium -> next start (:3000) -> NestJS (:4000)
// -> local campusmart_dev. Signs in as tobi.buyer@ (local dev account), then makes the access token unusable,
// as 15 minutes after the last refresh (D6), and opens a protected page:
//   drop:  the browser has deleted the access cookie (before the fix it lasted 15 minutes; still the case for a
//          cookie set before the fix)
//   stale: the cookie is there but its token has expired (after the fix it lasts as long as the session)
// REFRESH_DELAY_MS holds each POST /api/auth/refresh before it leaves the browser, as a slower round trip
// to the API would (staging goes phone -> Vercel -> Render -> Neon); other requests go straight through.
// Run: [REFRESH_DELAY_MS=400] node expired-access-repro.mjs
import { execFileSync } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const DB = 'postgresql://postgres:postgres@localhost:5432/campusmart_dev';
const EMAIL = 'tobi.buyer@students.unilag.edu.ng';
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev account only
const sql = (q) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
const DELAY = Number(process.env.REFRESH_DELAY_MS ?? 0);
if (DELAY) {
  await ctx.route('**/api/auth/refresh', async (route) => {
    await new Promise((r) => setTimeout(r, DELAY));
    await route.continue();
  });
}
const page = await ctx.newPage();
const log = [];
const t0 = Date.now();
page.on('response', (res) => {
  const url = new URL(res.url());
  if (url.pathname.startsWith('/api/auth') || res.status() === 307 || res.status() === 308) {
    log.push(`${String(Date.now() - t0).padStart(6)} ms  ${res.request().method()} ${url.pathname}${url.search} -> ${res.status()}`);
  }
});
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) log.push(`${String(Date.now() - t0).padStart(6)} ms  page: ${new URL(f.url()).pathname}${new URL(f.url()).search}`);
});

async function scenario(name, expire, act) {
  // Signed in, on the home page
  await page.goto(`${BASE}/onboarding/buyers/sign-in`);
  await page.waitForLoadState('networkidle');
  if (new URL(page.url()).pathname.startsWith('/onboarding')) {
    await page.getByPlaceholder(/^(School email|Email)$/).fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 20000 });
  }
  await page.goto(`${BASE}/`);
  await page.waitForLoadState('networkidle');
  const sid = (await ctx.cookies()).find((c) => c.name === 'refresh_token')?.value.split('.')[0];
  // 15 minutes later; the refresh cookie (30 days) is still there
  const access = (await ctx.cookies()).find((c) => c.name === 'access_token');
  await ctx.clearCookies({ name: 'access_token' });
  if (expire === 'stale') await ctx.addCookies([{ ...access, value: 'an.expired.token' }]);
  log.length = 0;
  console.log(`\n== ${name}${DELAY ? ` (refresh round trip +${DELAY} ms)` : ''}`);
  await act();
  await page.waitForTimeout(6000);
  for (const line of log) console.log(line);
  const revoked = sql(`select coalesce("revokedAt"::text, 'no') from "Session" where id = '${sid}'`);
  const cookies = (await ctx.cookies()).map((c) => c.name).filter((n) => n.endsWith('_token'));
  console.log(`Ends on: ${new URL(page.url()).pathname}  |  session revoked: ${revoked}  |  cookies left: ${cookies.join(', ') || 'none'}`);
}

await scenario('A. Access cookie gone; opening /orders by address (or reloading it)', 'drop', () => page.goto(`${BASE}/orders`));
await scenario('B. Access cookie gone; tapping Account in the bottom bar', 'drop', () => page.locator('nav a[href="/profile"]').first().click());
await scenario('C. Access token expired; opening /orders by address', 'stale', () => page.goto(`${BASE}/orders`));
await browser.close();
