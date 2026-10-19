// Phase 5 browser walk only: preloaded into the local API (`node -r ./paystack-stub.cjs dist/main`)
// so every call to https://api.paystack.co gets a canned answer and nothing reaches real Paystack.
// The walk uses a made-up secret (PAYSTACK_SECRET_KEY=sk_test_walk_local_only) to sign webhooks.
const realFetch = globalThis.fetch;
const HOST = 'https://api.paystack.co';
const amounts = new Map(); // reference -> kobo, remembered from initialize for verify
let refundId = 9000;

const ok = (data, message = 'ok') =>
  new Response(JSON.stringify({ status: true, message, data }), { status: 200, headers: { 'content-type': 'application/json' } });
const no = (status, message) =>
  new Response(JSON.stringify({ status: false, message }), { status, headers: { 'content-type': 'application/json' } });

function answer(method, url, body) {
  const path = url.pathname;
  if (method === 'POST' && path === '/transaction/initialize') {
    amounts.set(body.reference, body.amount);
    return ok({ authorization_url: `https://checkout.paystack.com/walk-${body.reference}`, access_code: 'walk', reference: body.reference }, 'Authorization URL created');
  }
  if (method === 'GET' && path.startsWith('/transaction/verify/')) {
    const reference = decodeURIComponent(path.slice('/transaction/verify/'.length));
    if (!amounts.has(reference)) return no(404, 'Transaction reference not found');
    const amount = amounts.get(reference);
    return ok({ reference, status: 'success', amount, currency: 'NGN', channel: 'card', fees: Math.min(Math.round(amount * 0.015), 200000), paid_at: new Date().toISOString() });
  }
  if (method === 'GET' && path === '/bank') {
    return ok([
      { name: 'Access Bank', code: '044' },
      { name: 'Guaranty Trust Bank', code: '058' },
      { name: 'Opay', code: '999992' },
    ]);
  }
  if (method === 'GET' && path === '/bank/resolve') {
    const number = url.searchParams.get('account_number');
    if (number === '0000000000') return no(422, 'Could not resolve account name. Check parameters or try again.');
    return ok({ account_number: number, account_name: 'CHIDI OKAFOR' });
  }
  if (method === 'POST' && path === '/transferrecipient') return ok({ recipient_code: `RCP_walk_${body.account_number.slice(-4)}` });
  if (method === 'POST' && path === '/transfer') return ok({ transfer_code: `TRF_walk_${body.reference}`, status: 'pending' });
  if (method === 'POST' && path === '/refund') return ok({ id: ++refundId, status: 'pending' });
  return no(404, `Stub has no answer for ${method} ${path}`);
}

globalThis.fetch = async (input, init = {}) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!href.startsWith(HOST)) {
    if (/paystack/i.test(href)) throw new Error(`paystack-stub: refusing ${href}`);
    return realFetch(input, init);
  }
  const url = new URL(href);
  const method = (init.method ?? 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body) : undefined;
  const res = answer(method, url, body);
  console.error(`[paystack-stub] ${method} ${url.pathname} -> ${res.status}`);
  return res;
};
