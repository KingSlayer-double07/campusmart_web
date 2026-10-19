// Dark-mode readability scan: Chromium (phone size) -> next start (:3000) -> NestJS (:4000) -> local campusmart_dev.
// Opens every page as a guest, a buyer, a seller and an admin, in dark and in light mode, and lists text whose
// contrast with what's behind it is under 3:1 (WCAG's floor even for large text). The background is worked out
// from the element's ancestors (colours and gradients); text over photos is skipped.
// Accounts (local dev only): tobi.buyer@, chidi.store@, admin@campusmart.test (code read from the API log).
// Run: [ROLES=guest,buyer,seller,admin] UNILAG_ID=<id> node contrast-scan.mjs <out dir> <repo>/public <api log file>
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, PUBLIC, API_LOG] = process.argv.slice(2);
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LocalAdmin123';
const LISTING = '7a0c2b1e-5f3d-4e8a-9c61-0d2f4b7e9a10';
const CHIDI = 'cd0f66a1-6be3-4579-af72-c5d11e6cef82';
const UNILAG_GUEST = { id: process.env.UNILAG_ID, name: 'University of Lagos' };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
};

async function context(scheme, init) {
  const ctx = await browser.newContext({ ...phone, colorScheme: scheme, timezoneId: 'Africa/Lagos' });
  await ctx.addInitScript((init) => {
    localStorage.setItem('pwa_prompt_dismissed', 'true');
    for (const [k, v] of Object.entries(init ?? {})) localStorage.setItem(k, v);
  }, init);
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  return ctx;
}

const api = (page, path) =>
  page.evaluate(async (path) => {
    const res = await fetch(`/api${path}`, { credentials: 'include' });
    return res.json().catch(() => null);
  }, path);

async function signIn(page, email, password, code) {
  await page.goto(`${BASE}/onboarding/buyers/sign-in`);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder(/^(School email|Email)$/).fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  if (code) {
    await page.getByPlaceholder('6-digit code').waitFor();
    await page.getByPlaceholder('6-digit code').fill(code());
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith('/onboarding'), { timeout: 20000 });
}

function adminCode() {
  const blocks = readFileSync(API_LOG, 'utf8').split('[dev mail] to=admin@campusmart.test template=admin-sign-in');
  return blocks.at(-1).match(/code is (\d{6})/)[1];
}

// Runs in the page: every visible text element whose contrast is under 3:1
function scan() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const memo = new Map();
  const rgba = (c) => {
    if (!memo.has(c)) {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = 'rgba(0,0,0,0)';
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      memo.set(c, [d[0], d[1], d[2], d[3] / 255]);
    }
    return memo.get(c);
  };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const COLOR = /(?:oklch|oklab|rgba?|hsla?|lab|lch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi;
  // What's painted behind an element: its ancestors' colours and gradient stops, down to the first opaque one
  function backgrounds(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage.includes('url(')) return null; // a photo: can't tell
      const stops = cs.backgroundImage === 'none' ? [] : (cs.backgroundImage.match(COLOR) ?? []).map(rgba);
      const color = rgba(cs.backgroundColor);
      layers.push({ color, stops });
      if (color[3] > 0.99 || (stops.length && stops.every((s) => s[3] > 0.99))) break;
    }
    let candidates = [[255, 255, 255, 1]];
    for (const { color, stops } of layers.reverse()) {
      candidates = candidates.map((c) => over(color, c));
      if (stops.length) candidates = candidates.flatMap((c) => stops.map((s) => over(s, c)));
    }
    return candidates;
  }
  const seen = new Set();
  const found = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || seen.has(el) || !walker.currentNode.textContent.trim()) continue;
    seen.add(el);
    if (el.closest('script,style,noscript,[disabled],[aria-disabled="true"]')) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (rect.width <= 1 || rect.height <= 1 || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const bgs = backgrounds(el);
    if (!bgs) continue;
    const text = rgba(cs.color);
    const worst = Math.min(...bgs.map((bg) => ratio(over(text, bg), bg)));
    if (worst < 3) {
      found.push({
        text: walker.currentNode.textContent.trim().replace(/\s+/g, ' ').slice(0, 50),
        ratio: Math.round(worst * 100) / 100,
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') ?? '').slice(0, 90),
      });
    }
  }
  return found;
}

