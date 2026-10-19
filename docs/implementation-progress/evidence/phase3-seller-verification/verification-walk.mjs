// Seller verification browser walk: Chromium -> next dev (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. Cloudinary isn't set up yet, so the browser's upload POST and the admin's
// private photo link are answered locally; signing, ownership checks, the queue, decisions and the
// publish rule are all real. The API runs with placeholder CLOUDINARY_* values (cloud campusmart-dev).
// Accounts (local dev only): SELLER_EMAIL (default amaka.store@students.unilag.edu.ng, never verified)
// and the seed admin. The recorded run used a fresh seller, chidi.store@students.unilag.edu.ng.
// Run: SELLER_EMAIL=... WALK_PASSWORD=... ADMIN_PASSWORD=... node verification-walk.mjs <shots dir> sample-id-card.jpg <repo>/public
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const [OUT, ID_CARD, PUBLIC] = process.argv.slice(2);
const SELLER = process.env.SELLER_EMAIL ?? 'amaka.store@students.unilag.edu.ng';
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const ADMIN = process.env.ADMIN_EMAIL ?? 'admin@campusmart.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LocalAdmin123'; // local seed admin only
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};

const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
const desktop = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 };

const uploads = [];
const downloads = [];
async function context(browser, options) {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  await ctx.route('https://api.cloudinary.com/v1_1/*/image/upload', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const field = (name) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`).exec(body)?.[1];
    const type = field('type') ?? 'upload';
    uploads.push({ folder: field('folder'), type });
    const publicId = `${field('folder')}/photo${uploads.length}`;
    const delivery = type === 'authenticated' ? 'authenticated/s--Ab12Cd34--' : 'upload';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        secure_url: `https://res.cloudinary.com/campusmart-dev/image/${delivery}/v1700000000/${publicId}.jpg`,
        public_id: publicId,
      }),
    });
  });
  // The admin's 10-minute signed link to the private photo
  await ctx.route('https://api.cloudinary.com/v1_1/*/image/download**', (route) => {
    downloads.push(new URL(route.request().url()));
    return route.fulfill({ path: ID_CARD, contentType: 'image/jpeg' });
  });
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  return ctx;
}

