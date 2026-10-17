// Phase 6 browser walk: Chromium -> next start (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. The API runs with PAYMENTS_ENABLED=true, a made-up key and the Phase 5
// paystack-stub.cjs preloaded; the walk plays Paystack with a signed webhook. Nothing reaches real Paystack.
// Accounts (local dev only): admin@campusmart.test, sellers chidi.store@ and amaka.store@, buyer tobi.buyer@.
// A new rider is invited on every run (a unique email), so the walk can be repeated.
// Run: node dispatch-walk.mjs <shots dir> <repo>/public <api log>
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:4000/api';
const [OUT, PUBLIC, API_LOG] = process.argv.slice(2);
const SECRET = 'sk_test_walk_local_only'; // made up; matches the API started for the walk
const DB = 'postgresql://postgres:postgres@localhost:5432/campusmart_dev';
const PASSWORD = process.env.WALK_PASSWORD ?? 'Campus2026'; // local dev accounts only
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LocalAdmin123';
const BUYER = 'tobi.buyer@students.unilag.edu.ng';
const CHIDI = 'chidi.store@students.unilag.edu.ng';
const AMAKA = 'amaka.store@students.unilag.edu.ng';
const LAMP = 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets
const PANTS = '49ce6c55-4c06-4df9-a673-72328e0bf031'; // Amaka Styles, pickup allowed
const RIDER = `musa.${Date.now()}@riders.campusmart.test`;

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();

