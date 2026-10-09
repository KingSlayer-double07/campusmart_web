// Phase 4 browser walk: Chromium -> next dev (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. Payments are off (PAYMENTS_ENABLED=false), as the guide says until Phase 5.
// A seller changes price and stock through the real API (PATCH /listings/:id) while the buyer shops.
// Accounts (local dev only): BUYER (tobi.buyer@...), SELLER (chidi.store@..., "Chidi Gadgets") and the
// listing ids below. Run: WALK_PASSWORD=... node cart-walk.mjs <shots dir> <repo>/public
import { chromium, request as apiRequest } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:4000/api';
const [OUT, PUBLIC] = process.argv.slice(2);
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const BUYER = process.env.BUYER_EMAIL ?? 'tobi.buyer@students.unilag.edu.ng';
const SELLER = process.env.SELLER_EMAIL ?? 'chidi.store@students.unilag.edu.ng';
const LAMP = process.env.LAMP_ID ?? 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets, no options
const PANTS = process.env.PANTS_ID ?? '49ce6c55-4c06-4df9-a673-72328e0bf031'; // Amaka Styles, sizes M and L

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

// The seller, through the API
const seller = await apiRequest.newContext({ baseURL: `${API}/` });
const login = await seller.post('auth/login', { data: { email: SELLER, password: PASSWORD } });
if (!login.ok()) throw new Error(`seller sign-in failed: ${login.status()}`);
const patchLamp = async (data) => {
  const res = await seller.patch(`listings/${LAMP}`, { data });
  if (!res.ok()) throw new Error(`PATCH lamp ${JSON.stringify(data)} -> ${res.status()} ${await res.text()}`);
  return (await res.json()).data;
};
const lampNow = async () => (await (await seller.get(`listings/${LAMP}`)).json()).data;
await patchLamp({ priceKobo: 450_000, stock: 2 });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
// A guest cart left on this phone before signing in (seeded once per tab)
await ctx.addInitScript(
  ([lamp]) => {
    localStorage.setItem('pwa_prompt_dismissed', 'true');
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'campus-mart-cart',
      JSON.stringify({
        state: {
          cart: [{ id: lamp, variantId: null, name: 'Desk lamp', priceKobo: 450000, image: null, quantity: 1, category: 'Tech', size: 'default', stockCount: 2, storeName: 'Chidi Gadgets' }],
        },
        version: 1,
      }),
    );
  },
  [LAMP],
);
let n = 0;
await ctx.route('**/_next/image**', (route) =>
  route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
);
const page = await ctx.newPage();

// ── Sign in: the guest cart joins the account's ──
await page.goto(`${BASE}/onboarding/buyers/sign-in`);
await page.waitForLoadState('networkidle');
await page.getByPlaceholder('School email').fill(BUYER);
await page.getByPlaceholder('Password').fill(PASSWORD);
await page.getByRole('button', { name: /sign in|log in/i }).click();
await page.waitForURL(`${BASE}/`, { timeout: 20000 });
await page.waitForFunction(() => JSON.parse(localStorage.getItem('campus-mart-cart') ?? '{}')?.state?.cart?.length === 0, null, { timeout: 15000 });
check('After sign-in the guest cart is merged into the account and cleared from the phone', true);

// ── Add from another store on the product page ──
await page.goto(`${BASE}/productItem/${PANTS}`);
await page.getByRole('radio', { name: 'M' }).click();
await page.getByRole('button', { name: 'Add to Cart' }).click();
await page.getByRole('button', { name: 'View cart' }).waitFor();
check('Add to Cart on a product goes to the server cart', true);

await page.goto(`${BASE}/cart`);
const chidi = page.getByRole('region', { name: 'Chidi Gadgets' });
const amaka = page.getByRole('region', { name: 'Amaka Styles' });
await chidi.waitFor();
await amaka.waitFor();
await chidi.getByRole('button', { name: 'One more' }).click();
await chidi.getByLabel('Quantity').filter({ hasText: '2' }).waitFor();
await page.waitForTimeout(400);
await shot(page, 'phone-cart-two-stores');
check('The cart groups lines by store, each with a subtotal', (await chidi.getByText('₦9,000').count()) > 0 && (await amaka.getByText('Subtotal').count()) > 0);

// ── The seller raises the price ──
await patchLamp({ priceKobo: 480_000 });
await page.reload();
await page.getByText('Price went up from ₦4,500 to ₦4,800').waitFor();
await page.waitForTimeout(300);
await shot(page, 'phone-cart-price-changed', false);
check('A price change is flagged, but checkout stays open', !(await page.getByRole('button', { name: /^Checkout/ }).isDisabled()));
await page.getByRole('button', { name: 'OK' }).click();
await page.getByText('Price went up').waitFor({ state: 'detached' });
check('Tapping OK accepts the new price', true);

