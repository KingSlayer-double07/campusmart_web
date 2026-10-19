// Phase 4b browser walk: Chromium -> next start (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. Payments are still off (PAYMENTS_ENABLED=false) until Phase 5.
// Accounts (local dev only): admin@campusmart.test, sellers chidi.store@ and amaka.store@, buyer tobi.buyer@.
// Run: WALK_PASSWORD=... ADMIN_PASSWORD=... node delivery-walk.mjs <shots dir> <repo>/public
import { chromium, request as apiRequest } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:4000/api';
const [OUT, PUBLIC] = process.argv.slice(2);
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LocalAdmin123';
const BUYER = 'tobi.buyer@students.unilag.edu.ng';
const CHIDI = 'chidi.store@students.unilag.edu.ng';
const AMAKA = 'amaka.store@students.unilag.edu.ng';
const LAMP = 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets
const PANTS = '49ce6c55-4c06-4df9-a673-72328e0bf031'; // Amaka Styles, sizes M and L
const PHONE = '+234 803 555 0101';

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
async function context(options) {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  return ctx;
}
async function signIn(page, email, password, landing) {
  await page.goto(`${BASE}/onboarding/buyers/sign-in`);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('School email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(landing, { timeout: 20000 });
}

// ── Admin, on a laptop: places and the campus fee ──
const adminCtx = await context({ viewport: { width: 1366, height: 900 } });
const admin = await adminCtx.newPage();
await signIn(admin, 'admin@campusmart.test', ADMIN_PASSWORD, '**/admin');
await admin.getByText('2. Add campus places and set the delivery fee').waitFor();
check('The overview says a campus needs places and a fee (no pickup station step)', (await admin.getByText('Add at least one pickup station').count()) === 0);

await admin.goto(`${BASE}/admin/places`);
await admin.getByRole('heading', { name: 'Campus places' }).waitFor();
await admin.getByText('Main Gate').first().waitFor();
if ((await admin.getByText('Faculty of Science').count()) === 0) {
  await admin.getByRole('button', { name: 'Add place' }).first().click();
  await admin.getByLabel('Institution').last().selectOption({ label: 'University of Lagos' });
  await admin.getByLabel('Place name').fill('Faculty of Science');
  await admin.getByRole('button', { name: 'Add place' }).last().click();
  await admin.getByText('Place added').waitFor();
}
await admin.getByText('Faculty of Science').first().waitFor();
await admin.waitForTimeout(400);
await shot(admin, 'desktop-campus-places');
check('An admin adds a campus place', (await admin.getByText('Faculty of Science').count()) > 0);

await admin.goto(`${BASE}/admin/settings`);
await admin.getByRole('heading', { name: 'Delivery fees by campus' }).waitFor();
const unilag = admin.getByRole('row').filter({ hasText: 'University of Lagos' });
await unilag.waitFor();
await unilag.getByRole('button', { name: /Set fee|Change fee/ }).click();
await admin.getByLabel('Fee in naira').fill('500');
await admin.getByRole('button', { name: 'Save fee' }).click();
await admin.getByText('Delivery fee saved').waitFor();
await unilag.getByText('₦500 per order').waitFor();
await admin.waitForTimeout(400);
await shot(admin, 'desktop-settings-delivery-fees');
check('An admin sets the flat on-campus fee for UNILAG', (await unilag.getByText('₦500 per order').count()) === 1);

// ── Sellers, on phones: delivery details before publishing ──
const amaka = await apiRequest.newContext({ baseURL: `${API}/` });
if (!(await amaka.post('auth/login', { data: { email: AMAKA, password: PASSWORD } })).ok()) throw new Error('Amaka sign-in failed');
// Amaka allows pickup, through the API (the card itself is walked with Chidi)
await amaka.patch('sellers/me', {
  data: { pickupArea: 'Moremi Hall', pickupAddress: 'Room 12, Block B, Moremi Hall', contactPhone: '+234 809 000 0000', allowsPickup: true },
});

const sellerCtx = await context(phone);
const chidi = await sellerCtx.newPage();
await chidi.request.post(`${BASE}/api/auth/login`, { data: { email: CHIDI, password: PASSWORD } });
// Start Chidi without details so the publish notice shows
await chidi.request.patch(`${BASE}/api/sellers/me`, { data: { allowsPickup: false } });
const chidiProfile = await (await chidi.request.get(`${BASE}/api/sellers/me`)).json();
if (chidiProfile.data.deliveryDetailsComplete) {
  console.log('note: Chidi already had delivery details from an earlier walk');
}
await chidi.goto(`${BASE}/sellers/addProduct`);
const notice = chidi.getByText('Add your delivery details to publish');
const noticeShown = await notice.waitFor({ timeout: 8000 }).then(() => true, () => false);
if (noticeShown) {
  await chidi.waitForTimeout(300);
  await shot(chidi, 'phone-seller-publish-needs-delivery', false);
}
check('A verified seller without delivery details is told publishing needs them', noticeShown || chidiProfile.data.deliveryDetailsComplete);

await chidi.goto(`${BASE}/sellers/profile`);
const card = chidi.getByRole('region', { name: 'Delivery and pickup' });
await card.waitFor();
await card.getByRole('button', { name: /Add details|Edit/ }).click();
await chidi.getByLabel('Area').fill('Jaja Hall');
await chidi.getByLabel('Full address').fill('Room 4, Block A, Jaja Hall');
await chidi.getByLabel('Phone number').fill('+234 802 111 2233');
await chidi.waitForTimeout(300);
await shot(chidi, 'phone-seller-delivery-sheet', false);
await chidi.getByRole('button', { name: 'Save' }).click();
await chidi.getByText('Delivery details saved').waitFor();
await card.getByText('Jaja Hall', { exact: true }).waitFor();
await chidi.waitForTimeout(300);
await card.scrollIntoViewIfNeeded();
await shot(chidi, 'phone-seller-delivery-card');
check('The seller saves area, address and phone; riders only by default', (await card.getByText("Riders only; buyers can't pick up from you").count()) === 1);
await chidi.goto(`${BASE}/sellers/addProduct`);
await chidi.getByRole('heading', { name: 'Add Product' }).waitFor().catch(() => undefined);
await chidi.waitForTimeout(1200);
check('With the details saved, the publish notice is gone', (await chidi.getByText('Add your delivery details to publish').count()) === 0);

// ── Buyer, on a phone: checkout with delivery ──
const buyerCtx = await context(phone);
const tobi = await buyerCtx.newPage();
await signIn(tobi, BUYER, PASSWORD, `${BASE}/`);
const pants = await (await tobi.request.get(`${BASE}/api/listings/${PANTS}`)).json();
const medium = pants.data.variants.find((v) => v.label === 'M');
for (const body of [
  { listingId: LAMP, quantity: 1 },
  { listingId: PANTS, variantId: medium.id, quantity: 1 },
]) {
  const res = await tobi.request.put(`${BASE}/api/cart/items`, { data: body });
  if (!res.ok()) throw new Error(`cart ${res.status()} ${await res.text()}`);
}
const cart = (await (await tobi.request.get(`${BASE}/api/cart`)).json()).data;
check('The cart says who offers pickup (area only) and carries the campus fee', cart.campusDeliveryFeeKobo === 50_000 && cart.groups.some((g) => g.seller.pickupArea === 'Moremi Hall') && !JSON.stringify(cart).includes('Room 12'));

await tobi.goto(`${BASE}/checkout`);
await tobi.getByRole('option', { name: 'Faculty of Science' }).waitFor({ state: 'attached' });
const chidiChoice = tobi.getByRole('radiogroup', { name: 'How Chidi Gadgets reaches you' });
const amakaChoice = tobi.getByRole('radiogroup', { name: 'How Amaka Styles reaches you' });
check('Chidi only sends by rider; Amaka offers pickup at Moremi Hall', (await chidiChoice.getByRole('radio').count()) === 1 && (await amakaChoice.getByText(/Moremi Hall · free/).count()) === 1);
await tobi.getByLabel('Place on campus').selectOption({ label: 'Faculty of Science' });
await tobi.getByLabel('Phone number for the rider').fill(PHONE);
await tobi.getByRole('radio', { name: 'Card' }).click();
const subtotal = cart.subtotalKobo;
const naira = (kobo) => `₦${(kobo / 100).toLocaleString('en-NG')}`;
await tobi.waitForTimeout(400);
await shot(tobi, 'phone-checkout-delivery');
check('Both by rider: one ₦500 fee on top of the items', (await tobi.getByText(naira(subtotal + 50_000)).count()) > 0, naira(subtotal + 50_000));

await amakaChoice.getByRole('radio', { name: 'Pick up from the seller' }).click();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-checkout-pickup-and-rider');
await tobi.getByRole('button', { name: /Proceed to Pay/ }).click();
await tobi.waitForURL(/order-confirmation\?orderId=.+&payment=unavailable/, { timeout: 20000 });
const orderId = new URL(tobi.url()).searchParams.get('orderId');
const order = (await (await tobi.request.get(`${BASE}/api/orders/${orderId}`)).json()).data;
check(
  'The order has one destination, one fee, and a method per store',
  order.deliveryFeeKobo === 50_000 &&
    order.totalKobo === subtotal + 50_000 &&
    order.destination?.campusPlace?.name === 'Faculty of Science' &&
    order.sellerOrders.map((so) => so.deliveryMethod).sort().join() === 'DISPATCH,SELLER_PICKUP',
  `${naira(order.totalKobo)}`,
);

await tobi.goto(`${BASE}/orders/${orderId}`);
await tobi.getByText('Delivery to Faculty of Science').first().waitFor();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-order-delivery');
check('Before payment, the pickup seller shows the area only', (await tobi.getByText('You pick up from the seller · Moremi Hall').count()) === 1 && (await tobi.getByText('Room 12, Block B, Moremi Hall').count()) === 0);
check('The rider phone is shown, and saved to the account', (await tobi.getByText(`The rider will call ${PHONE}`).count()) === 1 && (await (await tobi.request.get(`${BASE}/api/auth/me`)).json()).data.phone === PHONE);
await tobi.getByRole('button', { name: 'Cancel order' }).click();
await tobi.getByRole('button', { name: 'Yes, cancel it' }).click();
await tobi.getByText('Order cancelled').waitFor();

// Off campus: an address, no fee in the app
await tobi.request.put(`${BASE}/api/cart/items`, { data: { listingId: LAMP, quantity: 1 } });
await tobi.goto(`${BASE}/checkout`);
await tobi.getByRole('radio', { name: 'Off campus' }).click();
await tobi.getByLabel('Address off campus').fill('14 Akoka Road, Yaba');
await tobi.getByRole('radio', { name: 'Bank transfer' }).click();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-checkout-off-campus');
check('Off campus: the fee is agreed with the rider, not charged', (await tobi.getByText('Agreed with the rider').count()) === 1);
await tobi.getByRole('button', { name: /Proceed to Pay/ }).click();
await tobi.waitForURL(/order-confirmation/, { timeout: 20000 });
const offId = new URL(tobi.url()).searchParams.get('orderId');
const off = (await (await tobi.request.get(`${BASE}/api/orders/${offId}`)).json()).data;
check('The off-campus order keeps the address and has no fee', off.deliveryFeeKobo === 0 && off.destination?.address === '14 Akoka Road, Yaba');
await tobi.request.post(`${BASE}/api/orders/${offId}/cancel`);

await browser.close();
await amaka.dispose();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