async function signIn(page, path, email, password, landing) {
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('School email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(landing, { timeout: 20000 });
}

const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const dismissToasts = async (page) => {
  for (const b of await page.getByRole('button', { name: 'Dismiss notification' }).all()) await b.click().catch(() => {});
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── 1. A seller who isn't verified yet ──
const sellerCtx = await context(browser, phone);
const seller = await sellerCtx.newPage();
await signIn(seller, '/onboarding/sellers/sign-in', SELLER, PASSWORD, '**/sellers');

await seller.goto(`${BASE}/sellers/profile`);
await seller.getByRole('heading', { name: 'Get verified to start selling' }).waitFor();
await seller.waitForTimeout(400);
await shot(seller, 'phone-get-verified');
check('An unverified seller sees "Get verified to start selling" on their store profile', true);

await seller.goto(`${BASE}/sellers/addProduct`);
await seller.waitForLoadState('networkidle');
await seller.getByText('Get verified to publish').waitFor();
check('Add product explains drafts and offers no Publish button', (await seller.getByRole('button', { name: 'Publish' }).count()) === 0);
await seller.getByLabel('Choose photos').setInputFiles([`${PUBLIC}/subImg.jpg`]);
await seller.getByLabel('Product name').fill('Desk lamp');
await seller.getByLabel('Price', { exact: true }).fill('4500');
await seller.getByLabel('Quantity in stock').fill('2');
await seller.getByLabel('Category').selectOption('TECH');
await seller.getByLabel('Condition').selectOption('USED_GOOD');
await shot(seller, 'phone-add-product-draft-only');
await seller.getByRole('button', { name: 'Save as draft' }).click();
await seller.waitForURL('**/sellers/products', { timeout: 20000 });
const lamp = seller.getByRole('link', { name: /Desk lamp/ }).first();
await lamp.waitFor();
check('Saving as a draft works before verification', (await lamp.getByText('Draft').count()) > 0);
await lamp.getByRole('button', { name: /Actions for/ }).click();
await seller.getByRole('menuitem', { name: 'Adjust stock' }).waitFor();
check('The draft\'s menu has no Publish yet', (await seller.getByRole('menuitem', { name: 'Publish' }).count()) === 0);
await seller.waitForTimeout(300);
await shot(seller, 'phone-products-unverified', false);
await seller.keyboard.press('Escape');

await seller.goto(`${BASE}/sellers/profile`);
await seller.getByLabel('Student ID photo').setInputFiles(ID_CARD);
await seller.getByRole('heading', { name: "We're checking your student ID" }).waitFor();
await seller.waitForTimeout(400);
await shot(seller, 'phone-verification-pending');
const idUpload = uploads.at(-1);
check(
  'The ID photo goes up as a private upload into the seller\'s verification folder',
  idUpload?.type === 'authenticated' && /^campusmart\/verification\//.test(idUpload.folder),
  `${idUpload?.type} ${idUpload?.folder}`,
);

// ── 2. An admin on a laptop rejects with a note ──
const adminCtx = await context(browser, desktop);
const admin = await adminCtx.newPage();
await signIn(admin, '/onboarding/buyers/sign-in', ADMIN, ADMIN_PASSWORD, '**/admin');
const card = admin.getByRole('link', { name: /Seller verification/ });
await card.waitFor();
await admin.waitForFunction(() => !document.querySelector('[aria-label="Loading"]'));
const waitingCount = (await card.innerText()).match(/\n(\d+\+?)\n?/)?.[1];
await shot(admin, 'desktop-overview-verification');
check('The overview counts sellers waiting', Number(waitingCount) >= 1, `waiting=${waitingCount}`);

await card.click();
await admin.waitForURL('**/admin/verifications');
const row = admin.getByRole('row', { name: new RegExp(SELLER.replace(/[.]/g, '\\.')) });
await row.waitFor();
await shot(admin, 'desktop-verifications-queue');
check('The Waiting tab lists the seller with their store and school', true);
await row.getByRole('button', { name: 'Review' }).click();
const dialog = admin.getByRole('dialog', { name: 'Review seller' });
await dialog.getByRole('img', { name: /Student ID sent by/ }).waitFor();
await admin.waitForTimeout(500);
await shot(admin, 'desktop-review-dialog', false);
const link = downloads.at(-1);
check(
  'The ID photo loads from a signed link that expires within 10 minutes',
  link?.searchParams.get('type') === 'authenticated' &&
    Number(link?.searchParams.get('expires_at')) - Date.now() / 1000 <= 600 &&
    !!link?.searchParams.get('signature'),
);
await dialog.getByRole('button', { name: 'Reject…' }).click();
await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
await dialog.getByText(/Tell the seller what to fix/).waitFor();
check('Rejecting needs a note', true);
await dialog.getByLabel('What should they fix?').fill('The photo is blurry. Please retake it in good light.');
await shot(admin, 'desktop-reject-note', false);
await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
await admin.getByText('Request rejected').waitFor();
await admin.getByRole('tab', { name: 'Rejected' }).click();
await admin.getByText('The photo is blurry. Please retake it in good light.').first().waitFor();
await dismissToasts(admin);
await admin.waitForTimeout(400);
await shot(admin, 'desktop-rejected-tab');
check('The Rejected tab shows the note', admin.url().endsWith('?status=REJECTED'));

// ── 3. The seller sees why and sends a new photo ──
await seller.reload();
await seller.getByRole('heading', { name: "Your student ID wasn't approved" }).waitFor();
await seller.getByText('The photo is blurry. Please retake it in good light.').waitFor();
await seller.waitForTimeout(300);
await shot(seller, 'phone-verification-rejected');
check("The seller sees the admin's note", true);
await seller.getByLabel('Student ID photo').setInputFiles(ID_CARD);
await seller.getByRole('heading', { name: "We're checking your student ID" }).waitFor();
check('The seller can send a new photo', true);

// ── 4. An admin on a phone approves ──
const adminPhoneCtx = await context(browser, phone);
const adminPhone = await adminPhoneCtx.newPage();
await signIn(adminPhone, '/onboarding/buyers/sign-in', ADMIN, ADMIN_PASSWORD, '**/admin');
await adminPhone.goto(`${BASE}/admin/verifications`);
await adminPhone.waitForLoadState('networkidle');
const phoneList = adminPhone.getByRole('list', { name: 'Verification requests' });
const phoneCard = (await phoneList.count()) ? phoneList.getByRole('listitem').filter({ hasText: SELLER }) : adminPhone.getByText(SELLER).locator('..');
await phoneCard.first().getByRole('button', { name: 'Review' }).click();
const phoneDialog = adminPhone.getByRole('dialog', { name: 'Review seller' });
await phoneDialog.getByRole('img', { name: /Student ID sent by/ }).waitFor();
await adminPhone.waitForTimeout(500);
await shot(adminPhone, 'phone-admin-review', false);
const sideways = await adminPhone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('The admin queue and dialog fit a phone (no sideways scrolling)', !sideways);
await phoneDialog.getByRole('button', { name: 'Approve seller' }).click();
await adminPhone.getByText('Seller approved').waitFor();
await adminPhone.waitForTimeout(300);
await shot(adminPhone, 'phone-admin-approved', false);
check('Approving shows "Seller approved"', true);

// ── 5. The verified seller publishes ──
await seller.goto(`${BASE}/sellers/products`);
await seller.waitForLoadState('networkidle');
const lamp2 = seller.getByRole('link', { name: /Desk lamp/ }).first();
await lamp2.waitFor();
check('The "Get verified" notice is gone from products', (await seller.getByText('Get verified to publish').count()) === 0);
await lamp2.getByRole('button', { name: /Actions for/ }).click();
await seller.getByRole('menuitem', { name: 'Publish' }).click();
await lamp2.getByText('In stock').waitFor();
await dismissToasts(seller);
await seller.waitForTimeout(300);
await shot(seller, 'phone-published-after-approval', false);
check('After approval the draft publishes ("In stock")', true);
await seller.goto(`${BASE}/sellers/profile`);
await seller.getByLabel('Verified seller').waitFor();
check('The profile shows the verified badge and no verification card', (await seller.getByRole('heading', { name: /student ID|Get verified/ }).count()) === 0);
await seller.waitForTimeout(300);
await shot(seller, 'phone-seller-verified');

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
