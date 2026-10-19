// Phase 10 browser walk: Chromium -> next start (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. Accounts (local dev only): admin@campusmart.test, buyer tobi.buyer@, and a new
// buyer this walk signs up with a non-school email and finally deletes. Email codes are read from the API's
// console, where dev mail prints until MAIL_* is set up. Google and the support contacts are not configured.
// Run: node phase10-walk.mjs <shots dir> <repo>/public <api log file>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, PUBLIC, API_LOG] = process.argv.slice(2);
const DB = 'postgresql://postgres:postgres@localhost:5432/campusmart_dev';
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const ADMIN = 'admin@campusmart.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LocalAdmin123';
const BUYER = 'tobi.buyer@students.unilag.edu.ng';
const RUN = Date.now();
const NEW_BUYER = `walk.buyer.${RUN}@gmail.com`; // any email (T1)
const SCHOOL_EMAIL = `walk.seller.${RUN}@students.unilag.edu.ng`; // to become a seller (G2)
const LAMP = 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets, University of Lagos
const REPORT = `Walk ${RUN}: the orders page spinner never stops`;

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();

// The newest code the API printed for an email and template
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
const desktop = { viewport: { width: 1366, height: 900 } };
async function context(options) {
  const ctx = await browser.newContext({ timezoneId: 'Africa/Lagos', ...options });
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  return ctx;
}
async function fillSignIn(page, email, password) {
  await page.goto(`${BASE}/onboarding/buyers/sign-in`);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder(/^(School email|Email)$/).fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}
