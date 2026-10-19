// Phase 5 browser walk: Chromium -> next start (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000)
// -> local campusmart_dev. The API runs with PAYMENTS_ENABLED=true, a made-up key and paystack-stub.cjs
// preloaded, so every Paystack call gets a canned answer; nothing reaches real Paystack. The browser's
// trip to checkout.paystack.com is answered by Playwright, and the walk plays Paystack by sending
// signed webhooks, as Paystack would.
// Accounts (local dev only): admin@campusmart.test, sellers chidi.store@ and amaka.store@, buyer tobi.buyer@.
// Run: node payments-walk.mjs <shots dir> <repo>/public <api log>
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium, request as apiRequest } from '/opt/node22/lib/node_modules/playwright/index.mjs';

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
const LAMP = 'ed3d603d-dfc8-4c38-8bc5-8e09d844a13d'; // Chidi Gadgets, rider only
const PANTS = '49ce6c55-4c06-4df9-a673-72328e0bf031'; // Amaka Styles, pickup allowed

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();
const stubCalls = (pattern) => readFileSync(API_LOG, 'utf8').split('\n').filter((l) => l.includes('[paystack-stub]') && l.includes(pattern)).length;

// Plays Paystack: a webhook signed with the walk's key
async function webhook(event, data, signature) {
  const body = JSON.stringify({ event, data });
  const sig = signature ?? createHmac('sha512', SECRET).update(body).digest('hex');
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
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => localStorage.setItem('pwa_prompt_dismissed', 'true'));
  let n = 0;
  await ctx.route('**/_next/image**', (route) =>
    route.fulfill({ path: `${PUBLIC}/${n++ % 2 ? 'subImg.jpg' : 'mainImg.jpg'}`, contentType: 'image/jpeg' }),
  );
  // Paystack's hosted page, answered locally
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

// Repeatable on the dev database: Chidi starts without a payout account, and both listings in stock
sql(`update "SellerProfile" set "payoutBankName" = null, "payoutBankCode" = null, "payoutAccountLast4" = null, "payoutAccountName" = null, "paystackRecipientCode" = null, "payoutAccountChangedAt" = null where "userId" = (select id from "User" where email = '${CHIDI}')`);
sql(`update "Listing" set stock = 10, status = 'ACTIVE' where id = '${LAMP}'`);
sql(`update "ListingVariant" set stock = 5 where "listingId" = '${PANTS}' and label = 'M'`);

// ── Admin, on a laptop: the platform fee and deadline ──
const adminCtx = await context({ viewport: { width: 1366, height: 900 } });
const admin = await adminCtx.newPage();
await signIn(admin, 'admin@campusmart.test', ADMIN_PASSWORD, '**/admin');
await admin.goto(`${BASE}/admin/settings`);
await admin.getByRole('heading', { name: 'Platform fee and deadlines' }).waitFor();
await admin.getByLabel('Platform fee (%)').fill('2.5');
await admin.getByRole('button', { name: 'Save settings' }).click();
await admin.getByText('Settings saved').waitFor();
await admin.waitForTimeout(400);
await shot(admin, 'desktop-settings-platform-fee');
const audited = sql(`select meta->>'to' from "AuditLog" where action = 'SETTING_CHANGED' order by "createdAt" desc limit 1`);
check('An admin changes the platform fee; the change is audited', audited.includes('250'), audited);
// Back to 0 (decision P1) before anyone pays
await admin.getByLabel('Platform fee (%)').fill('0');
await admin.getByRole('button', { name: 'Save settings' }).click();
await admin.getByText('Settings saved').last().waitFor();
check('The fee is back at 0% for the rest of the walk', (await (await admin.request.get(`${BASE}/api/admin/settings`)).json()).data.platformFeeBps === 0);

// ── Webhook guard ──
check('A webhook with a bad signature gets 401', (await webhook('charge.success', { reference: 'CM_x_1' }, 'bad')) === 401);

// ── Buyer, on a phone: pay by card, Paystack's webhook marks it paid ──
const amakaApi = await apiRequest.newContext({ baseURL: `${API}/` });
if (!(await amakaApi.post('auth/login', { data: { email: AMAKA, password: PASSWORD } })).ok()) throw new Error('Amaka sign-in failed');
await amakaApi.patch('sellers/me', {
  data: { pickupArea: 'Moremi Hall', pickupAddress: 'Room 12, Block B, Moremi Hall', contactPhone: '+234 809 000 0000', allowsPickup: true },
});

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
const toPaystack = () => tobi.waitForURL(/checkout\.paystack\.com\/walk-CM_/, { timeout: 20000 });
const referenceFrom = (url) => new URL(url).pathname.replace('/walk-', '');

