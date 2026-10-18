// Phase 9 slice C browser walk: Chromium -> next start (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. Accounts (local dev only): admin@campusmart.test, seller chidi.store@, buyer
// tobi.buyer@, and a throwaway buyer this walk creates to suspend. The admin's sign-in code (M7) is read
// from the API's console, where dev mail prints until MAIL_* is set up.
// Run: node phase9-moderation-walk.mjs <shots dir> <repo>/public <api log file> <repo>/backend
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, PUBLIC, API_LOG, BACKEND] = process.argv.slice(2);
const DB = 'postgresql://postgres:postgres@localhost:5432/campusmart_dev';
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const ADMIN = 'admin@campusmart.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LocalAdmin123';
const BUYER = 'tobi.buyer@students.unilag.edu.ng';
const CHIDI = 'chidi.store@students.unilag.edu.ng';
const THROWAWAY = 'walk.suspended@students.unilag.edu.ng';
const PANTS = '49ce6c55-4c06-4df9-a673-72328e0bf031'; // Amaka Styles
const AMAKA_LAMP = 'e26670b3-4288-4bc0-8bc6-abfdd6da6390'; // Amaka Styles
const LAMP = 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets
const HELD_TITLE = 'Toy gun for display';
const DRAFT_TITLE = 'Study lamp';

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();