const PAGES = {
  guest: ['/', '/browse', '/categories', `/productItem/${LISTING}`, '/cart', '/onboarding/intro', '/onboarding/role-select',
    '/onboarding/guest-school', '/onboarding/buyers/sign-in', '/onboarding/buyers/sign-up', '/onboarding/sellers/sign-in',
    '/onboarding/sellers/sign-up', '/onboarding/forgot-password', '/waitlist', '/splash', '/~offline'],
  buyer: ['/', '/browse', '/categories', `/productItem/${LISTING}`, `/stores/${CHIDI}`, '/stores', '/cart', '/checkout',
    '/favourites', '/orders', 'ORDER', '/pickup-station', '/profile', '/profile/edit', '/profile/school', '/profile/sell',
    '/profile/notifications', '/profile/settings', '/profile/settings/language', '/profile/settings/clear_cache',
    '/profile/account_security', '/profile/account_security/active_sessions', '/profile/account_security/change_password',
    '/profile/account_security/delete', '/profile/account_security/email_verification', '/profile/help',
    '/profile/help/faq', '/profile/help/terms', '/profile/help/call_us', '/profile/help/email_support', '/profile/help/report'],
  seller: ['/sellers', '/sellers/products', 'PRODUCT', 'PRODUCT/edit', '/sellers/addProduct', '/sellers/orders', 'SELLER_ORDER',
    '/sellers/analytics', '/sellers/earnings', '/sellers/notifications', '/sellers/profile', '/profile'],
  admin: ['/admin', '/admin/listings', '/admin/verifications', '/admin/users', '/admin/reports', '/admin/reviews',
    '/admin/payouts', '/admin/deliveries', '/admin/disputes', '/admin/disputes/5a3ff1f4-d690-40f0-b6ea-caf44f5c30a7',
    '/admin/riders', '/admin/institutions', '/admin/places', '/admin/stations', '/admin/settings', '/admin/audit'],
};

// One sign-in per role: admin sign-in codes are limited to one a minute.
// Screenshotted in both themes, findings or not
const SHOTS = new Set(['buyer /profile', 'buyer /profile/account_security/delete', 'guest /waitlist', 'seller /sellers',
  'seller /sellers/notifications', 'seller /sellers/profile']);
const slug = (role, path) => `${role}-${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}`;

const results = {};
// ROLES=guest,buyer,seller skips the admin (whose sign-in codes are limited to 5 an hour)
const ROLES = process.env.ROLES?.split(',') ?? Object.keys(PAGES);
for (const role of ROLES) {
  const init = role === 'guest' ? { 'campus-mart-guest': JSON.stringify({ state: { school: UNILAG_GUEST, introSeen: true }, version: 0 }) } : {};
  const ctx = await context('dark', init);
  const page = await ctx.newPage();
  if (role === 'buyer') await signIn(page, 'tobi.buyer@students.unilag.edu.ng', PASSWORD);
  if (role === 'seller') await signIn(page, 'chidi.store@students.unilag.edu.ng', PASSWORD);
  if (role === 'admin') {
    await page.setViewportSize({ width: 1366, height: 900 });
    await signIn(page, 'admin@campusmart.test', ADMIN_PASSWORD, adminCode);
  }
  const ids = {};
  const first = (res) => res?.data?.[0]?.id ?? res?.data?.items?.[0]?.id;
  if (role === 'buyer') ids.ORDER = `/orders/${first(await api(page, '/orders'))}`;
  if (role === 'seller') {
    const pid = first(await api(page, '/sellers/me/listings'));
    ids.PRODUCT = `/sellers/products/${pid}`;
    ids['PRODUCT/edit'] = `/sellers/products/${pid}/edit`;
    ids.SELLER_ORDER = `/sellers/orders/${first(await api(page, '/sellers/me/orders'))}`;
  }
  // The theme follows the phone's setting (defaultTheme "system"), emulated here
  for (const scheme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const entry of PAGES[role]) {
      const path = ids[entry] ?? entry;
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(400);
      const landed = new URL(page.url()).pathname;
      const found = await page.evaluate(scan);
      const key = `${role} ${path}${landed !== path ? ` -> ${landed}` : ''}`;
      (results[key] ??= {})[scheme] = found;
      if ((scheme === 'dark' && found.length) || SHOTS.has(`${role} ${path}`)) {
        await page.screenshot({ path: `${OUT}/${scheme}-${slug(role, path)}.png`, fullPage: true });
      }
    }
  }
  await ctx.close();
}
await browser.close();

const lines = [];
let darkOnly = 0;
for (const [key, { dark = [], light = [] }] of Object.entries(results)) {
  const lightTexts = new Set(light.map((f) => f.text));
  const onlyDark = dark.filter((f) => !lightTexts.has(f.text));
  const both = dark.filter((f) => lightTexts.has(f.text));
  const lightOnly = light.filter((f) => !dark.some((d) => d.text === f.text));
  if (!onlyDark.length && !both.length && !lightOnly.length) continue;
  lines.push(`\n## ${key}`);
  for (const f of onlyDark) lines.push(`  DARK ONLY  ${f.ratio}:1  "${f.text}"  <${f.tag} class="${f.cls}">`);
  for (const f of both) lines.push(`  BOTH       ${f.ratio}:1  "${f.text}"  <${f.tag} class="${f.cls}">`);
  for (const f of lightOnly) lines.push(`  LIGHT ONLY ${f.ratio}:1  "${f.text}"  <${f.tag} class="${f.cls}">`);
  darkOnly += onlyDark.length;
}
const pages = Object.keys(results).length;
const summary = `Scanned ${pages} page visits in dark and light mode. Text under 3:1 only in dark mode: ${darkOnly}.`;
writeFileSync(`${OUT}/contrast-scan-output.txt`, [summary, ...lines].join('\n') + '\n');
console.log(summary);