async function webhook(event, data) {
  const body = JSON.stringify({ event, data });
  const sig = createHmac('sha512', SECRET).update(body).digest('hex');
  const res = await fetch(`${API}/payments/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-paystack-signature': sig }, body });
  return res.status;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
async function context(options) {
  const ctx = await browser.newContext({ timezoneId: 'Africa/Lagos', ...options });
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  await ctx.route('https://checkout.paystack.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Paystack (local stub)</title><h1>Paystack (local stub)</h1>' }),
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

// Repeatable on the dev database: both listings in stock
sql(`update "Listing" set stock = 10, status = 'ACTIVE' where id = '${LAMP}'`);
sql(`update "ListingVariant" set stock = 5 where "listingId" = '${PANTS}' and label = 'M'`);

// ── Admin, on a laptop: invite a rider ──
const adminCtx = await context({ viewport: { width: 1366, height: 900 } });
const admin = await adminCtx.newPage();
await signIn(admin, 'admin@campusmart.test', ADMIN_PASSWORD, '**/admin');
await admin.goto(`${BASE}/admin/riders`);
await admin.getByRole('heading', { name: 'Riders' }).waitFor();
await admin.getByRole('button', { name: /Invite rider/ }).click();
const dialog = admin.getByRole('dialog');
await dialog.getByLabel('Email').fill(RIDER);
await dialog.getByLabel('First name').fill('Musa');
await dialog.getByLabel('Last name (optional)').fill('Bello');
await dialog.getByLabel('Campus').selectOption({ label: 'University of Lagos' });
await admin.waitForTimeout(300);
await shot(admin, 'desktop-admin-invite-rider', false);
await dialog.getByRole('button', { name: 'Send invite' }).click();
await admin.getByText('Invite sent').first().waitFor();
await admin.getByText(RIDER).first().waitFor();
await admin.waitForTimeout(400);
await shot(admin, 'desktop-admin-riders');
check('An admin invites a rider for a campus (DX1)', sql(`select role || ',' || (password is null) from "User" where email = '${RIDER}'`) === 'DISPATCH,true');

// ── The rider, on a phone: set a password from the emailed link ──
await new Promise((r) => setTimeout(r, 500));
const log = readFileSync(API_LOG, 'utf8');
const link = [...log.matchAll(/to=(\S+) template=rider-invite[\s\S]*?(http\S+\/dispatch\/invite\?token=\S+)/g)].filter((m) => m[1] === RIDER).pop()?.[2];
check('The invite email (printed until MAIL_* is set) carries the link', !!link);
const riderCtx = await context(phone);
const rider = await riderCtx.newPage();
await rider.goto(link);
await rider.getByText('Welcome, Musa').waitFor();
await rider.getByLabel('Password', { exact: true }).fill(PASSWORD);
await rider.getByLabel('Password again').fill(PASSWORD);
await rider.waitForTimeout(300);
await shot(rider, 'phone-rider-invite', false);
await rider.getByRole('button', { name: 'Set password and start' }).click();
await rider.waitForURL(`${BASE}/dispatch`, { timeout: 20000 });
check('The rider sets a password, which confirms the email and signs them in', sql(`select "emailVerifiedAt" is not null from "User" where email = '${RIDER}'`) === 't');
const riderId = sql(`select id from "User" where email = '${RIDER}'`);

// ── Buyer, on a phone: two stores by rider, paid ──
const buyerCtx = await context(phone);
const tobi = await buyerCtx.newPage();
await signIn(tobi, BUYER, PASSWORD, `${BASE}/`);
async function freshCart(items) {
  const cart = (await (await tobi.request.get(`${BASE}/api/cart`)).json()).data;
  for (const g of cart.groups) for (const i of g.items) await tobi.request.delete(`${BASE}/api/cart/items/${i.id}`);
  for (const body of items) {
    const res = await tobi.request.put(`${BASE}/api/cart/items`, { data: body });
    if (!res.ok()) throw new Error(`cart ${res.status()} ${await res.text()}`);
  }
}
const pants = (await (await tobi.request.get(`${BASE}/api/listings/${PANTS}`)).json()).data;
const medium = pants.variants.find((v) => v.label === 'M');
async function payFor(items, choose) {
  await freshCart(items);
  await tobi.goto(`${BASE}/checkout`);
  await choose();
  await tobi.getByRole('radio', { name: 'Card' }).click();
  await tobi.getByRole('button', { name: /Proceed to Pay/ }).click();
  await tobi.waitForURL(/checkout\.paystack\.com\/walk-CM_/, { timeout: 20000 });
  const reference = new URL(tobi.url()).pathname.replace('/walk-', '');
  const orderId = reference.split('_')[1];
  const total = Number(sql(`select "totalKobo" from "Order" where id = '${orderId}'`));
  const status = await webhook('charge.success', { reference, status: 'success', amount: total, currency: 'NGN', channel: 'card', fees: 0, paid_at: new Date().toISOString() });
  if (status !== 200) throw new Error(`webhook ${status}`);
  return orderId;
}
const orderId = await payFor(
  [
    { listingId: LAMP, quantity: 1 },
    { listingId: PANTS, variantId: medium.id, quantity: 1 },
  ],
  async () => {
    await tobi.getByRole('option', { name: 'Faculty of Science' }).waitFor({ state: 'attached' });
    await tobi.getByLabel('Place on campus').selectOption({ label: 'Faculty of Science' });
  },
);
const jobId = sql(`select id from "DeliveryJob" where "orderId" = '${orderId}'`);
const so = Object.fromEntries(
  sql(`select u.email || '|' || so.id || '|' || so.code || '|' || so."collectionCode" from "SellerOrder" so join "User" u on u.id = so."sellerId" where so."orderId" = '${orderId}'`)
    .split('\n')
    .map((l) => l.split('|'))
    .map(([email, id, code, collectionCode]) => [email, { id, code, collectionCode }]),
);
check('Paying for two stores by rider opens one job (DF7, DF8)', !!jobId && sql(`select count(*) from "DeliveryJob" where "orderId" = '${orderId}'`) === '1');
check('The new rider is told about the job (DX2)', sql(`select count(*) from "Notification" where "userId" = '${riderId}' and type = 'NEW_JOB' and data->>'link' = '/dispatch/jobs/${jobId}'`) === '1');

// ── Rider: see the job, areas only, then accept it ──
await rider.goto(`${BASE}/dispatch`);
await rider.getByRole('tab', { name: 'Available' }).waitFor();
await rider.locator(`a[href="/dispatch/jobs/${jobId}"]`).waitFor();
await rider.waitForTimeout(300);
await shot(rider, 'phone-rider-available-jobs', false);
await rider.goto(`${BASE}/dispatch/jobs/${jobId}`);
await rider.getByRole('button', { name: 'Accept job' }).waitFor();
const before = await rider.locator('main').innerText();
check('Before accepting, only the areas show: no store names, addresses or buyer phone (C6)', !before.includes('Chidi Gadgets') && !before.includes('801 234') && before.includes('Faculty of Science'));
await rider.waitForTimeout(300);
await shot(rider, 'phone-rider-job-before-accepting');
await rider.getByRole('button', { name: 'Accept job' }).click();
await rider.getByRole('region', { name: /Chidi Gadgets/ }).waitFor();
await rider.waitForTimeout(400);
await shot(rider, 'phone-rider-job-accepted');
check('Accepting sets an arrival window per store (DF8b)', sql(`select count(*) from "SellerOrder" where "orderId" = '${orderId}' and "fulfillmentStatus" = 'RIDER_ASSIGNED' and "arrivalFrom" is not null`) === '2');

// ── Seller Chidi: the rider's name and window, and the code as a QR ──
const chidiCtx = await context(phone);
const chidi = await chidiCtx.newPage();
await chidi.request.post(`${BASE}/api/auth/login`, { data: { email: CHIDI, password: PASSWORD } });
await chidi.goto(`${BASE}/sellers/orders`);
await chidi.getByText(so[CHIDI].code).first().waitFor();
await chidi.waitForTimeout(400);
await shot(chidi, 'phone-seller-orders-rider-coming', false);
check('The seller sees the rider’s name and when they come (DX8, DF8b)', (await chidi.getByText(/Musa Bello comes/).count()) > 0);
await chidi.goto(`${BASE}/sellers/orders/${so[CHIDI].id}`);
await chidi.getByRole('img', { name: `QR code for ${so[CHIDI].code}` }).waitFor();
await chidi.waitForTimeout(300);
await shot(chidi, 'phone-seller-order-code-qr');
check('The seller’s order shows the CM- code with a QR for the rider', true);

// ── Rider at the stores: Chidi by code; Amaka not ready, then collected ──
const chidiStop = rider.getByRole('region', { name: /Chidi Gadgets/ });
await chidiStop.getByLabel("Store's order code").fill(so[CHIDI].code.toLowerCase().replace('cm-', ''));
await chidiStop.getByRole('button', { name: 'Collect' }).click();
await chidiStop.getByLabel(/Buyer's code for/).waitFor();
check('At the seller the rider types the CM- code; the parcel is with the rider (DX5)', sql(`select "fulfillmentStatus" from "SellerOrder" where id = '${so[CHIDI].id}'`) === 'WITH_RIDER');
const amakaStop = rider.getByRole('region', { name: /Amaka Styles/ });
await amakaStop.getByRole('button', { name: /Not ready, or the seller isn't there/ }).click();
await rider.getByRole('dialog').getByLabel('Note (optional)').fill('Shop closed for lunch');
await rider.waitForTimeout(300);
await shot(rider, 'phone-rider-store-not-ready', false);
await rider.getByRole('dialog').getByRole('button', { name: 'Report and carry on' }).click();
await amakaStop.getByText(/You reported it not ready/).waitFor();
check('A store not ready is reported and the seller told (DF11)', sql(`select count(*) from "Notification" n join "User" u on u.id = n."userId" where u.email = '${AMAKA}' and n.type = 'STORE_NOT_READY'`) >= '1');
await amakaStop.getByLabel("Store's order code").fill(so[AMAKA].code);
await amakaStop.getByRole('button', { name: 'Collect' }).click();
await amakaStop.getByLabel(/Buyer's code for/).waitFor();

// ── Buyer: the codes show now the rider has the parcels (C7) ──
await tobi.goto(`${BASE}/orders/${orderId}`);
await tobi.getByText('Your rider: Musa Bello').first().waitFor();
await tobi.waitForTimeout(400);
await shot(tobi, 'phone-buyer-order-codes');
check(
  'The buyer sees a handover code per store and the rider’s name only (C7, DX8)',
  (await tobi.getByText(so[CHIDI].collectionCode, { exact: true }).count()) === 1 && (await tobi.getByText(so[AMAKA].collectionCode, { exact: true }).count()) === 1,
);

// ── Rider at the buyer: a wrong code, then the right ones ──
const wrong = so[CHIDI].collectionCode === '999' ? '998' : '999';
await chidiStop.getByLabel(/Buyer's code for/).fill(wrong);
await chidiStop.getByRole('button', { name: 'Hand over' }).click();
await chidiStop.getByText(/4 tries left/).waitFor();
check('A wrong buyer code is refused, with the tries left (F5)', true);
await chidiStop.getByLabel(/Buyer's code for/).fill(so[CHIDI].collectionCode);
await chidiStop.getByRole('button', { name: 'Hand over' }).click();
await chidiStop.getByText(/^Delivered /).waitFor();
await amakaStop.getByLabel(/Buyer's code for/).fill(so[AMAKA].collectionCode);
await amakaStop.getByRole('button', { name: 'Hand over' }).click();
await rider.getByText('All delivered. Thank you!').waitFor();
for (const close of await rider.getByRole('button', { name: /close|dismiss/i }).all()) await close.click().catch(() => {});
await rider.waitForTimeout(600);
await shot(rider, 'phone-rider-all-delivered');
check('Both stores delivered; the job is done and the 48-hour window runs (D11)', sql(`select status from "DeliveryJob" where id = '${jobId}'`) === 'DONE' && sql(`select count(*) from "SellerOrder" where "orderId" = '${orderId}' and "fulfillmentStatus" = 'DELIVERED' and "releaseAt" > now() + interval '47 hours'`) === '2');

// ── Buyer: a problem after handover is a dispute (C8, F6) ──
await tobi.goto(`${BASE}/orders/${orderId}`);
const amakaCard = tobi.getByRole('region', { name: 'Amaka Styles' });
await amakaCard.getByRole('button', { name: /Report a problem/ }).click();
const report = tobi.getByRole('dialog');
await report.getByLabel('Damaged').check();
await report.getByRole('textbox').fill('A seam is torn');
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-buyer-report-problem', false);
await report.getByRole('button', { name: 'Send to CampusMart' }).click();
await tobi.getByText('Problem reported').waitFor();
check('The dispute holds that store’s payout', sql(`select "fulfillmentStatus" || ',' || "escrowStatus" from "SellerOrder" where id = '${so[AMAKA].id}'`) === 'DISPUTED,HELD');

// ── Admin: decide the dispute; see the finished job ──
await admin.goto(`${BASE}/admin/disputes`);
const disputeRow = admin.getByRole('row').filter({ hasText: so[AMAKA].code });
await disputeRow.waitFor();
await admin.waitForTimeout(300);
await shot(admin, 'desktop-admin-disputes');
await disputeRow.getByRole('button', { name: 'Decide' }).click();
await admin.getByText('A seam is torn').waitFor();
await admin.getByLabel(/Release to the seller/).check();
await admin.getByLabel('Decision note').fill('Photo-free report; the seller showed the item was sound when collected.');
await admin.getByRole('button', { name: 'Save decision' }).click();
await admin.getByText(/Released to the seller/).waitFor();
await admin.waitForTimeout(300);
await shot(admin, 'desktop-admin-dispute-decided');
check('A release pays the seller now (F8)', sql(`select "escrowStatus" from "SellerOrder" where id = '${so[AMAKA].id}'`) === 'RELEASED' && sql(`select count(*) from "Payout" where "sellerOrderId" = '${so[AMAKA].id}'`) === '1');
await admin.goto(`${BASE}/admin/deliveries?view=DONE`);
await admin.getByRole('row').filter({ hasText: so[CHIDI].code }).first().waitFor();
await admin.waitForTimeout(300);
await shot(admin, 'desktop-admin-deliveries-done');
check('Admin deliveries lists the finished job with its rider', (await admin.getByRole('row').filter({ hasText: 'Musa Bello' }).count()) > 0);

// ── Pickup from the seller: the seller enters the buyer's code (DL5) ──
const pickupOrder = await payFor([{ listingId: PANTS, variantId: medium.id, quantity: 1 }], async () => {
  await tobi.getByRole('radiogroup', { name: 'How Amaka Styles reaches you' }).getByRole('radio', { name: 'Pick up from the seller' }).click();
});
const pickup = sql(`select id || '|' || "collectionCode" from "SellerOrder" where "orderId" = '${pickupOrder}'`).split('|');
check('A pickup order opens no job', sql(`select count(*) from "DeliveryJob" where "orderId" = '${pickupOrder}'`) === '0');
await tobi.goto(`${BASE}/orders/${pickupOrder}`);
await tobi.getByText(pickup[1], { exact: true }).waitFor();
check('The buyer has the pickup code as soon as it’s paid (C7)', true);
const amakaCtx = await context(phone);
const amaka = await amakaCtx.newPage();
await amaka.request.post(`${BASE}/api/auth/login`, { data: { email: AMAKA, password: PASSWORD } });
await amaka.goto(`${BASE}/sellers/orders/${pickup[0]}`);
await amaka.getByLabel('Buyer’s code').fill(pickup[1]);
await amaka.waitForTimeout(300);
await shot(amaka, 'phone-seller-pickup-handover', false);
await amaka.getByRole('button', { name: 'Hand over' }).click();
await amaka.getByText('Handed over').first().waitFor();
check('The seller enters the buyer’s code and the order is collected', sql(`select "fulfillmentStatus" from "SellerOrder" where id = '${pickup[0]}'`) === 'COLLECTED');

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