await freshCart([{ listingId: LAMP, quantity: 1 }]);
await tobi.goto(`${BASE}/checkout`);
await tobi.getByRole('option', { name: 'Faculty of Science' }).waitFor({ state: 'attached' });
check(
  'Checkout offers card and bank transfer only; OPay and PalmPay stay hidden (P5)',
  (await tobi.getByRole('radio', { name: 'Card' }).count()) === 1 &&
    (await tobi.getByRole('radio', { name: 'Bank transfer' }).count()) === 1 &&
    (await tobi.getByRole('radio', { name: 'OPay' }).count()) === 0 &&
    (await tobi.getByRole('radio', { name: 'PalmPay' }).count()) === 0 &&
    (await tobi.getByText(/Online payment isn't switched on yet/).count()) === 0,
);
await tobi.getByLabel('Place on campus').selectOption({ label: 'Faculty of Science' });
await tobi.getByRole('radio', { name: 'Card' }).click();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-checkout-payment-choices');
await tobi.getByRole('button', { name: /Proceed to Pay/ }).click();
await toPaystack();
const ref1 = referenceFrom(tobi.url());
const order1Id = ref1.split('_')[1];
const order1 = (await (await tobi.request.get(`${BASE}/api/orders/${order1Id}`)).json()).data;
check('Checkout sends the buyer to Paystack for the order total, reference CM_<order>_1', ref1.endsWith('_1') && stubCalls('POST /transaction/initialize') >= 1, `${ref1}, ₦${order1.totalKobo / 100}`);

// Paystack confirms by webhook, then sends the buyer back
const charge = (reference, amount) => ({ reference, status: 'success', amount, currency: 'NGN', channel: 'card', fees: 15_000, paid_at: new Date().toISOString() });
check('The signed charge.success webhook is accepted', (await webhook('charge.success', charge(ref1, order1.totalKobo))) === 200);
check('A replay of the same webhook changes nothing', (await webhook('charge.success', charge(ref1, order1.totalKobo))) === 200 && sql(`select count(*) from "AuditLog" where action = 'ORDER_PAID' and "entityId" = '${order1Id}'`) === '1');
await tobi.goto(`${BASE}/order-confirmation?orderId=${order1Id}&trxref=${ref1}&reference=${ref1}`);
await tobi.getByText('Payment received').waitFor({ timeout: 15000 });
await tobi.waitForTimeout(400);
await shot(tobi, 'phone-confirmation-paid');
check('The confirmation page shows the order paid, with each store code', (await tobi.getByText(order1.sellerOrders[0].code).count()) === 1);
const so1 = sql(`select "escrowStatus" || ',' || "fulfillmentStatus" || ',' || ("pickupDeadline" is not null) from "SellerOrder" where "orderId" = '${order1Id}'`);
check('Escrow is HELD and the dispatch order waits for a rider, with a deadline (DL7b)', so1 === 'HELD,AWAITING_RIDER,true', so1);
check(
  'The seller is told about the new order and the buyer about the payment',
  sql(`select count(*) from "Notification" n join "User" u on u.id = n."userId" where n.type = 'NEW_ORDER' and u.email = '${CHIDI}' and n.title like '%${order1.sellerOrders[0].code}%'`) === '1' &&
    sql(`select count(*) from "Notification" n join "User" u on u.id = n."userId" where n.type = 'ORDER_PAID' and u.email = '${BUYER}' and n."createdAt" > now() - interval '5 minutes'`) >= '1',
);
await tobi.goto(`${BASE}/orders/${order1Id}`);
await tobi.getByText(/Waiting for a rider/).waitFor();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-order-paid-awaiting-rider');
check('The order page says it waits for a rider', true);

// ── Bank transfer, pickup: no webhook arrives, the confirmation page asks Paystack after 10 s ──
const pants = (await (await tobi.request.get(`${BASE}/api/listings/${PANTS}`)).json()).data;
const medium = pants.variants.find((v) => v.label === 'M');
await freshCart([{ listingId: PANTS, variantId: medium.id, quantity: 1 }]);
await tobi.goto(`${BASE}/checkout`);
const amakaChoice = tobi.getByRole('radiogroup', { name: 'How Amaka Styles reaches you' });
await amakaChoice.getByRole('radio', { name: 'Pick up from the seller' }).click();
await tobi.getByRole('radio', { name: 'Bank transfer' }).click();
await tobi.getByRole('button', { name: /Proceed to Pay/ }).click();
await toPaystack();
const ref2 = referenceFrom(tobi.url());
const order2Id = ref2.split('_')[1];
const verifiesBefore = stubCalls('GET /transaction/verify/');
await tobi.goto(`${BASE}/order-confirmation?orderId=${order2Id}&trxref=${ref2}&reference=${ref2}`);
await tobi.getByText('Confirming your payment…').waitFor();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-confirmation-confirming', false);
await tobi.getByText('Payment received').waitFor({ timeout: 25000 });
check('With no webhook, the page asks Paystack once after 10 seconds and shows it paid (guide 5.3)', stubCalls('GET /transaction/verify/') === verifiesBefore + 1);
await tobi.goto(`${BASE}/orders/${order2Id}`);
await tobi.getByText('Room 12, Block B, Moremi Hall').waitFor();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-order-paid-pickup');
const so2 = sql(`select "fulfillmentStatus" from "SellerOrder" where "orderId" = '${order2Id}'`);
check("Once paid, the pickup store's address shows and the order waits for the buyer", so2 === 'AWAITING_PICKUP', so2);

// ── Abandoned payment: Pay now on the order page opens a fresh Paystack page (P7) ──
await freshCart([{ listingId: LAMP, quantity: 1 }]);
await tobi.goto(`${BASE}/checkout`);
await tobi.getByRole('option', { name: 'Faculty of Science' }).waitFor({ state: 'attached' });
await tobi.getByLabel('Place on campus').selectOption({ label: 'Faculty of Science' });
await tobi.getByRole('radio', { name: 'Card' }).click();
await tobi.getByRole('button', { name: /Proceed to Pay/ }).click();
await toPaystack();
const order3Id = referenceFrom(tobi.url()).split('_')[1];
await tobi.goto(`${BASE}/orders/${order3Id}`);
const payNow = tobi.getByRole('button', { name: /^Pay .* now$/ });
await payNow.waitFor();
await tobi.waitForTimeout(300);
await shot(tobi, 'phone-order-pay-now');
await payNow.click();
await toPaystack();
const ref3b = referenceFrom(tobi.url());
check('Pay now starts a new payment with a new reference (attempt 2)', ref3b === `CM_${order3Id}_2`, ref3b);
await tobi.goto(`${BASE}/orders/${order3Id}`);
await tobi.getByRole('button', { name: 'Cancel order' }).click();
await tobi.getByRole('button', { name: 'Yes, cancel it' }).click();
await tobi.getByText('Order cancelled').waitFor();

// ── Seller Chidi, on a phone: payout account ──
const sellerCtx = await context(phone);
const chidi = await sellerCtx.newPage();
await chidi.request.post(`${BASE}/api/auth/login`, { data: { email: CHIDI, password: PASSWORD } });
await chidi.goto(`${BASE}/sellers`);
const banner = chidi.getByText('Add a payout account');
const bannerShown = await banner.waitFor({ timeout: 10000 }).then(() => true, () => false);
await chidi.waitForTimeout(300);
await shot(chidi, 'phone-seller-dashboard-payout-banner', false);
check('The dashboard asks for a payout account until there is one', bannerShown);

await chidi.goto(`${BASE}/sellers/earnings`);
const card = chidi.getByRole('region', { name: 'Payout account' });
await card.waitFor();
await chidi.getByText('No payouts yet').waitFor();
await card.getByRole('button', { name: 'Add account' }).click();
await chidi.getByRole('option', { name: 'Guaranty Trust Bank' }).waitFor({ state: 'attached' });
await chidi.getByLabel('Bank').selectOption({ label: 'Guaranty Trust Bank' });
await chidi.getByLabel('Account number').fill('0000000000');
await chidi.getByRole('button', { name: 'Save account' }).click();
await chidi.getByText(/couldn't confirm that account with your bank/).waitFor();
await chidi.waitForTimeout(300);
await shot(chidi, 'phone-seller-payout-account-rejected', false);
check("An account the bank can't resolve is refused with a plain message", true);
await chidi.getByLabel('Account number').fill('0123456789');
await chidi.getByRole('button', { name: 'Save account' }).click();
await chidi.getByText('Payout account saved').waitFor();
await card.getByText('Guaranty Trust Bank ••6789').waitFor();
await chidi.waitForTimeout(400);
await shot(chidi, 'phone-seller-earnings-account-hold');
const stored = sql(`select "payoutBankCode" || ',' || "payoutAccountLast4" || ',' || "payoutAccountName" || ',' || "paystackRecipientCode" from "SellerProfile" sp join "User" u on u.id = sp."userId" where u.email = '${CHIDI}'`);
check('Only the bank, last 4 digits, name and recipient are stored', stored === '058,6789,CHIDI OKAFOR,RCP_walk_6789' && !sql(`select row_to_json(sp)::text from "SellerProfile" sp join "User" u on u.id = sp."userId" where u.email = '${CHIDI}'`).includes('0123456789'), stored);
check('The change pauses payouts for 24 hours and is said so (P9)', (await card.getByText(/Payouts start again/).count()) === 1 && sql(`select count(*) from "Notification" n join "User" u on u.id = n."userId" where n.type = 'PAYOUT_ACCOUNT_CHANGED' and u.email = '${CHIDI}'`) >= '1');
await chidi.goto(`${BASE}/sellers`);
await chidi.waitForTimeout(1500);
check('With an account set, the dashboard banner is gone', (await chidi.getByText('Add a payout account').count()) === 0);

// ── A payout for Amaka that fails, then an admin retries it ──
// Amaka's account was set two days ago, so no 24-hour hold applies
await amakaApi.post('sellers/me/payout-account', { data: { bankCode: '044', accountNumber: '0987654321' } });
sql(`update "SellerProfile" set "payoutAccountChangedAt" = now() - interval '2 days' where "userId" = (select id from "User" where email = '${AMAKA}')`);
// Handover is Phase 6, so the walk marks Amaka's order collected and released, as the 15-minute
// job does after 48 hours (that job is covered by the e2e tests), with its transfer under way
const so2Row = sql(`select id || '|' || "sellerId" || '|' || "sellerPayoutKobo" || '|' || code from "SellerOrder" where "orderId" = '${order2Id}'`).split('|');
sql(`update "SellerOrder" set "fulfillmentStatus" = 'COLLECTED', "collectedAt" = now() - interval '49 hours', "releaseAt" = now() - interval '1 hour', "escrowStatus" = 'RELEASED' where id = '${so2Row[0]}'`);
const poRef = `PO_${so2Row[0]}_1`;
sql(`insert into "Payout" (id, "sellerOrderId", "sellerId", "amountKobo", status, reference, "transferCode", "updatedAt") values (gen_random_uuid(), '${so2Row[0]}', '${so2Row[1]}', ${so2Row[2]}, 'PROCESSING', '${poRef}', 'TRF_walk_first', now())`);
check('Paystack reports the transfer failed (signed transfer.failed webhook)', (await webhook('transfer.failed', { reference: poRef, reason: 'Account is invalid' })) === 200);
check('The failure is recorded and every admin is alerted', sql(`select status || ',' || "failureReason" from "Payout" where reference = '${poRef}'`) === 'FAILED,Account is invalid' && sql(`select count(*) from "Notification" n join "User" u on u.id = n."userId" where n.type = 'PAYOUT_FAILED' and u.role = 'ADMIN'`) >= '1');

await admin.goto(`${BASE}/admin/payouts`);
const row = admin.getByRole('row').filter({ hasText: so2Row[3] });
await row.waitFor();
await admin.waitForTimeout(400);
await shot(admin, 'desktop-admin-payouts-failed');
check('Admin payouts lists the failed payout with its reason', (await row.getByText('Account is invalid').count()) === 1);
await row.getByRole('button', { name: 'Retry' }).click();
await admin.getByRole('button', { name: 'Retry payout' }).click();
await admin.getByText('Payout sent again').waitFor();
const retried = sql(`select status || ',' || attempt || ',' || reference from "Payout" where "sellerOrderId" = '${so2Row[0]}'`);
check('Retry sends it again with a new reference, and is audited', retried === `PROCESSING,2,PO_${so2Row[0]}_2` && sql(`select count(*) from "AuditLog" where action = 'PAYOUT_RETRIED'`) >= '1', retried);
check('Paystack confirms the transfer (signed transfer.success webhook)', (await webhook('transfer.success', { reference: `PO_${so2Row[0]}_2` })) === 200);
await admin.goto(`${BASE}/admin/payouts?status=PAID`);
await admin.getByRole('row').filter({ hasText: so2Row[3] }).waitFor();
await admin.waitForTimeout(400);
await shot(admin, 'desktop-admin-payouts-paid');
check('The payout shows as paid', sql(`select status from "Payout" where "sellerOrderId" = '${so2Row[0]}'`) === 'PAID');

const amakaCtx = await context(phone);
const amaka = await amakaCtx.newPage();
await amaka.request.post(`${BASE}/api/auth/login`, { data: { email: AMAKA, password: PASSWORD } });
await amaka.goto(`${BASE}/sellers/earnings`);
await amaka.getByRole('listitem').filter({ hasText: so2Row[3] }).getByText('Paid', { exact: true }).waitFor();
await amaka.waitForTimeout(400);
await shot(amaka, 'phone-seller-earnings-paid');
check("Amaka's earnings show the payout as paid, and she was told", sql(`select count(*) from "Notification" n join "User" u on u.id = n."userId" where n.type = 'PAYOUT_PAID' and u.email = '${AMAKA}'`) >= '1');

await browser.close();
await amakaApi.dispose();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
