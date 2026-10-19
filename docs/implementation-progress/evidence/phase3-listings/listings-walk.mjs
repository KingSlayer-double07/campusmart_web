// Phase 3 browser walk: Chromium -> next dev (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000) -> local campusmart_dev.
// Cloudinary isn't set up yet, so the browser's upload POST and the image proxy are answered
// locally; everything else (signature, ownership checks, saving, browsing, scoping) is real.
// The API runs with placeholder CLOUDINARY_* values (cloud name campusmart-dev) so it signs uploads.
// Accounts (local dev only, email-verified): amaka.store@students.unilag.edu.ng (SELLER),
// tobi.buyer@students.unilag.edu.ng (BUYER), kemi.buyer@ui.edu.ng (BUYER, University of Ibadan).
// Run: WALK_PASSWORD=... node listings-walk.mjs <screenshot dir> <repo>/public
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2];
const PUBLIC = process.argv[3]; // the app's public/ folder, for test photos
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
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

let uploads = 0;
async function context(browser) {
  const ctx = await browser.newContext(phone);
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  await ctx.route('https://api.cloudinary.com/**', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const folder = /name="folder"\r\n\r\n([^\r]+)/.exec(body)?.[1];
    uploads += 1;
    const publicId = `${folder}/photo${uploads}`;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        secure_url: `https://res.cloudinary.com/campusmart-dev/image/upload/v1/${publicId}.jpg`,
        public_id: publicId,
      }),
    });
  });
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  return ctx;
}

async function signIn(page, path, email) {
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('School email').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
}

const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── Seller at University of Lagos ──
const sellerCtx = await context(browser);
const seller = await sellerCtx.newPage();
await signIn(seller, '/onboarding/sellers/sign-in', 'amaka.store@students.unilag.edu.ng');
await seller.waitForURL('**/sellers', { timeout: 20000 });

// Earlier runs left a listing with the same name: delete it the way a seller would
await seller.goto(`${BASE}/sellers/products`);
await seller.waitForLoadState('networkidle');
const leftovers = seller.getByRole('link', { name: /UrbanFlex cargo pants/ });
let deleted = 0;
while ((await leftovers.count()) > 0) {
  const before = await leftovers.count();
  await leftovers.first().getByRole('button', { name: /Actions for/ }).click();
  await seller.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = seller.getByRole('dialog', { name: 'Delete product?' });
  if (deleted === 0) {
    await seller.waitForTimeout(400);
    await shot(seller, 'phone-delete-confirm', false);
  }
  await dialog.getByRole('button', { name: 'Yes, delete it' }).click();
  await seller.waitForFunction(
    ([n]) => document.querySelectorAll('a').length && [...document.querySelectorAll('a')].filter((a) => /UrbanFlex cargo pants/.test(a.textContent)).length < n,
    [before],
  );
  deleted += 1;
}
if (deleted) check('Delete (with a confirm step) removes earlier copies from the list', (await leftovers.count()) === 0, `deleted=${deleted}`);

await seller.goto(`${BASE}/sellers/addProduct`);
await seller.waitForLoadState('networkidle');
await seller.getByLabel('Choose photos').setInputFiles([
  `${PUBLIC}/mainImg.jpg`,
  `${PUBLIC}/subImg.jpg`,
  `${PUBLIC}/mainImg.jpg`,
]);
await seller.getByLabel('Product name').fill('UrbanFlex cargo pants');
await seller.getByLabel('Description').fill('Comfort-fit cargo pants with six pockets. Worn twice.');
await seller.getByLabel('Price').fill('14500');
await seller.getByLabel('Category').selectOption('FASHION');
await seller.getByLabel('Condition').selectOption('USED_LIKE_NEW');
await seller.getByRole('switch', { name: 'This item has sizes or options' }).click();
await seller.getByLabel('Option 1 name').fill('M');
await seller.getByLabel('Option 1 stock').fill('2');
await seller.getByRole('button', { name: 'Add option' }).click();
await seller.getByLabel('Option 2 name').fill('L');
await seller.getByLabel('Option 2 price').fill('15000');
await seller.getByLabel('Option 2 stock').fill('1');
await shot(seller, 'phone-add-product');
check('The add form takes 3 photos and 2 options', (await seller.getByAltText(/Photo \d/).count()) === 3);

await seller.getByRole('button', { name: 'Publish' }).click();
await seller.waitForURL('**/sellers/products', { timeout: 20000 });
const card = seller.getByRole('link', { name: /UrbanFlex cargo pants/ });
await card.waitFor();
await seller.waitForTimeout(500);
await shot(seller, 'phone-seller-products');
check('Publishing uploads 3 photos and lands on the products list', uploads === 3, `uploads=${uploads}`);
check('The new listing shows "In stock" and "From ₦14,500"', (await card.getByText('In stock').count()) && (await card.getByText('From ₦14,500').count()));
const listingId = (await card.getAttribute('href')).split('/').pop();