// ── The seller has only one left ──
await patchLamp({ stock: 1 });
await page.reload();
await page.getByText('Only 1 left').waitFor();
await page.waitForTimeout(300);
await shot(page, 'phone-cart-low-stock', false);
check('More than is left blocks checkout, with a fix offered', await page.getByRole('button', { name: /^Checkout/ }).isDisabled());
await page.getByRole('button', { name: 'Change to 1' }).click();
await page.getByText('Only 1 left').waitFor({ state: 'detached' });
check('"Change to 1" fixes it', !(await page.getByRole('button', { name: /^Checkout/ }).isDisabled()));

// ── Checkout ──
await page.getByRole('button', { name: /^Checkout/ }).click();
await page.waitForURL('**/checkout');
await page.getByText('Select a pickup station').click();
await page.waitForURL('**/pickup-station');
await page.getByRole('button', { name: 'Library Pickup Point' }).click();
await page.waitForTimeout(400);
await shot(page, 'phone-pickup-stations', false);
check('Pickup stations come from the API, with hours', (await page.getByText(/Mon–Fri: 09:00–17:00|: \d\d:\d\d–\d\d:\d\d/).count()) > 0);
await page.getByRole('button', { name: 'Confirm' }).click();
await page.waitForURL('**/checkout');
await page.getByRole('radio', { name: 'Bank transfer' }).click();
await page.waitForTimeout(300);
await shot(page, 'phone-checkout');
check('Checkout shows the station and has no coupon field', (await page.getByText('Library Pickup Point').count()) > 0 && (await page.getByPlaceholder('Enter here').count()) === 0);

// The last lamp sells elsewhere while the buyer is on this page
await patchLamp({ stock: 0 });
await page.getByRole('button', { name: /Proceed to Pay/ }).click();
await page.getByText('Desk lamp: sold out').waitFor();
await page.waitForTimeout(300);
await shot(page, 'phone-checkout-out-of-stock', false);
check('OUT_OF_STOCK at checkout names the item and links back to the cart', (await page.getByRole('link', { name: 'Review cart' }).count()) > 0);

await patchLamp({ stock: 1 });
await page.reload();
await page.getByRole('radio', { name: 'Bank transfer' }).click();
await page.getByRole('button', { name: /Proceed to Pay/ }).click();
await page.waitForURL(/order-confirmation\?orderId=.+&payment=unavailable/, { timeout: 20000 });
await page.getByText('Order placed, waiting for payment').waitFor();
await page.waitForTimeout(300);
await shot(page, 'phone-order-confirmation', false);
const orderId = new URL(page.url()).searchParams.get('orderId');
const reserved = await lampNow();
check('Checkout reserves the stock (lamp sold out while the order waits)', reserved.stock === 0 && reserved.status === 'SOLDOUT', `stock=${reserved.stock} ${reserved.status}`);

// ── The order ──
await page.getByRole('link', { name: 'View order' }).click();
await page.waitForURL(`**/orders/${orderId}`);
await page.getByRole('region', { name: 'Chidi Gadgets' }).waitFor();
const codes = await page.locator('section span.font-mono').allInnerTexts();
await page.waitForTimeout(300);
await shot(page, 'phone-order-detail');
check('Two stores make two seller orders with different CM- codes', codes.length === 2 && codes[0] !== codes[1] && codes.every((c) => /^CM-[2-9A-HJ-NP-Z]{6}$/.test(c)), codes.join(', '));

await page.getByRole('button', { name: 'Cancel order' }).click();
await page.getByRole('button', { name: 'Yes, cancel it' }).click();
await page.getByText('Order cancelled').waitFor();
await page.waitForTimeout(300);
await shot(page, 'phone-order-cancelled', false);
const restored = await lampNow();
check('Cancelling puts the stock back on sale', restored.stock === 1 && restored.status === 'ACTIVE', `stock=${restored.stock} ${restored.status}`);

await page.goto(`${BASE}/orders`);
await page.getByRole('list', { name: 'Orders' }).waitFor();
await page.waitForTimeout(300);
await shot(page, 'phone-orders-list', false);
check('My Orders lists it as cancelled', (await page.getByRole('list', { name: 'Orders' }).getByText('Cancelled').count()) > 0);

await page.goto(`${BASE}/profile`);
const myOrders = page.getByRole('link', { name: /My Orders/ });
check('The profile menu links My Orders to /orders', (await myOrders.getAttribute('href')) === '/orders');

await patchLamp({ priceKobo: 450_000, stock: 2 });
await browser.close();
await seller.dispose();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