// The newest admin sign-in code the API printed for this email
function latestCode(email) {
  const log = readFileSync(API_LOG, 'utf8');
  const blocks = log.split(`[dev mail] to=${email} template=admin-sign-in`);
  const match = blocks.length > 1 ? blocks.at(-1).match(/code is (\d{6})/) : null;
  return match?.[1] ?? null;
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
  await page.getByPlaceholder('School email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}
async function signIn(page, email, password, landing) {
  await fillSignIn(page, email, password);
  await page.waitForURL(landing, { timeout: 20000 });
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

// ── Setup on the dev database: a fresh throwaway buyer, and last run's walk rows gone ──
const hash = execFileSync('node', ['-e', `require('bcrypt').hash(${JSON.stringify(PASSWORD)}, 12).then((h) => process.stdout.write(h))`], {
  cwd: BACKEND,
  encoding: 'utf8',
});
const unilag = sql(`select "institutionId" from "User" where email = '${BUYER}'`);
sql(`insert into "User" (id, email, password, role, "firstName", "lastName", "institutionId", "emailVerifiedAt", "updatedAt")
     values (gen_random_uuid(), '${THROWAWAY}', '${hash}', 'BUYER', 'Walk', 'Tester', '${unilag}', now(), now())
     on conflict (email) do update set role = 'BUYER', "isSuspended" = false, "suspendedAt" = null,
       "suspendedReason" = null, "suspendedById" = null, password = excluded.password`);
const throwawayId = sql(`select id from "User" where email = '${THROWAWAY}'`);
sql(`delete from "SellerProfile" where "userId" = '${throwawayId}'`);
sql(`update "Listing" set "isDeleted" = true where title in ('${HELD_TITLE}', '${DRAFT_TITLE}') and "isDeleted" = false`);
const tobiId = sql(`select id from "User" where email = '${BUYER}'`);
const chidiId = sql(`select id from "User" where email = '${CHIDI}'`);
sql(`delete from "SupportReport" where "userId" = '${tobiId}' and "listingId" in ('${AMAKA_LAMP}', '${PANTS}')`);
sql(`update "Listing" set status = 'ACTIVE', "isFlagged" = false, "heldAt" = null, "heldWords" = '{}', "moderationReason" = null
     where id in ('${AMAKA_LAMP}', '${PANTS}')`);
const lampImage = sql(`select url || '|' || "publicId" from "ListingImage" where "listingId" = '${LAMP}' order by position limit 1`).split('|');

// ── M4a and M4c: a seller publishes; a banned word holds the listing for review ──
const sellerCtx = await context(phone);
const seller = await sellerCtx.newPage();
await signIn(seller, CHIDI, PASSWORD, /\/sellers/);
const listingBody = (title, description, status) => ({
  title,
  description,
  priceKobo: 250_000,
  stock: 2,
  category: 'OTHERS',
  condition: 'NEW',
  images: [{ url: lampImage[0], publicId: lampImage[1] }],
  status,
  ...(status === 'ACTIVE' && { confirmNotProhibited: true }),
});
const unconfirmed = await api(seller, '/listings', 'POST', { ...listingBody(HELD_TITLE, 'Plastic, for a costume', 'ACTIVE'), confirmNotProhibited: undefined });
check('Publishing without "not on the prohibited list" is refused (M4a)', unconfirmed.status === 400 && unconfirmed.body?.code === 'CONFIRM_NOT_PROHIBITED', unconfirmed.body?.code);
const held = await api(seller, '/listings', 'POST', listingBody(HELD_TITLE, 'Plastic, for a costume', 'ACTIVE'));
const heldId = held.body?.data?.id;
check('A listing using a banned word waits for review instead of going live (M4c)', held.status === 201 && held.body.data.status === 'FLAGGED' && held.body.data.heldForReview, `status ${held.body?.data?.status}`);
check(
  'Admins are told about the held listing',
  sql(`select count(*) from "Notification" n join "User" u on u.id = n."userId" where u.email = '${ADMIN}' and n.type = 'LISTING_HELD' and n.body like '%${HELD_TITLE}%'`) !== '0',
);
await seller.goto(`${BASE}/sellers/products/${heldId}`);
await seller.getByText('Waiting for review').waitFor();
check('The seller sees why it waits ("Waiting for review")', true);
await shot(seller, 'phone-seller-held-for-review');

const draft = await api(seller, '/listings', 'POST', listingBody(DRAFT_TITLE, 'Warm light, USB powered', 'DRAFT'));
await seller.goto(`${BASE}/sellers/products`);
await seller.waitForLoadState('networkidle');
await seller.getByRole('button', { name: `Actions for ${DRAFT_TITLE}` }).first().click();
await seller.getByRole('menuitem', { name: 'Publish' }).click();
const publishDialog = seller.getByRole('dialog');
await publishDialog.getByRole('button', { name: 'Publish' }).click();
await publishDialog.getByRole('alert').waitFor();
check('Publishing a draft asks for the prohibited-items confirmation first', /prohibited list to publish/.test(await publishDialog.getByRole('alert').innerText()));
await publishDialog.getByRole('button', { name: /See the list/ }).click();
await shot(seller, 'phone-seller-publish-confirm', false);
await publishDialog.getByRole('checkbox').check();
await publishDialog.getByRole('button', { name: 'Publish' }).click();
await publishDialog.waitFor({ state: 'detached' });
check(
  'Once ticked, the draft goes live with the confirmation saved',
  sql(`select status || ' ' || ("prohibitedConfirmedAt" is not null) from "Listing" where id = '${draft.body.data.id}'`) === 'ACTIVE true',
);

// ── M7: an admin signs in with an emailed 6-digit code ──
const adminCtx = await context(desktop);
const admin = await adminCtx.newPage();
await fillSignIn(admin, ADMIN, ADMIN_PASSWORD);
await admin.getByPlaceholder('6-digit code').waitFor();
check('The admin\'s right password asks for the emailed code (M7)', await admin.getByText(/We emailed you a 6-digit code/).isVisible());
const code = latestCode(ADMIN);
check('The code printed to the API console (dev mail, until MAIL_* is set up)', /^\d{6}$/.test(code ?? ''));
await admin.getByPlaceholder('6-digit code').fill(code === '000000' ? '111111' : '000000');
await admin.getByRole('button', { name: /sign in/i }).click();
// Next's route announcer also has role="alert", so read the form's own message
await admin.locator('form').getByRole('alert').waitFor();
check('A wrong code is refused with its reason', /incorrect/i.test(await admin.locator('form').getByRole('alert').innerText()));
await admin.getByPlaceholder('6-digit code').fill(code);
await shot(admin, 'desktop-admin-sign-in-code', false);
await admin.getByRole('button', { name: /sign in/i }).click();
await admin.waitForURL(`${BASE}/admin`, { timeout: 20000 });
await admin.getByText('Waiting for you').waitFor();
await admin.waitForLoadState('networkidle');
const overview = await api(admin, '/admin/overview');
const reviewCard = await admin.getByRole('link', { name: /Listings to review/ }).innerText();
check('The overview shows the platform numbers and what\'s waiting', overview.status === 200 && reviewCard.includes(String(overview.body.data.listingsToReview)), `${overview.body?.data?.listingsToReview} to review`);
await shot(admin, 'desktop-admin-overview');

// ── M3, M4f: an admin takes the held listing down; no suspension, since buyers never saw it ──
await admin.goto(`${BASE}/admin/listings`);
await admin.waitForLoadState('networkidle');
check('The review queue shows the held listing and the word it used', await admin.getByText('Uses: gun').first().isVisible());
await shot(admin, 'desktop-admin-listings-queue');
const heldRow = admin.getByRole('row').filter({ hasText: HELD_TITLE });
await heldRow.getByRole('button', { name: 'Take down' }).click();
const rejectDialog = admin.getByRole('dialog');
await rejectDialog.getByLabel('Reason').selectOption('PROHIBITED_ITEM');
check('The dialog says the seller won\'t be suspended for a listing held before it went live (M4f)', await rejectDialog.getByText(/won't be suspended/).isVisible());
await rejectDialog.getByLabel(/Note for the seller/).fill("Toy weapons aren't allowed");
await shot(admin, 'desktop-admin-reject-dialog', false);
await rejectDialog.getByRole('button', { name: 'Take down' }).click();
await rejectDialog.waitFor({ state: 'detached' });
check(
  'Taken down with the reason the seller sees, and the seller isn\'t suspended',
  sql(`select status || '|' || "moderationReason" from "Listing" where id = '${heldId}'`) === "FLAGGED|Prohibited item: Toy weapons aren't allowed" &&
    sql(`select "isSuspended" from "User" where id = '${chidiId}'`) === 'f',
);
await seller.goto(`${BASE}/sellers/products/${heldId}`);
await seller.getByText(/Taken down: Prohibited item: Toy weapons aren't allowed/).waitFor();
check('The seller sees the reason and how to send it back for review', true);
await shot(seller, 'phone-seller-taken-down');

// ── M4b: a buyer reports a prohibited item; it's hidden at once, and an admin puts it back ──
const buyerCtx = await context(phone);
const buyer = await buyerCtx.newPage();
await signIn(buyer, BUYER, PASSWORD, `${BASE}/`);
await buyer.goto(`${BASE}/productItem/${AMAKA_LAMP}`);
await buyer.getByRole('button', { name: 'Report this listing' }).click();
const reportSheet = buyer.getByRole('dialog');
await reportSheet.getByLabel('Prohibited item').check();
await reportSheet.getByLabel(/Anything else/).fill('Looks like it has a blade inside');
await shot(buyer, 'phone-buyer-report-sheet', false);
await reportSheet.getByRole('button', { name: 'Send report' }).click();
await buyer.getByText(/hidden from buyers until an admin checks it/).waitFor();
check('A prohibited-item report hides the listing at once (M4b)', sql(`select status || ' ' || "isFlagged" from "Listing" where id = '${AMAKA_LAMP}'`) === 'FLAGGED true');
const again = await api(buyer, `/listings/${AMAKA_LAMP}/report`, 'POST', { reason: 'SCAM' });
check('Buyers can no longer open or report it', again.status === 404);
await admin.goto(`${BASE}/admin/listings`);
await admin.waitForLoadState('networkidle');
const reportedRow = admin.getByRole('row').filter({ hasText: 'Reported as a prohibited item' });
check('The admin queue shows the report', (await reportedRow.count()) === 1);
await reportedRow.getByRole('button', { name: 'Approve' }).click();
await admin.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
await admin.getByRole('dialog').waitFor({ state: 'detached' });
check(
  'Approving puts it back live and closes the report',
  sql(`select status || ' ' || "isFlagged" from "Listing" where id = '${AMAKA_LAMP}'`) === 'ACTIVE false' &&
    sql(`select status from "SupportReport" where "userId" = '${tobiId}' and "listingId" = '${AMAKA_LAMP}'`) === 'CLOSED',
);

// ── Reports: an admin closes one with what was done ──
const misleading = await api(buyer, `/listings/${PANTS}/report`, 'POST', { reason: 'MISLEADING', details: 'The photos show another colour' });
check('A buyer reports a listing as misleading', misleading.status === 201 && misleading.body.data.hidden === false);
await admin.goto(`${BASE}/admin/reports`);
await admin.waitForLoadState('networkidle');
const reportRow = admin.getByRole('row').filter({ hasText: 'The photos show another colour' });
check('The report is in the open list with who sent it', (await reportRow.innerText()).includes(BUYER));
await shot(admin, 'desktop-admin-reports');
await reportRow.getByRole('button', { name: 'Close' }).click();
const closeDialog = admin.getByRole('dialog');
await closeDialog.getByLabel('What was done').fill('Checked with the seller: the photos match the item');
await closeDialog.getByRole('button', { name: 'Close report' }).click();
await closeDialog.waitFor({ state: 'detached' });
check(
  'Closed with the note',
  sql(`select status || '|' || "resolutionNote" from "SupportReport" where "userId" = '${tobiId}' and "listingId" = '${PANTS}'`) ===
    'CLOSED|Checked with the seller: the photos match the item',
);

// ── M6: suspending signs the user out at once; they see the reason at sign-in ──
const suspendedCtx = await context(phone);
const suspended = await suspendedCtx.newPage();
await signIn(suspended, THROWAWAY, PASSWORD, `${BASE}/`);
check('The throwaway buyer is signed in', (await api(suspended, '/auth/me')).status === 200);
await admin.goto(`${BASE}/admin/users?q=walk.suspended`);
await admin.waitForLoadState('networkidle');
const userRow = admin.getByRole('row').filter({ hasText: THROWAWAY });
await userRow.getByRole('button', { name: 'Suspend' }).click();
const suspendDialog = admin.getByRole('dialog');
await suspendDialog.getByRole('textbox').fill('Walk test: spam listings');
await shot(admin, 'desktop-admin-suspend-dialog', false);
await suspendDialog.getByRole('button', { name: 'Suspend' }).click();
await suspendDialog.waitFor({ state: 'detached' });
await admin.getByText('Walk test: spam listings').first().waitFor();
check(
  'Their sessions end at once',
  (await api(suspended, '/auth/me')).status === 401 &&
    sql(`select count(*) from "Session" where "userId" = '${throwawayId}' and "revokedAt" is null`) === '0',
);
await fillSignIn(suspended, THROWAWAY, PASSWORD);
await suspended.locator('form').getByRole('alert').waitFor();
const suspendedText = await suspended.locator('form').getByRole('alert').innerText();
check('Signing in again shows the admin\'s reason (M6)', suspendedText.includes('Walk test: spam listings'), suspendedText);
await shot(suspended, 'phone-suspended-sign-in', false);

await userRow.getByRole('button', { name: 'Lift suspension' }).click();
await admin.getByRole('dialog').getByRole('button', { name: 'Lift suspension' }).click();
await admin.getByRole('dialog').waitFor({ state: 'detached' });
await signIn(suspended, THROWAWAY, PASSWORD, `${BASE}/`);
check('Once lifted, they can sign in again', true);

// ── M1: an admin changes a role; the user is signed out ──
await userRow.getByRole('button', { name: 'Change role' }).click();
const roleDialog = admin.getByRole('dialog');
await roleDialog.getByLabel('Role').selectOption('SELLER');
await roleDialog.getByRole('button', { name: 'Save role' }).click();
await roleDialog.waitFor({ state: 'detached' });
check(
  'Making them a seller opens a store and signs them out',
  sql(`select role from "User" where id = '${throwawayId}'`) === 'SELLER' &&
    sql(`select count(*) from "SellerProfile" where "userId" = '${throwawayId}'`) === '1' &&
    (await api(suspended, '/auth/me')).status === 401,
);
await userRow.getByRole('button', { name: 'Change role' }).click();
await admin.getByRole('dialog').getByLabel('Role').selectOption('BUYER');
await shot(admin, 'desktop-admin-role-dialog', false);
await admin.getByRole('dialog').getByRole('button', { name: 'Save role' }).click();
await admin.getByRole('dialog').waitFor({ state: 'detached' });
await shot(admin, 'desktop-admin-users');

// ── Guide 9.1: every admin change is in the audit log with who, what and when ──
await admin.goto(`${BASE}/admin/audit?entityType=User&entityId=${throwawayId}`);
await admin.waitForLoadState('networkidle');
const auditText = await admin.locator('table').innerText();
check(
  'The audit log shows the suspension, its lifting and both role changes, by the admin',
  ['User suspended', 'User unsuspended', 'Role changed'].every((t) => auditText.includes(t)) &&
    (auditText.match(/admin@campusmart\.test/g) ?? []).length >= 4,
);
await shot(admin, 'desktop-admin-audit');

// ── M4c: admins edit the banned words ──
await admin.goto(`${BASE}/admin/settings`);
await admin.waitForLoadState('networkidle');
const words = admin.getByLabel('Words and phrases');
const before = await words.inputValue();
check('Settings show the banned words, starting from the prohibited items', before.split('\n').includes('gun') && before.split('\n').includes('fake id'));
await words.fill(`${before}\nairsoft`);
await admin.getByRole('button', { name: 'Save words' }).click();
await admin.getByText(/1 added · 0 removed/).waitFor();
check('Adding a word is saved and audited', sql(`select count(*) from "AuditLog" where "entityId" = 'bannedWords' and meta->'added' ? 'airsoft'`) !== '0');
await shot(admin, 'desktop-admin-banned-words');
await words.fill(before);
await admin.getByRole('button', { name: 'Save words' }).click();
await admin.getByText(/0 added · 1 removed/).waitFor();

// ── Phone: the new screens fit a 390 px phone ──
const adminPhoneCtx = await context(phone);
await adminPhoneCtx.addCookies(await adminCtx.cookies());
const adminPhone = await adminPhoneCtx.newPage();
for (const [path, name] of [
  ['/admin/users', 'phone-admin-users'],
  ['/admin/listings?tab=HIDDEN', 'phone-admin-listings-taken-down'],
  ['/admin', 'phone-admin-overview'],
]) {
  await adminPhone.goto(`${BASE}${path}`);
  await adminPhone.waitForLoadState('networkidle');
  check(`${path} fits a phone with no sideways scrolling`, await noSideScroll(adminPhone));
  await shot(adminPhone, name);
}

// ── Leave the dev data as it was: the walk's own listings are removed ──
sql(`update "Listing" set "isDeleted" = true where id in ('${heldId}', '${draft.body.data.id}')`);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