await card.getByRole('button', { name: /Actions for/ }).click();
await seller.waitForTimeout(200);
await shot(seller, 'phone-product-menu', false);
await seller.getByRole('menuitem', { name: 'Adjust stock' }).click();
await seller.getByRole('dialog', { name: 'Adjust stock' }).getByLabel('Stock for L').waitFor();
await seller.waitForTimeout(400);
await shot(seller, 'phone-adjust-stock', false);
check('Adjust stock lists each option', (await seller.getByRole('dialog', { name: 'Adjust stock' }).getByLabel(/Stock for/).count()) === 2);
await seller.getByRole('dialog', { name: 'Adjust stock' }).getByRole('button', { name: 'Close' }).click().catch(() => seller.keyboard.press('Escape'));
await seller.goto(`${BASE}/sellers/products/${listingId}/edit`);
await seller.waitForLoadState('networkidle');
const nameField = seller.getByLabel('Product name');
await nameField.waitFor();
check(
  'The edit form opens with the saved name, photos and options',
  (await nameField.inputValue()) === 'UrbanFlex cargo pants' &&
    (await seller.getByAltText(/Photo \d/).count()) === 3 &&
    (await seller.getByLabel('Option 2 name').inputValue()) === 'L',
);
await seller.getByLabel('Price', { exact: true }).fill('14000');
await shot(seller, 'phone-edit-product');
await seller.getByRole('button', { name: 'Save changes' }).click();
await seller.waitForURL(`**/sellers/products/${listingId}`, { timeout: 20000 });
await seller.getByText('From ₦14,000').first().waitFor();
await seller.waitForTimeout(400);
await shot(seller, 'phone-seller-product');
check('Saving the edit updates the price (no new uploads)', uploads === 3, `uploads=${uploads}`);

await seller.goto(`${BASE}/sellers/profile`);
await seller.getByRole('button', { name: 'Edit store' }).click();
await seller.getByLabel('Store name').fill('Amaka Styles');
await seller.getByRole('dialog', { name: 'Edit store' }).getByRole('button', { name: 'Save' }).click();
await seller.getByRole('heading', { name: 'Amaka Styles' }).waitFor();
// Earlier runs may have left the store online: take it offline first so both directions run
const onlineSwitch = seller.getByRole('switch', { name: 'Online' });
if ((await onlineSwitch.getAttribute('aria-checked')) === 'true') {
  await onlineSwitch.click();
  await seller.getByText("You're offline").waitFor();
}
await onlineSwitch.click();
await seller.getByText("You're online").waitFor();
for (const dismiss of await seller.getByRole('button', { name: 'Dismiss notification' }).all()) await dismiss.click().catch(() => {});
await seller.waitForTimeout(600);
await shot(seller, 'phone-seller-profile');
check('The store profile saves a name and the online switch', (await onlineSwitch.getAttribute('aria-checked')) === 'true');

// ── Buyer at the same school ──
const buyerCtx = await context(browser);
const buyer = await buyerCtx.newPage();
await signIn(buyer, '/onboarding/buyers/sign-in', 'tobi.buyer@students.unilag.edu.ng');
await buyer.waitForURL(`${BASE}/`, { timeout: 20000 });
await buyer.getByText('UrbanFlex cargo pants').first().waitFor();
await buyer.waitForTimeout(500);
await shot(buyer, 'phone-home');
check("A buyer at the seller's school sees it on the home page", true);

await buyer.getByRole('searchbox').fill('cargo');
await buyer.getByRole('button', { name: 'Search', exact: true }).click();
await buyer.waitForURL('**/categories?q=cargo');
await buyer.getByText('UrbanFlex cargo pants').first().waitFor();
await buyer.waitForTimeout(400);
await shot(buyer, 'phone-search');
check('Search puts q in the URL and finds it', buyer.url().endsWith('/categories?q=cargo'));

await buyer.getByText('UrbanFlex cargo pants').first().click();
await buyer.waitForURL(`**/productItem/${listingId}`);
await buyer.getByText('Amaka Styles').waitFor();
check('The product page shows the store name and that the seller is online', await buyer.getByText('Online').count());
check('Add to cart waits for an option', await buyer.getByRole('button', { name: 'Choose an option' }).isDisabled());
await buyer.getByRole('radio', { name: 'L' }).click();
await buyer.getByText('₦15,000').first().waitFor();
await buyer.waitForTimeout(300);
await shot(buyer, 'phone-product');
await buyer.getByRole('button', { name: 'Add to Cart' }).click();
await buyer.getByRole('button', { name: 'View cart' }).waitFor();
check("Picking 'L' shows its own price and adds it to the cart", true);
await buyer.goto(`${BASE}/cart`);
await buyer.getByText('Option: L').waitFor();
await buyer.waitForTimeout(300);
await shot(buyer, 'phone-cart', false);
check('The cart shows the option and ₦15,000', await buyer.getByText('₦15,000').count());

// ── Buyer at another school ──
const otherCtx = await context(browser);
const other = await otherCtx.newPage();
await signIn(other, '/onboarding/buyers/sign-in', 'kemi.buyer@ui.edu.ng');
await other.waitForURL(`${BASE}/`, { timeout: 20000 });
await other.goto(`${BASE}/productItem/${listingId}`);
await other.getByText("This item isn't available").waitFor();
await shot(other, 'phone-other-school', false);
check('A buyer at another school gets "not available" (API 404) for its ID', true);
await other.goto(`${BASE}/categories`);
await other.getByText('No products found').waitFor();
check('…and an empty catalogue at their school', true);

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
