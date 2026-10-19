// Phase 1 browser smoke run: Chromium -> Next.js (:3000, rewrites /api) -> NestJS (:4000) -> local Postgres.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';
const API_LOG = process.argv[2];
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};

// The dev mail log: "[dev mail] to=<email> template=verify-email ...\nYour CampusMart verification code is 123456."
function lastCode(email) {
  const log = readFileSync(API_LOG, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const blocks = log.split('[dev mail] ').filter((b) => b.startsWith(`to=${email} `));
  const match = blocks.at(-1)?.match(/code is (\d{6})/);
  if (!match) throw new Error(`no code for ${email}`);
  return match[1];
}

async function signUp(page, email, path = '/onboarding/buyers/sign-up') {
  await page.goto(BASE + path);
  await page.getByPlaceholder('School email').fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill('Campus2026');
  await page.getByPlaceholder('Confirm password').fill('Campus2026');
  await page.getByRole('button', { name: /create an account/i }).click();
}

async function verify(page, code) {
  await page.locator('#code').fill(code);
  await page.getByRole('button', { name: /verify email/i }).click();
}

async function signIn(page, email) {
  await page.goto(`${BASE}/onboarding/buyers/sign-in`);
  await page.getByPlaceholder('School email').fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill('Campus2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(`${BASE}/`);
}

// Let any earlier run's per-IP rate-limit window expire first
await new Promise((r) => setTimeout(r, Number(process.env.PRE_WAIT_MS ?? 0)));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const stamp = Date.now();

try {
  // 1. Non-school domain -> /waitlist
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page, `ada${stamp}@gmail.com`);
    await page.waitForURL(`${BASE}/waitlist`, { timeout: 10_000 }).catch(() => undefined);
    check('Sign-up with a non-school domain lands on /waitlist', page.url() === `${BASE}/waitlist`, page.url());
    await ctx.close();
  }

  // 2. School email -> verify-email; 5 wrong codes lock that code
  if (!process.env.SKIP_LOCK) {
    const email = `lock${stamp}@students.unilag.edu.ng`;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page, email);
    await page.waitForURL(`${BASE}/onboarding/verify-email`, { timeout: 10_000 }).catch(() => undefined);
    check('Sign-up with a school email reaches /onboarding/verify-email', page.url().endsWith('/onboarding/verify-email'), page.url());

    const cookies = await ctx.cookies();
    const access = cookies.find((c) => c.name === 'access_token');
    const refresh = cookies.find((c) => c.name === 'refresh_token');
    check(
      'Cookies: access_token path / and refresh_token path /api/auth, both httpOnly + Lax, host-only',
      access?.path === '/' && refresh?.path === '/api/auth' && access.httpOnly && refresh.httpOnly &&
        access.sameSite === 'Lax' && refresh.sameSite === 'Lax' && access.domain === 'localhost',
      JSON.stringify(cookies.map(({ name, path, httpOnly, sameSite, domain }) => ({ name, path, httpOnly, sameSite, domain }))),
    );

    const code = lastCode(email);
    const wrong = code === '000000' ? '111111' : '000000';
    const messages = [];
    for (let i = 0; i < 5; i++) {
      await verify(page, wrong);
      const alert = page.locator('p[role=alert]');
      await alert.waitFor();
      await page.waitForFunction(
        (prev) => document.querySelector('p[role=alert]')?.textContent !== prev,
        messages.at(-1) ?? '',
      ).catch(() => undefined);
      messages.push(await alert.textContent());
    }
    check('Wrong codes 1-4 report the tries left', /4 tries left/.test(messages[0]) && /1 try left/.test(messages[3]), messages.slice(0, 4).join(' | '));
    check('The 5th wrong code locks the code', /Too many wrong attempts/.test(messages[4]), messages[4]);

    console.log('      waiting 61 s for the per-IP 5/min limit on code routes to pass...');
    await page.waitForTimeout(61_000);
    await verify(page, code);
    await page.waitForTimeout(1_000);
    const afterLock = await page.locator('p[role=alert]').textContent();
    check('After the lock even the right code is refused', /Too many wrong attempts/.test(afterLock) && page.url().endsWith('/verify-email'), afterLock);
    await ctx.close();
  }

  // 3. School email, right code -> verified -> buyer lands on /
  const email = `buyer${stamp}@unilag.edu.ng`;
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page, email);
    await page.waitForURL(`${BASE}/onboarding/verify-email`);
    await verify(page, lastCode(email));
    await page.waitForURL(`${BASE}/`, { timeout: 10_000 }).catch(() => undefined);
    check('The right code verifies and a buyer lands on /', page.url() === `${BASE}/`, page.url());

    // 4. Access cookie gone (the browser drops it after 15 minutes): the next visit refreshes silently
    await ctx.clearCookies({ name: 'access_token' });
    await page.goto(`${BASE}/profile`);
    await page.waitForURL(`${BASE}/profile`, { timeout: 10_000 }).catch(() => undefined);
    const hasAccess = (await ctx.cookies()).some((c) => c.name === 'access_token');
    check('With the access cookie expired, /profile restores the session silently', page.url() === `${BASE}/profile` && hasAccess, page.url());
    await ctx.close();
  }

  // 5. Phone A logs out, phone B stays; "Sign out other devices" signs B out
  {
    const ctxA = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari/604.1' });
    const ctxB = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129.0 Mobile Safari/537.36' });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    await signIn(a, email);
    await signIn(b, email);

    await a.goto(`${BASE}/profile`);
    // The PWA install prompt overlays the bottom of the page; click the item itself
    await a.getByText('Logout', { exact: true }).evaluate((el) => (el.closest('button') ?? el).click());
    await a.waitForURL(`${BASE}/onboarding/role-select`, { timeout: 10_000 }).catch(() => undefined);
    const aKeys = await a.evaluate(() => Object.keys(localStorage));
    check('Logout on phone A clears its cookies and local stores', !(await ctxA.cookies()).some((c) => c.name.endsWith('_token')) &&
      !aKeys.includes('campus-mart-cart') && !aKeys.includes('campus-mart-favourites'), `localStorage: ${aKeys.join(',')}`);

    await b.goto(`${BASE}/profile/account_security/active_sessions`);
    await b.getByText('This device').waitFor({ timeout: 10_000 });
    check('Phone B is still signed in after phone A logs out', b.url().endsWith('/active_sessions'));

    // A signs in again and signs every other device out
    await signIn(a, email);
    await a.goto(`${BASE}/profile/account_security/active_sessions`);
    await a.getByText('This device').waitFor();
    const before = await a.getByRole('button', { name: 'Revoke' }).count();
    // Other live sessions: the sign-up browser from step 3 and phone B (phone A's first session was logged out)
    check('Active Sessions lists the other devices with Revoke buttons', before === 2, `revoke buttons: ${before}`);
    await a.getByRole('button', { name: /sign out all other devices/i }).evaluate((el) => el.click());
    await a.getByText("You're not signed in anywhere else.").waitFor({ timeout: 10_000 });

    await b.reload();
    await b.waitForURL(/\/onboarding\/buyers\/sign-in/, { timeout: 10_000 }).catch(() => undefined);
    check('"Sign out other devices" signs phone B out', /\/onboarding\/buyers\/sign-in/.test(b.url()), b.url());
    await ctxA.close();
    await ctxB.close();
  }
} catch (error) {
  check('smoke run completed without errors', false, String(error));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