const api = (page, path, method = 'GET', body) =>
  page.evaluate(
    async ({ path, method, body }) => {
      const res = await fetch(`/api${path}`, {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { path, method, body },
  );
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// Next's route announcer also has role="alert", so read the page's own message
const formAlert = (page) => page.locator('main').getByRole('alert').first();

// ── Setup on the dev database: two unread notifications for Tobi, and a username to clash with ──
const tobiId = sql(`select id from "User" where email = '${BUYER}'`);
sql(`update "User" set username = 'tobi_b', "notificationPrefs" = null where id = '${tobiId}'`);
sql(`update "Notification" set "readAt" = now() where "userId" = '${tobiId}' and "readAt" is null`);
sql(`insert into "Notification" (id, "userId", type, title, body, data) values
     (gen_random_uuid(), '${tobiId}', 'ORDER_PAID', 'Payment received', 'Walk ${RUN}: order CM-WALK10 is paid', '{"link":"/orders"}'),
     (gen_random_uuid(), '${tobiId}', 'READY_FOR_PICKUP', 'Ready for pickup', 'Walk ${RUN}: collect it from the seller', '{"link":"/orders"}')`);

// ── T5: the sign-up page shows the draft Terms ──
const buyerCtx = await context(phone);
const buyer = await buyerCtx.newPage();
await buyer.goto(`${BASE}/onboarding/buyers/sign-up`);
await buyer.waitForLoadState('networkidle');
await buyer.getByRole('button', { name: 'Terms of Service' }).click();
await buyer.getByRole('heading', { name: '7. Payment hold, refunds and disputes' }).waitFor();
check('Sign-up shows the Terms, marked as a draft (T5)', await buyer.getByText('Draft, not yet in effect').first().isVisible());
await shot(buyer, 'phone-signup-terms-draft', false);
await buyer.getByRole('button', { name: 'Decline' }).click();
check('Google isn\'t offered while it isn\'t configured (T1)', (await buyer.getByRole('button', { name: /google/i }).count()) === 0);
const providers = await api(buyer, '/auth/providers');
check('GET /auth/providers says Google is off', providers.status === 200 && providers.body?.data?.google === false, JSON.stringify(providers.body?.data));

// ── T1: a buyer signs up with a non-school email, confirms it, then picks their school ──
await buyer.getByPlaceholder('Email').fill(NEW_BUYER);
await buyer.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
await buyer.getByPlaceholder('Confirm password').fill(PASSWORD);
await buyer.getByRole('button', { name: 'Create an Account' }).click();
await buyer.waitForURL(/\/onboarding\/verify-email/, { timeout: 20000 });
check('A gmail.com address can sign up as a buyer (T1)', true);
await buyer.waitForTimeout(500);
const verifyCode = latestCode(NEW_BUYER, 'verify-email');
check('The email code printed to the API console', /^\d{6}$/.test(verifyCode ?? ''));
await buyer.getByLabel('Verification code').fill(verifyCode);
await buyer.getByRole('button', { name: 'Verify email' }).click();
await buyer.waitForURL(/\/onboarding\/school/, { timeout: 20000 });
check('After confirming the email, a buyer without a school is asked to pick one', await buyer.getByRole('heading', { name: 'Which school are you at?' }).isVisible());
await buyer.getByRole('radio', { name: 'University of Lagos' }).waitFor();
check('Only schools that are switched on are listed', (await buyer.getByRole('radio', { name: 'Lagos State University' }).count()) === 0);
await buyer.getByRole('button', { name: 'Continue' }).click();
await formAlert(buyer).waitFor();
check('Continuing without a school asks for one', (await formAlert(buyer).innerText()).includes('Choose your school'));
check('An unlisted school can join the waitlist (G4)', await buyer.getByRole('link', { name: 'Join the waitlist' }).isVisible());
await buyer.getByRole('radio', { name: 'University of Lagos' }).click();
await shot(buyer, 'phone-onboarding-school');
check('The school picker fits a phone screen', await noSideScroll(buyer));
await buyer.getByRole('button', { name: 'Continue' }).click();
await buyer.waitForURL(`${BASE}/`, { timeout: 20000 });
check(
  'The buyer lands on the home page with University of Lagos as their school',
  sql(`select i.name from "User" u join "Institution" i on i.id = u."institutionId" where u.email = '${NEW_BUYER}'`) === 'University of Lagos',
);

// ── G1: changing school empties the cart ──
const put = await api(buyer, '/cart/items', 'PUT', { listingId: LAMP, quantity: 1 });
check('The new buyer can fill their cart at their school', put.status === 200, `status ${put.status}`);
await buyer.goto(`${BASE}/profile/school`);
await buyer.getByRole('radio', { name: 'University of Ibadan' }).click();
await buyer.getByText('Your cart will be emptied').waitFor();
check('Choosing another school warns that the cart will be emptied (G1)', true);
await shot(buyer, 'phone-change-school-warning');
await buyer.getByRole('button', { name: 'Change school' }).click();
await buyer.waitForURL(`${BASE}/`, { timeout: 20000 });
const newBuyerId = sql(`select id from "User" where email = '${NEW_BUYER}'`);
check(
  'The school changed and the cart is empty',
  sql(`select i.name from "User" u join "Institution" i on i.id = u."institutionId" where u.id = '${newBuyerId}'`) === 'University of Ibadan' &&
    sql(`select count(*) from "CartItem" where "userId" = '${newBuyerId}'`) === '0',
);

// ── Profile editing: username, names and phone; a taken username is refused ──
await buyer.goto(`${BASE}/profile/edit`);
await buyer.getByPlaceholder('First name').fill('Walk');
await buyer.getByPlaceholder('Last name').fill('Buyer');
await buyer.getByPlaceholder('Username').fill('tobi_b');
await buyer.getByRole('button', { name: 'Save profile' }).click();
await buyer.getByText(/taken/i).first().waitFor();
check('A username someone else has is refused (409 USERNAME_TAKEN)', true);
await buyer.getByPlaceholder('Username').fill(`walk_${String(RUN).slice(-6)}`);
await buyer.getByPlaceholder('Phone').fill('08031234567');
await buyer.getByRole('button', { name: 'Save profile' }).click();
await buyer.getByText('Profile saved').waitFor();
await shot(buyer, 'phone-edit-profile');
check(
  'The profile saves the username, names and phone',
  sql(`select username || '|' || "firstName" || '|' || coalesce(phone, '') from "User" where id = '${newBuyerId}'`) ===
    `walk_${String(RUN).slice(-6)}|Walk|08031234567`, // phones are kept as typed, as at checkout
  sql(`select username || '|' || "firstName" || '|' || coalesce(phone, '') from "User" where id = '${newBuyerId}'`),
);

// ── G2: a buyer becomes a seller by confirming a school email ──
await buyer.goto(`${BASE}/profile/sell`);
await buyer.getByPlaceholder('School email').fill(`walk.${RUN}@gmail.com`);
await buyer.getByRole('button', { name: 'Send code' }).click();
await formAlert(buyer).waitFor();
check('A school email must belong to a listed school', /school|waitlist|support/i.test(await formAlert(buyer).innerText()), await formAlert(buyer).innerText());
await buyer.getByPlaceholder('School email').fill(SCHOOL_EMAIL);
await buyer.getByRole('button', { name: 'Send code' }).click();
await buyer.getByPlaceholder('6-digit code').waitFor();
await buyer.waitForTimeout(500);
const schoolCode = latestCode(SCHOOL_EMAIL, 'school-email');
check('The code goes to the school email', /^\d{6}$/.test(schoolCode ?? ''));
await buyer.getByPlaceholder('6-digit code').fill(schoolCode);
await shot(buyer, 'phone-become-seller-code');
await buyer.getByRole('button', { name: 'Confirm and open my store' }).click();
await buyer.waitForURL(/\/sellers/, { timeout: 20000 });
check(
  'The buyer is now a seller at the school email\'s school, still signing in with their own email',
  sql(`select u.role || '|' || u."schoolEmail" || '|' || i.name || '|' || u.email from "User" u join "Institution" i on i.id = u."institutionId" where u.id = '${newBuyerId}'`) ===
    `SELLER|${SCHOOL_EMAIL}|University of Lagos|${NEW_BUYER}`,
);

await buyer.goto(`${BASE}/sellers/profile`);
await buyer.getByRole('link', { name: /Personal details/ }).click();
await buyer.waitForURL(/\/profile\/edit/);
check('A seller edits their name, username and phone from their own profile', (await buyer.getByPlaceholder('Username').inputValue()) === `walk_${String(RUN).slice(-6)}`);

// ── T6: deleting the account (password checked), then the account is gone ──
await buyer.goto(`${BASE}/profile/account_security`);
check('Account security offers "Delete account" and no phone verification (T3)', (await buyer.getByText('Delete account').count()) > 0 && (await buyer.getByText(/phone verification/i).count()) === 0);
await shot(buyer, 'phone-account-security');
const phoneVerification = await buyer.goto(`${BASE}/profile/account_security/phone_verification`);
check('The phone verification page is gone (T3)', phoneVerification.status() === 404);
await buyer.goto(`${BASE}/profile/account_security/delete`);
await buyer.getByPlaceholder('Password, or DELETE for a Google account').fill('Wrong2026x');
await buyer.getByRole('button', { name: 'Delete my account' }).click();
await formAlert(buyer).waitFor();
check('A wrong password doesn\'t delete the account', /incorrect/i.test(await formAlert(buyer).innerText()));
await shot(buyer, 'phone-delete-account');
await buyer.getByPlaceholder('Password, or DELETE for a Google account').fill(PASSWORD);
await buyer.getByRole('button', { name: 'Delete my account' }).click();
await buyer.waitForURL(/\/onboarding\/role-select/, { timeout: 20000 });
check(
  'The account is anonymised and signed out (T6)',
  sql(`select email || '|' || coalesce("firstName", '-') || '|' || coalesce(phone, '-') || '|' || coalesce("schoolEmail", '-') || '|' || "isActive" from "User" where id = '${newBuyerId}'`) ===
    `deleted+${newBuyerId}@deleted.campusmart.invalid|-|-|-|false`,
);
await fillSignIn(buyer, NEW_BUYER, PASSWORD);
await formAlert(buyer).waitFor();
check('The deleted account can\'t sign in again', /incorrect|invalid/i.test(await formAlert(buyer).innerText()), await formAlert(buyer).innerText());
await buyerCtx.close();

// ── Notifications: the bell, the list, mark read, and the email switch (T7) ──
const tobiCtx = await context(phone);
const tobi = await tobiCtx.newPage();
await fillSignIn(tobi, BUYER, PASSWORD);
await tobi.waitForURL(`${BASE}/`, { timeout: 20000 });
const bell = tobi.getByRole('link', { name: /^Notifications/ });
await bell.waitFor();
await tobi.waitForFunction(() => /unread/.test(document.querySelector('a[aria-label^="Notifications"]')?.getAttribute('aria-label') ?? ''), null, { timeout: 15000 });
check('The home bell shows the unread count', /Notifications, 2 unread/.test((await bell.getAttribute('aria-label')) ?? ''), await bell.getAttribute('aria-label'));
await shot(tobi, 'phone-home-bell', false);
await bell.click();
await tobi.waitForURL(/\/profile\/notifications/);
await tobi.getByText(`Walk ${RUN}: order CM-WALK10 is paid`).waitFor();
check('The notifications page lists real notifications', await tobi.getByText('2 unread').isVisible());
const emailSwitch = tobi.getByRole('switch', { name: 'Email me order and payment updates' });
check('Order and payment emails are on by default (T7)', (await emailSwitch.getAttribute('aria-checked')) === 'true');
await shot(tobi, 'phone-notifications');
await emailSwitch.click();
await tobi.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'false');
check('Turning order emails off is saved', sql(`select "notificationPrefs"->>'orderEmails' from "User" where id = '${tobiId}'`) === 'false');
await emailSwitch.click();
await tobi.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true');
await tobi.getByRole('button', { name: 'Mark all as read' }).click();
await tobi.getByText('All caught up').waitFor();
check('"Mark all as read" clears the unread count', sql(`select count(*) from "Notification" where "userId" = '${tobiId}' and "readAt" is null`) === '0');
check('The notifications page fits a phone screen', await noSideScroll(tobi));

// ── T4: support contacts say "coming soon"; a report reaches the admins ──
await tobi.goto(`${BASE}/profile/help/call_us`);
await tobi.getByText(/coming soon/i).first().waitFor();
check('Call us says "coming soon" while SUPPORT_PHONE and SUPPORT_WHATSAPP are unset (T4)', (await tobi.getByText(/coming soon/i).count()) >= 2);
await shot(tobi, 'phone-call-us-coming-soon');
await tobi.goto(`${BASE}/profile/help/email_support`);
await tobi.getByText(/coming soon/i).first().waitFor();
check('Email support says "coming soon" while SUPPORT_EMAIL is unset', true);
await tobi.goto(`${BASE}/profile/help/report`);
await tobi.getByRole('button', { name: /Send report/ }).click();
await formAlert(tobi).waitFor();
check('A report needs a topic', /Choose what it's about/.test(await formAlert(tobi).innerText()));
await tobi.getByLabel('Something isn’t working').check();
await tobi.getByLabel('What happened?').fill(REPORT);
await shot(tobi, 'phone-report-problem');
await tobi.getByRole('button', { name: /Send report/ }).click();
await tobi.getByText('Report sent').waitFor();
check('The report is saved for the admins', sql(`select type from "SupportReport" where "userId" = '${tobiId}' and message like '${REPORT}%'`) === 'BUG');
await tobiCtx.close();

// ── The admins see the report (admin sign-in with the M7 code) ──
const adminCtx = await context(desktop);
const admin = await adminCtx.newPage();
// Admin codes are limited to one a minute, so a walk run straight after another waits for a new one
const codesSent = () => readFileSync(API_LOG, 'utf8').split(`[dev mail] to=${ADMIN} template=admin-sign-in`).length;
for (let attempt = 0; ; attempt++) {
  const before = codesSent();
  await fillSignIn(admin, ADMIN, ADMIN_PASSWORD);
  await admin.getByPlaceholder('6-digit code').waitFor();
  const deadline = Date.now() + 5000;
  while (codesSent() === before && Date.now() < deadline) await admin.waitForTimeout(250);
  if (codesSent() > before || attempt === 1) break;
  await admin.waitForTimeout(65_000);
}
await admin.getByPlaceholder('6-digit code').fill(latestCode(ADMIN, 'admin-sign-in'));
await admin.getByRole('button', { name: /sign in/i }).click();
await admin.waitForURL(`${BASE}/admin`, { timeout: 20000 });
await admin.goto(`${BASE}/admin/reports`);
await admin.getByText(REPORT).first().waitFor();
check('The report shows in /admin/reports', true);
await shot(admin, 'desktop-admin-support-report', false);
check(
  'Admins were alerted about the report',
  sql(`select count(*) from "Notification" n join "User" u on u.id = n."userId" where u.email = '${ADMIN}' and n.type = 'SUPPORT_REPORT' and n."createdAt" > now() - interval '10 minutes'`) !== '0',
);
await adminCtx.close();

// ── 10.4: health check, one offline page, the proxy, Terms & Privacy ──
const guestCtx = await context(phone);
const guest = await guestCtx.newPage();
const health = await guest.request.get(`${BASE}/api/health`);
const healthBody = await health.json();
check('GET /api/health answers through the frontend with the database up', health.status() === 200 && healthBody.data?.checks?.database === 'up', JSON.stringify(healthBody.data));
check('The health check isn\'t cached', /no-store/.test(health.headers()['cache-control'] ?? ''));
check('/offline is gone', (await guest.request.get(`${BASE}/offline`)).status() === 404);
await guest.goto(`${BASE}/~offline`);
check('/~offline renders without the broken emoji', (await guest.getByRole('heading', { name: /you're offline/i }).isVisible()) && !/ð/.test(await guest.locator('main').innerText()));
await shot(guest, 'phone-offline-page', false);
await guest.goto(`${BASE}/orders?tab=open`);
await guest.waitForURL(/\/onboarding\/buyers\/sign-in/);
check('proxy.ts still sends a signed-out visitor to sign-in, keeping where they were going', new URL(guest.url()).searchParams.get('next') === '/orders?tab=open');
await guestCtx.close();

const helpCtx = await context(phone);
const help = await helpCtx.newPage();
await fillSignIn(help, BUYER, PASSWORD);
await help.waitForURL(`${BASE}/`, { timeout: 20000 });
await help.goto(`${BASE}/profile/help/terms`);
await help.getByRole('heading', { name: '6. Delivery and pickup' }).waitFor();
check('Help → Terms & Privacy shows the draft Terms', await help.getByText('Draft, not yet in effect').isVisible());
await shot(help, 'phone-help-terms');
await help.getByRole('tab', { name: 'Privacy Policy' }).click();
await help.getByRole('heading', { name: '8. Your rights' }).waitFor();
check('…and the Privacy Policy under the Nigeria Data Protection Act', await help.getByText(/Nigeria Data Protection Commission/).first().isVisible());
await shot(help, 'phone-help-privacy', false);
check('The Terms page fits a phone screen', await noSideScroll(help));
await helpCtx.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
