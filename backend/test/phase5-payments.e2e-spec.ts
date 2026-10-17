import { createHmac, randomUUID } from 'crypto';
import nock from 'nock';
import request from 'supertest';
import {
  DisputeStatus,
  EscrowStatus,
  Fault,
  FulfillmentStatus,
  OrderStatus,
  PayoutStatus,
  RefundStatus,
  UserRole,
} from '../src/generated/prisma/enums';

// Payments are on for this suite, against a fake key; every Paystack call is answered by nock and
// nothing may leave the machine. The env is set before the app module loads (utils is imported in
// beforeAll for that reason).
const SECRET = 'sk_test_campusmart_e2e_not_real';
process.env.PAYMENTS_ENABLED = 'true';
process.env.PAYSTACK_SECRET_KEY = SECRET;
process.env.APP_URL = 'https://campusmart.test';

type Utils = typeof import('./utils');
type Fixtures = typeof import('./commerce-fixtures');
type Agent = Awaited<ReturnType<Utils['signIn']>>;

const PAYSTACK = 'https://api.paystack.co';
const PHONE = '+234 801 234 5678';
const FEE = 50_000;
const sign = (body: string) =>
  createHmac('sha512', SECRET).update(body).digest('hex');

describe('Phase 5 payments, escrow and refunds (e2e)', () => {
  let utils: Utils;
  let fx: Fixtures;
  let ctx: Awaited<ReturnType<Utils['createTestApp']>>;
  let payouts: import('../src/payments/payouts.service').PayoutsService;
  let refunds: import('../src/payments/refunds.service').RefundsService;
  let expiry: import('../src/orders/order-expiry.service').OrderExpiryService;

  beforeAll(async () => {
    utils = await import('./utils');
    fx = await import('./commerce-fixtures');
    ctx = await utils.createTestApp();
    payouts = ctx.app.get(
      (await import('../src/payments/payouts.service')).PayoutsService,
    );
    refunds = ctx.app.get(
      (await import('../src/payments/refunds.service')).RefundsService,
    );
    expiry = ctx.app.get(
      (await import('../src/orders/order-expiry.service')).OrderExpiryService,
    );
    nock.disableNetConnect();
    nock.enableNetConnect(/127\.0\.0\.1|localhost/);
  });

  beforeEach(async () => {
    nock.cleanAll();
    await utils.truncateAll(ctx.prisma);
    utils.resetRateLimits(ctx.app);
  });

  afterEach(() => {
    // Every Paystack call a test set up must have happened
    expect(nock.pendingMocks()).toEqual([]);
  });

  afterAll(async () => {
    nock.enableNetConnect();
    await ctx.app.close();
  });

  async function world() {
    const school = await fx.createSchool(ctx.prisma);
    await ctx.prisma.institution.update({
      where: { id: school.id },
      data: { deliveryFeeKobo: FEE },
    });
    const place = await fx.createCampusPlace(ctx.prisma, school.id);
    const ada = await fx.createSeller(ctx.prisma, school.id, 'Ada Wears', {
      allowsPickup: true,
    });
    const tunde = await fx.createSeller(ctx.prisma, school.id, 'Tunde Tech');
    const buyer = await utils.createUser(ctx.prisma, {
      institutionId: school.id,
    });
    const agent = await utils.signIn(ctx.app, buyer.email);
    const dress = await fx.createListing(ctx.prisma, ada, {
      title: 'Ankara dress',
      priceKobo: 1_200_000,
      stock: 3,
    });
    const lamp = await fx.createListing(ctx.prisma, tunde, {
      priceKobo: 450_000,
      stock: 3,
    });
    return { school, place, ada, tunde, buyer, agent, dress, lamp };
  }

  const add = (agent: Agent, listingId: string, quantity = 1) =>
    agent.put('/api/cart/items').send({ listingId, quantity }).expect(200);

  // Paystack's initialize, answering with a payment page for whatever reference was sent
  const expectInitialize = (check?: (body: Record<string, unknown>) => void) =>
    nock(PAYSTACK)
      .post('/transaction/initialize', (body: Record<string, unknown>) => {
        check?.(body);
        return true;
      })
      .reply(200, (_uri, body: Record<string, unknown>) => ({
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: `https://checkout.paystack.com/${String(body.reference)}`,
          access_code: 'ac',
          reference: body.reference,
        },
      }));

  // Ada's dress picked up by the buyer, Tunde's lamp by rider to a campus place
  async function placeOrder(
    w: Awaited<ReturnType<typeof world>>,
    key = randomUUID(),
  ) {
    await add(w.agent, w.dress.id);
    await add(w.agent, w.lamp.id);
    expectInitialize();
    const res = await w.agent
      .post('/api/orders/checkout')
      .send({
        stores: [
          { sellerId: w.ada.id, method: 'SELLER_PICKUP' },
          { sellerId: w.tunde.id, method: 'DISPATCH' },
        ],
        destination: { campusPlaceId: w.place.id },
        phone: PHONE,
        paymentMethod: 'CARD',
        idempotencyKey: key,
      })
      .expect(201);
    return res.body.data as {
      orderId: string;
      totalKobo: number;
      authorizationUrl: string;
      reference: string;
    };
  }

  const webhook = (payload: object, signature?: string) => {
    const body = JSON.stringify(payload);
    return request(ctx.app.getHttpServer())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature ?? sign(body))
      .send(body);
  };

  const chargeSuccess = (
    reference: string,
    amount: number,
    overrides: object = {},
  ) => ({
    event: 'charge.success',
    data: {
      reference,
      status: 'success',
      amount,
      currency: 'NGN',
      channel: 'card',
      fees: 30_000,
      paid_at: new Date().toISOString(),
      ...overrides,
    },
  });

  // Both seller orders are created in one transaction, so their order isn't fixed: find them by
  // seller. Ada offers pickup; Tunde's goes by dispatch.
  const split = <T extends { sellerId: string }>(
    rows: T[],
    w: { ada: { id: string } },
  ): [T, T] => {
    const pickup = rows.find((s) => s.sellerId === w.ada.id);
    const dispatch = rows.find((s) => s.sellerId !== w.ada.id);
    if (!pickup || !dispatch) throw new Error('Expected two seller orders');
    return [pickup, dispatch];
  };

  const orderOf = (id: string) =>
    ctx.prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        sellerOrders: { orderBy: { createdAt: 'asc' } },
        payments: true,
      },
    });

  describe('checkout and the webhook (guide checklist)', () => {
    it('starts a Paystack payment for the order total, and a resent checkout gets the same page', async () => {
      const w = await world();
      const key = randomUUID();
      await add(w.agent, w.dress.id);
      await add(w.agent, w.lamp.id);
      let sent: Record<string, unknown> = {};
      expectInitialize((body) => (sent = body));
      const body = {
        stores: [
          { sellerId: w.ada.id, method: 'SELLER_PICKUP' },
          { sellerId: w.tunde.id, method: 'DISPATCH' },
        ],
        destination: { campusPlaceId: w.place.id },
        phone: PHONE,
        paymentMethod: 'CARD',
        idempotencyKey: key,
      };
      const first = (
        await w.agent.post('/api/orders/checkout').send(body).expect(201)
      ).body.data;
      expect(first.totalKobo).toBe(1_200_000 + 450_000 + FEE);
      expect(sent).toMatchObject({
        email: w.buyer.email,
        amount: first.totalKobo,
        currency: 'NGN',
        reference: `CM_${first.orderId}_1`,
        callback_url: `https://campusmart.test/order-confirmation?orderId=${first.orderId}`,
        channels: ['card'],
        metadata: { orderId: first.orderId },
      });
      expect(first).toMatchObject({
        paymentsEnabled: true,
        reference: `CM_${first.orderId}_1`,
        authorizationUrl: `https://checkout.paystack.com/CM_${first.orderId}_1`,
      });

      // No second initialize is mocked: a resend must reuse the first page
      const again = (
        await w.agent.post('/api/orders/checkout').send(body).expect(201)
      ).body.data;
      expect(again).toEqual(first);
    });

    it('offers card and bank transfer only until OPay and PalmPay are confirmed (P5)', async () => {
      const w = await world();
      const config = (
        await request(ctx.app.getHttpServer())
          .get('/api/payments/config')
          .expect(200)
      ).body.data;
      expect(config).toEqual({
        paymentsEnabled: true,
        methods: ['CARD', 'BANK_TRANSFER'],
      });
      await add(w.agent, w.dress.id);
      const res = await w.agent
        .post('/api/orders/checkout')
        .send({
          stores: [{ sellerId: w.ada.id, method: 'SELLER_PICKUP' }],
          paymentMethod: 'OPAY',
          idempotencyKey: randomUUID(),
        })
        .expect(400);
      expect(res.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    });

    it('a webhook with a bad signature returns 401 and changes nothing', async () => {
      const w = await world();
      const placed = await placeOrder(w);
      const payload = chargeSuccess(placed.reference, placed.totalKobo);
      await webhook(payload, sign('something else')).expect(401);
      await webhook(payload, 'not-even-hex').expect(401);
      expect((await orderOf(placed.orderId)).status).toBe(
        OrderStatus.PENDING_PAYMENT,
      );
    });

    it('charge.success marks the order paid; replaying it changes nothing more', async () => {
      const w = await world();
      const placed = await placeOrder(w);
      const payload = chargeSuccess(placed.reference, placed.totalKobo);
      await webhook(payload).expect(200);
      await webhook(payload).expect(200);

      const order = await orderOf(placed.orderId);
      expect(order.status).toBe(OrderStatus.PAID);
      expect(order.payments).toHaveLength(1);
      expect(order.payments[0]).toMatchObject({
        status: 'COMPLETED',
        feesKobo: 30_000,
        channel: 'card',
      });
      const [pickup, dispatch] = split(order.sellerOrders, w);
      expect(pickup).toMatchObject({
        escrowStatus: EscrowStatus.HELD,
        fulfillmentStatus: FulfillmentStatus.AWAITING_PICKUP,
      });
      expect(dispatch).toMatchObject({
        escrowStatus: EscrowStatus.HELD,
        fulfillmentStatus: FulfillmentStatus.AWAITING_RIDER,
      });
      const day = 24 * 60 * 60 * 1000;
      const paidAt = order.paidAt!.getTime();
      expect(dispatch.pickupDeadline!.getTime() - paidAt).toBe(3 * day); // DL7b
      expect(pickup.pickupDeadline!.getTime() - paidAt).toBe(5 * day); // DL7c

      await expect(
        ctx.prisma.auditLog.count({ where: { action: 'ORDER_PAID' } }),
      ).resolves.toBe(1);
      const notes = await ctx.prisma.notification.findMany({
        select: { userId: true, type: true },
      });
      expect(
        notes
          .filter((n) => n.type === 'NEW_ORDER')
          .map((n) => n.userId)
          .sort(),
      ).toEqual([w.ada.id, w.tunde.id].sort());
      expect(notes.filter((n) => n.type === 'ORDER_PAID')).toEqual([
        { userId: w.buyer.id, type: 'ORDER_PAID' },
      ]);

      // The buyer now sees the seller's pickup address (SA3)
      const detail = (
        await w.agent.get(`/api/orders/${placed.orderId}`).expect(200)
      ).body.data;
      const adaOrder = (
        detail.sellerOrders as {
          seller: { id: string };
          pickupFrom: { address: string };
        }[]
      ).find((so) => so.seller.id === w.ada.id);
      expect(adaOrder?.pickupFrom.address).toBe(
        utils.DELIVERY_DETAILS.pickupAddress,
      );
    });

    it("a payment for less than the total doesn't mark the order paid, and admins hear about it", async () => {
      const w = await world();
      const admin = await utils.createUser(ctx.prisma, {
        role: UserRole.ADMIN,
      });
      const placed = await placeOrder(w);
      await webhook(
        chargeSuccess(placed.reference, placed.totalKobo - 100),
      ).expect(200);
      const order = await orderOf(placed.orderId);
      expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);
      expect(order.payments[0]).toMatchObject({ status: 'FAILED' });
      expect(order.payments[0].failureReason).toMatch(/amount/);
      await expect(
        ctx.prisma.notification.count({
          where: { userId: admin.id, type: 'PAYMENT_MISMATCH' },
        }),
      ).resolves.toBe(1);
    });

    it("visiting the callback URL without paying doesn't mark the order paid; verify asks Paystack", async () => {
      const w = await world();
      const placed = await placeOrder(w);
      await w.agent.get(`/api/orders/${placed.orderId}`).expect(200);

      nock(PAYSTACK)
        .get(`/transaction/verify/${placed.reference}`)
        .reply(200, {
          status: true,
          message: 'ok',
          data: {
            reference: placed.reference,
            status: 'abandoned',
            amount: placed.totalKobo,
            currency: 'NGN',
          },
        });
      const pending = await w.agent
        .get(`/api/payments/verify/${placed.reference}`)
        .expect(200);
      expect(pending.body.data).toEqual({
        orderId: placed.orderId,
        status: 'PENDING_PAYMENT',
      });

      nock(PAYSTACK)
        .get(`/transaction/verify/${placed.reference}`)
        .reply(200, {
          status: true,
          message: 'ok',
          data: chargeSuccess(placed.reference, placed.totalKobo).data,
        });
      const paid = await w.agent
        .get(`/api/payments/verify/${placed.reference}`)
        .expect(200);
      expect(paid.body.data.status).toBe('PAID');

      // Someone else's reference is 404, and the webhook replay after verify changes nothing
      const other = await utils.createUser(ctx.prisma, {
        institutionId: w.school.id,
      });
      await (
        await utils.signIn(ctx.app, other.email)
      )
        .get(`/api/payments/verify/${placed.reference}`)
        .expect(404);
      await webhook(chargeSuccess(placed.reference, placed.totalKobo)).expect(
        200,
      );
      await expect(
        ctx.prisma.auditLog.count({ where: { action: 'ORDER_PAID' } }),
      ).resolves.toBe(1);
    });

    it('a buyer can try again with a new reference; a second successful payment is refunded in full (P7)', async () => {
      const w = await world();
      const placed = await placeOrder(w);
      expectInitialize();
      const retry = (
        await w.agent.post(`/api/orders/${placed.orderId}/pay`).expect(201)
      ).body.data;
      expect(retry.reference).toBe(`CM_${placed.orderId}_2`);

      await webhook(chargeSuccess(placed.reference, placed.totalKobo)).expect(
        200,
      );
      nock(PAYSTACK)
        .post('/refund', {
          transaction: retry.reference,
          amount: placed.totalKobo,
        })
        .reply(200, {
          status: true,
          message: 'Refund queued',
          data: { id: 9001, status: 'pending' },
        });
      await webhook(chargeSuccess(retry.reference, placed.totalKobo)).expect(
        200,
      );

      const refund = await ctx.prisma.refund.findFirstOrThrow();
      expect(refund).toMatchObject({
        amountKobo: placed.totalKobo,
        fault: Fault.NONE,
        reason: 'PAID_TWICE',
        paystackRefundId: '9001',
        sellerOrderId: null,
      });
      await webhook({
        event: 'refund.processed',
        data: { id: 9001, status: 'processed' },
      }).expect(200);
      await expect(ctx.prisma.refund.findFirstOrThrow()).resolves.toMatchObject(
        {
          status: RefundStatus.PROCESSED,
        },
      );
      // A paid order can't be paid again
      const again = await w.agent
        .post(`/api/orders/${placed.orderId}/pay`)
        .expect(409);
      expect(again.body.code).toBe('ORDER_NOT_PAYABLE');
    });

    it('a payment after expiry takes the stock back if it is still there, or is refunded', async () => {
      const w = await world();
      const placed = await placeOrder(w);
      await ctx.prisma.order.update({
        where: { id: placed.orderId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expiry.expireDue();
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: w.lamp.id } }),
      ).resolves.toMatchObject({ stock: 3 });

      await webhook(chargeSuccess(placed.reference, placed.totalKobo)).expect(
        200,
      );
      expect((await orderOf(placed.orderId)).status).toBe(OrderStatus.PAID);
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: w.lamp.id } }),
      ).resolves.toMatchObject({ stock: 2 });

      // Second order: expired, then the lamp sells out elsewhere before the money arrives
      const w2 = { ...w, agent: await utils.signIn(ctx.app, w.buyer.email) };
      const late = await placeOrder(w2);
      await ctx.prisma.order.update({
        where: { id: late.orderId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expiry.expireDue();
      await ctx.prisma.listing.update({
        where: { id: w.lamp.id },
        data: { stock: 0, status: 'SOLDOUT' },
      });
      nock(PAYSTACK)
        .post('/refund', {
          transaction: late.reference,
          amount: late.totalKobo,
        })
        .reply(200, {
          status: true,
          message: 'ok',
          data: { id: 9002, status: 'pending' },
        });
      await webhook(chargeSuccess(late.reference, late.totalKobo)).expect(200);
      expect((await orderOf(late.orderId)).status).toBe(OrderStatus.EXPIRED);
      await expect(
        ctx.prisma.refund.findFirstOrThrow({
          where: { paystackRefundId: '9002' },
        }),
      ).resolves.toMatchObject({
        reason: 'PAID_AFTER_STOCK_GONE',
        amountKobo: late.totalKobo,
      });
    });
  });

  describe('escrow release and payouts', () => {
    async function paidAndCollected() {
      const w = await world();
      const placed = await placeOrder(w);
      await webhook(chargeSuccess(placed.reference, placed.totalKobo)).expect(
        200,
      );
      const order = await orderOf(placed.orderId);
      // Handover is Phase 6; here both are collected and their 48 hours are up
      await ctx.prisma.sellerOrder.updateMany({
        where: { orderId: order.id },
        data: {
          fulfillmentStatus: FulfillmentStatus.COLLECTED,
          collectedAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
          releaseAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      return { ...w, order };
    }

    const giveAccount = (sellerId: string, changedHoursAgo: number) =>
      ctx.prisma.sellerProfile.update({
        where: { userId: sellerId },
        data: {
          paystackRecipientCode: `RCP_${sellerId.slice(0, 6)}`,
          payoutBankName: 'Guaranty Trust Bank',
          payoutAccountLast4: '6789',
          payoutAccountChangedAt: new Date(
            Date.now() - changedHoursAgo * 60 * 60 * 1000,
          ),
        },
      });

    it('collection plus 48 hours creates a payout and a Paystack transfer; an open dispute blocks it', async () => {
      const w = await paidAndCollected();
      const [pickup, dispatch] = split(w.order.sellerOrders, w);
      await giveAccount(w.tunde.id, 48);
      // Ada's order is disputed
      await ctx.prisma.dispute.create({
        data: {
          sellerOrderId: pickup.id,
          openedById: w.buyer.id,
          reason: 'Damaged',
          status: DisputeStatus.OPEN,
        },
      });

      await expect(payouts.releaseDue()).resolves.toBe(1);
      const payout = await ctx.prisma.payout.findUniqueOrThrow({
        where: { sellerOrderId: dispatch.id },
      });
      expect(payout).toMatchObject({
        sellerId: w.tunde.id,
        amountKobo: 450_000, // items less a 0% platform fee; the delivery fee stays with the platform
        status: PayoutStatus.PENDING,
        reference: `PO_${dispatch.id}_1`,
      });
      await expect(
        ctx.prisma.sellerOrder.findUniqueOrThrow({ where: { id: pickup.id } }),
      ).resolves.toMatchObject({
        escrowStatus: EscrowStatus.HELD,
      });

      nock(PAYSTACK)
        .post('/transfer', {
          source: 'balance',
          amount: 450_000,
          recipient: `RCP_${w.tunde.id.slice(0, 6)}`,
          reference: payout.reference,
          reason: `CampusMart order ${dispatch.code}`,
        })
        .reply(200, {
          status: true,
          message: 'Transfer queued',
          data: { transfer_code: 'TRF_1', status: 'pending' },
        });
      await expect(payouts.sendPending()).resolves.toBe(1);
      await expect(
        ctx.prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
      ).resolves.toMatchObject({
        status: PayoutStatus.PROCESSING,
        transferCode: 'TRF_1',
      });

      await webhook({
        event: 'transfer.success',
        data: { reference: payout.reference },
      }).expect(200);
      await expect(
        ctx.prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
      ).resolves.toMatchObject({
        status: PayoutStatus.PAID,
      });
      await expect(
        ctx.prisma.auditLog.count({
          where: {
            action: { in: ['ESCROW_RELEASED', 'PAYOUT_SENT', 'PAYOUT_PAID'] },
          },
        }),
      ).resolves.toBe(3);
    });

    it('waits for a payout account, and for 24 hours after one is set (P9)', async () => {
      const w = await paidAndCollected();
      await ctx.prisma.dispute.create({
        data: {
          sellerOrderId: split(w.order.sellerOrders, w)[0].id,
          openedById: w.buyer.id,
          reason: 'x',
          status: DisputeStatus.OPEN,
        },
      });
      await payouts.releaseDue();
      const payout = await ctx.prisma.payout.findFirstOrThrow();
      expect(payout.status).toBe(PayoutStatus.AWAITING_ACCOUNT);

      await giveAccount(w.tunde.id, 2);
      await ctx.prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.PENDING },
      });
      await expect(payouts.sendPending()).resolves.toBe(0); // held: changed 2 hours ago

      await giveAccount(w.tunde.id, 25);
      nock(PAYSTACK)
        .post('/transfer')
        .reply(200, {
          status: true,
          message: 'ok',
          data: { transfer_code: 'TRF_2', status: 'pending' },
        });
      await expect(payouts.sendPending()).resolves.toBe(1);
    });

    it('a failed transfer alerts the admins, who can retry it with a new reference; sellers cannot', async () => {
      const w = await paidAndCollected();
      const admin = await utils.createUser(ctx.prisma, {
        role: UserRole.ADMIN,
      });
      await giveAccount(w.tunde.id, 48);
      await giveAccount(w.ada.id, 48);
      nock(PAYSTACK)
        .post('/transfer')
        .times(2)
        .reply(200, {
          status: true,
          message: 'ok',
          data: { transfer_code: 'TRF', status: 'pending' },
        });
      await payouts.releaseDue();
      await payouts.sendPending();
      const failed = await ctx.prisma.payout.findFirstOrThrow({
        where: { sellerId: w.tunde.id },
      });

      await webhook({
        event: 'transfer.failed',
        data: { reference: failed.reference, reason: 'Account closed' },
      }).expect(200);
      await expect(
        ctx.prisma.payout.findUniqueOrThrow({ where: { id: failed.id } }),
      ).resolves.toMatchObject({
        status: PayoutStatus.FAILED,
        failureReason: 'Account closed',
      });
      await expect(
        ctx.prisma.notification.count({
          where: { userId: admin.id, type: 'PAYOUT_FAILED' },
        }),
      ).resolves.toBe(1);

      const a = await utils.signIn(ctx.app, admin.email);
      const list = (await a.get('/api/admin/payouts?status=FAILED').expect(200))
        .body.data;
      expect(list.items.map((p: { id: string }) => p.id)).toEqual([failed.id]);
      expect(list.items[0]).toMatchObject({
        storeName: 'Tunde Tech',
        sellerOrderCode: expect.stringMatching(/^CM-/),
      });

      const seller = await utils.signIn(ctx.app, w.tunde.email);
      await seller.post(`/api/admin/payouts/${failed.id}/retry`).expect(403);

      nock(PAYSTACK)
        .post(
          '/transfer',
          (body: { reference: string }) =>
            body.reference === `PO_${failed.sellerOrderId}_2`,
        )
        .reply(200, {
          status: true,
          message: 'ok',
          data: { transfer_code: 'TRF_RETRY', status: 'pending' },
        });
      const retried = (
        await a.post(`/api/admin/payouts/${failed.id}/retry`).expect(200)
      ).body.data;
      expect(retried).toMatchObject({ status: 'PROCESSING', attempt: 2 });
      await a.post(`/api/admin/payouts/${failed.id}/retry`).expect(409);
      await expect(
        ctx.prisma.auditLog.count({
          where: { action: 'PAYOUT_RETRIED', actorId: admin.id },
        }),
      ).resolves.toBe(1);
    });
  });

  describe('refunds (guide 5.6, decisions P6, DF5, DF9)', () => {
    async function paid() {
      const w = await world();
      const placed = await placeOrder(w);
      await webhook(
        chargeSuccess(placed.reference, placed.totalKobo, { fees: 33_000 }),
      ).expect(200);
      return { ...w, placed, order: await orderOf(placed.orderId) };
    }

    const expectRefund = (reference: string, amount: number, id: number) =>
      nock(PAYSTACK)
        .post('/refund', { transaction: reference, amount })
        .reply(200, {
          status: true,
          message: 'ok',
          data: { id, status: 'pending' },
        });

    it('refunding one seller order of two leaves the other HELD, and puts its stock back', async () => {
      const w = await paid();
      const [pickup, dispatch] = split(w.order.sellerOrders, w);
      expectRefund(w.placed.reference, 1_200_000, 1);
      await refunds.refundSellerOrder(pickup.id, {
        reason: 'SELLER_CANCELLED',
        fault: Fault.SELLER,
      });

      const after = split((await orderOf(w.order.id)).sellerOrders, w);
      expect(after[0]).toMatchObject({
        escrowStatus: EscrowStatus.REFUNDED,
        fulfillmentStatus: FulfillmentStatus.CANCELLED,
        fault: Fault.SELLER,
      });
      expect(after[1]).toMatchObject({
        id: dispatch.id,
        escrowStatus: EscrowStatus.HELD,
      });
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: w.dress.id } }),
      ).resolves.toMatchObject({ stock: 3 });
      await expect(
        refunds.refundSellerOrder(pickup.id, {
          reason: 'again',
          fault: Fault.SELLER,
        }),
      ).rejects.toMatchObject({ response: { code: 'NOT_REFUNDABLE' } });
    });

    it("keeps back the buyer's share of the Paystack fee when it's their fault, and returns the delivery fee only with the last refund before any pickup", async () => {
      const w = await paid();
      const [pickup, dispatch] = split(w.order.sellerOrders, w);
      // Buyer's fault: 1,200,000 of a 1,650,000 subtotal carries 24,000 of the 33,000 fee
      expectRefund(w.placed.reference, 1_200_000 - 24_000, 2);
      await refunds.refundSellerOrder(pickup.id, {
        reason: 'BUYER_NO_SHOW',
        fault: Fault.BUYER,
      });
      // The last one, nothing picked up: the delivery fee comes back too (DF9a)
      expectRefund(w.placed.reference, 450_000 + FEE, 3);
      await refunds.refundSellerOrder(dispatch.id, {
        reason: 'MISSED_PICKUP_DEADLINE',
        fault: Fault.NONE,
      });

      const rows = await ctx.prisma.refund.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expect(
        rows.map((r) => [
          r.amountKobo,
          r.paystackFeeKobo,
          r.deliveryFeeKobo,
          r.fault,
        ]),
      ).toEqual([
        [1_176_000, 24_000, 0, Fault.BUYER],
        [500_000, 0, FEE, Fault.NONE],
      ]);
    });

    it('no delivery fee back once anything was picked up (DF9)', async () => {
      const w = await paid();
      const [pickup, dispatch] = split(w.order.sellerOrders, w);
      await ctx.prisma.sellerOrder.update({
        where: { id: pickup.id },
        data: {
          fulfillmentStatus: FulfillmentStatus.COLLECTED,
          collectedAt: new Date(),
        },
      });
      expectRefund(w.placed.reference, 450_000, 4);
      await refunds.refundSellerOrder(dispatch.id, {
        reason: 'SELLER_CANCELLED',
        fault: Fault.SELLER,
      });
      await expect(ctx.prisma.refund.findFirstOrThrow()).resolves.toMatchObject(
        { deliveryFeeKobo: 0 },
      );
    });

    it('a refund Paystack refuses is kept as FAILED and the admins are told', async () => {
      const w = await paid();
      const admin = await utils.createUser(ctx.prisma, {
        role: UserRole.ADMIN,
      });
      nock(PAYSTACK).post('/refund').reply(400, {
        status: false,
        message: 'Transaction has been fully reversed',
      });
      const refund = await refunds.refundSellerOrder(
        split(w.order.sellerOrders, w)[0].id,
        { reason: 'x', fault: Fault.SELLER },
      );
      expect(refund).toMatchObject({
        status: RefundStatus.FAILED,
        failureReason: 'Transaction has been fully reversed',
      });
      await expect(
        ctx.prisma.notification.count({
          where: { userId: admin.id, type: 'REFUND_FAILED' },
        }),
      ).resolves.toBe(1);
    });
  });

  describe('payout accounts (guide 5.4) and settings (R1a)', () => {
    const banks = () =>
      nock(PAYSTACK)
        .get('/bank')
        .query(true)
        .reply(200, {
          status: true,
          message: 'ok',
          data: [
            { name: 'Guaranty Trust Bank', code: '058', id: 1 },
            { name: 'Access Bank', code: '044', id: 2 },
          ],
        });

    it('a seller sets an account Paystack has checked; only the last 4 digits are kept, payouts are held 24 hours', async () => {
      const w = await world();
      const seller = await utils.signIn(ctx.app, w.ada.email);
      banks();
      const list = (await seller.get('/api/payouts/banks').expect(200)).body
        .data;
      expect(list).toEqual([
        { name: 'Guaranty Trust Bank', code: '058' },
        { name: 'Access Bank', code: '044' },
      ]);

      await seller
        .post('/api/sellers/me/payout-account')
        .send({ bankCode: '058', accountNumber: '12345' })
        .expect(400);
      nock(PAYSTACK)
        .get('/bank/resolve')
        .query({ account_number: '0123456789', bank_code: '058' })
        .reply(200, {
          status: true,
          message: 'ok',
          data: { account_name: 'ADA OBI', account_number: '0123456789' },
        });
      nock(PAYSTACK)
        .post('/transferrecipient', {
          type: 'nuban',
          name: 'ADA OBI',
          account_number: '0123456789',
          bank_code: '058',
          currency: 'NGN',
        })
        .reply(201, {
          status: true,
          message: 'ok',
          data: { recipient_code: 'RCP_ada' },
        });
      const account = (
        await seller
          .post('/api/sellers/me/payout-account')
          .send({ bankCode: '058', accountNumber: '0123456789' })
          .expect(201)
      ).body.data;
      expect(account).toMatchObject({
        bankName: 'Guaranty Trust Bank',
        accountLast4: '6789',
        accountName: 'ADA OBI',
      });
      expect(new Date(account.holdUntil).getTime()).toBeGreaterThan(
        Date.now() + 23 * 60 * 60 * 1000,
      );

      const profile = await ctx.prisma.sellerProfile.findUniqueOrThrow({
        where: { userId: w.ada.id },
      });
      expect(JSON.stringify(profile)).not.toContain('0123456789');
      await expect(
        ctx.prisma.notification.count({
          where: { userId: w.ada.id, type: 'PAYOUT_ACCOUNT_CHANGED' },
        }),
      ).resolves.toBe(1);

      // Paystack can't resolve it: a 502 with Paystack's own reason
      nock(PAYSTACK).get('/bank/resolve').query(true).reply(422, {
        status: false,
        message: 'Could not resolve account name',
      });
      const bad = await seller
        .post('/api/sellers/me/payout-account')
        .send({ bankCode: '058', accountNumber: '0000000000' })
        .expect(502);
      expect(bad.body).toMatchObject({
        code: 'PAYMENT_PROVIDER_ERROR',
        message: 'Could not resolve account name',
      });

      // A buyer can't
      await w.agent.get('/api/payouts/banks').expect(403);
    });

    it('an admin changes the platform fee; new orders use it, and the change is audited', async () => {
      const w = await world();
      const admin = await utils.createUser(ctx.prisma, {
        role: UserRole.ADMIN,
      });
      const a = await utils.signIn(ctx.app, admin.email);
      expect(
        (await a.get('/api/admin/settings').expect(200)).body.data,
      ).toEqual({
        platformFeeBps: 0,
        pickupDeadlineDays: 3,
        lowStockThreshold: 5,
      });
      await a
        .patch('/api/admin/settings')
        .send({ platformFeeBps: 6000 })
        .expect(400);
      await a
        .patch('/api/admin/settings')
        .send({ platformFeeBps: 500 })
        .expect(200);
      await (
        await utils.signIn(ctx.app, w.ada.email)
      )
        .patch('/api/admin/settings')
        .send({ platformFeeBps: 0 })
        .expect(403);

      const placed = await placeOrder(w);
      const order = await orderOf(placed.orderId);
      expect(
        order.sellerOrders.map((so) => [
          so.subtotalKobo,
          so.platformFeeKobo,
          so.sellerPayoutKobo,
        ]),
      ).toEqual([
        [1_200_000, 60_000, 1_140_000],
        [450_000, 22_500, 427_500],
      ]);
      await expect(
        ctx.prisma.auditLog.findFirstOrThrow({
          where: { action: 'SETTING_CHANGED' },
        }),
      ).resolves.toMatchObject({
        actorId: admin.id,
        entityId: 'platformFeeBps',
        meta: { from: 0, to: 500 },
      });
    });
  });
});
