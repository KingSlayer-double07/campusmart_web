import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  FulfillmentStatus,
  ListingStatus,
  OrderStatus,
  PaymentStatus,
} from '../src/generated/prisma/enums';
import { OrderExpiryService } from '../src/orders/order-expiry.service';
import {
  createListing,
  createSchool,
  createSeller,
  createStation,
} from './commerce-fixtures';
import {
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TestContext,
  truncateAll,
} from './utils';

type Agent = Awaited<ReturnType<typeof signIn>>;

// Guide 4.2 and the Phase 4 checklist
describe('Phase 4 checkout and orders (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    resetRateLimits(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function world() {
    const school = await createSchool(ctx.prisma);
    const station = await createStation(ctx.prisma, school.id);
    const ada = await createSeller(ctx.prisma, school.id, 'Ada Wears');
    const tunde = await createSeller(ctx.prisma, school.id, 'Tunde Tech');
    const buyer = await createUser(ctx.prisma, { institutionId: school.id });
    const agent = await signIn(ctx.app, buyer.email);
    return { school, station, ada, tunde, buyer, agent };
  }

  const add = (
    agent: Agent,
    listingId: string,
    quantity = 1,
    variantId?: string,
  ) =>
    agent
      .put('/api/cart/items')
      .send({ listingId, quantity, ...(variantId && { variantId }) })
      .expect(200);

  const checkout = (
    agent: Agent,
    pickupStationId: string,
    idempotencyKey = randomUUID(),
  ) =>
    agent
      .post('/api/orders/checkout')
      .send({ pickupStationId, paymentMethod: 'CARD', idempotencyKey });

  describe('checklist', () => {
    it('two buyers checking out the last unit at the same time: one succeeds, one gets OUT_OF_STOCK', async () => {
      const { school, station, tunde, agent } = await world();
      const rival = await createUser(ctx.prisma, { institutionId: school.id });
      const rivalAgent = await signIn(ctx.app, rival.email);

      for (let round = 0; round < 5; round += 1) {
        const lamp = await createListing(ctx.prisma, tunde, {
          title: `Lamp ${round}`,
          stock: 1,
        });
        await add(agent, lamp.id);
        await add(rivalAgent, lamp.id);

        const results = await Promise.all([
          checkout(agent, station.id),
          checkout(rivalAgent, station.id),
        ]);
        const statuses = results.map((r) => r.status).sort();
        expect(statuses).toEqual([201, 409]);
        const loser = results.find((r) => r.status === 409)!;
        expect(loser.body.code).toBe('OUT_OF_STOCK');
        expect(loser.body.details).toMatchObject({ listingId: lamp.id });

        const after = await ctx.prisma.listing.findUniqueOrThrow({
          where: { id: lamp.id },
        });
        expect(after).toMatchObject({
          stock: 0,
          status: ListingStatus.SOLDOUT,
        });
        await expect(
          ctx.prisma.orderItem.count({ where: { listingId: lamp.id } }),
        ).resolves.toBe(1);
        // The loser keeps their cart line, so they can see what happened
        await ctx.prisma.cartItem.deleteMany({});
      }
    });

    it('the last unit of an option goes to one buyer only', async () => {
      const { school, station, ada, agent } = await world();
      const rival = await createUser(ctx.prisma, { institutionId: school.id });
      const rivalAgent = await signIn(ctx.app, rival.email);
      const pants = await createListing(ctx.prisma, ada, {
        variants: [
          { label: 'M', stock: 3 },
          { label: 'L', stock: 1 },
        ],
      });
      const large = pants.variants.find((v) => v.label === 'L')!;
      await add(agent, pants.id, 1, large.id);
      await add(rivalAgent, pants.id, 1, large.id);

      const results = await Promise.all([
        checkout(agent, station.id),
        checkout(rivalAgent, station.id),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      await expect(
        ctx.prisma.listingVariant.findUniqueOrThrow({
          where: { id: large.id },
        }),
      ).resolves.toMatchObject({ stock: 0 });
      // M still has 3, so the listing stays on sale with the right total
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: pants.id } }),
      ).resolves.toMatchObject({ stock: 3, status: ListingStatus.ACTIVE });
    });

    it("changing a price after items are in a cart doesn't change the snapshot on an order already placed", async () => {
      const { station, tunde, agent } = await world();
      const lamp = await createListing(ctx.prisma, tunde, {
        title: 'Desk lamp',
        priceKobo: 450_000,
      });
      await add(agent, lamp.id, 2);
      // The price moves while it sits in the cart: checkout charges today's price from the database
      await ctx.prisma.listing.update({
        where: { id: lamp.id },
        data: { priceKobo: 470_000 },
      });
      const placed = await checkout(agent, station.id).expect(201);
      expect(placed.body.data.totalKobo).toBe(940_000);

      // ...and later changes don't touch the order
      await ctx.prisma.listing.update({
        where: { id: lamp.id },
        data: { priceKobo: 999_900, title: 'Renamed lamp' },
      });
      const order = (
        await agent.get(`/api/orders/${placed.body.data.orderId}`).expect(200)
      ).body.data;
      expect(order.totalKobo).toBe(940_000);
      expect(order.sellerOrders[0].items[0]).toMatchObject({
        title: 'Desk lamp',
        unitPriceKobo: 470_000,
        quantity: 2,
      });
      expect(order.sellerOrders[0].subtotalKobo).toBe(940_000);
    });

    it('resubmitting checkout with the same idempotencyKey returns the same order', async () => {
      const { station, tunde, agent } = await world();
      const lamp = await createListing(ctx.prisma, tunde, { stock: 5 });
      await add(agent, lamp.id, 2);
      const key = randomUUID();

      const first = await checkout(agent, station.id, key).expect(201);
      const again = await checkout(agent, station.id, key).expect(201);
      expect(again.body.data).toEqual(first.body.data);

      // Even at the same moment, with a full cart again
      await add(agent, lamp.id, 1);
      const key2 = randomUUID();
      const racing = await Promise.all([
        checkout(agent, station.id, key2),
        checkout(agent, station.id, key2),
      ]);
      expect(racing.map((r) => r.status)).toEqual([201, 201]);
      expect(racing[0].body.data.orderId).toBe(racing[1].body.data.orderId);

      await expect(ctx.prisma.order.count()).resolves.toBe(2);
      // 2 + 1 reserved, once each
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 2 });

      // Another buyer can't reuse someone's key
      const stranger = await createUser(ctx.prisma, {
        institutionId: lamp.institutionId,
      });
      const s = await signIn(ctx.app, stranger.email);
      const reused = await checkout(s, station.id, key).expect(409);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('an unpaid order expires after 30 minutes and its stock returns', async () => {
      const { station, tunde, ada, agent } = await world();
      const lamp = await createListing(ctx.prisma, tunde, { stock: 1 });
      const pants = await createListing(ctx.prisma, ada, {
        variants: [{ label: 'M', stock: 2 }],
      });
      await add(agent, lamp.id, 1);
      await add(agent, pants.id, 2, pants.variants[0].id);
      const placed = await checkout(agent, station.id).expect(201);
      const orderId = placed.body.data.orderId;

      const order = await ctx.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(
        order.expiresAt.getTime() - order.createdAt.getTime(),
      ).toBeGreaterThanOrEqual(30 * 60_000 - 1_000);
      expect(
        order.expiresAt.getTime() - order.createdAt.getTime(),
      ).toBeLessThanOrEqual(30 * 60_000 + 1_000);
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 0, status: ListingStatus.SOLDOUT });
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: pants.id } }),
      ).resolves.toMatchObject({ stock: 0, status: ListingStatus.SOLDOUT });

      const expiry = ctx.app.get(OrderExpiryService);
      // 29 minutes in: nothing happens
      await expect(
        expiry.expireDue(new Date(order.createdAt.getTime() + 29 * 60_000)),
      ).resolves.toBe(0);
      // 31 minutes in: expired, seller orders cancelled, stock back on sale
      await expect(
        expiry.expireDue(new Date(order.createdAt.getTime() + 31 * 60_000)),
      ).resolves.toBe(1);

      const detail = (await agent.get(`/api/orders/${orderId}`).expect(200))
        .body.data;
      expect(detail.status).toBe(OrderStatus.EXPIRED);
      expect(
        detail.sellerOrders.map(
          (so: { fulfillmentStatus: string; cancelReason: string }) => [
            so.fulfillmentStatus,
            so.cancelReason,
          ],
        ),
      ).toEqual([
        [FulfillmentStatus.CANCELLED, 'PAYMENT_EXPIRED'],
        [FulfillmentStatus.CANCELLED, 'PAYMENT_EXPIRED'],
      ]);
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 1, status: ListingStatus.ACTIVE });
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: pants.id } }),
      ).resolves.toMatchObject({ stock: 2, status: ListingStatus.ACTIVE });
      await expect(
        ctx.prisma.listingVariant.findUniqueOrThrow({
          where: { id: pants.variants[0].id },
        }),
      ).resolves.toMatchObject({ stock: 2 });

      // Running again changes nothing (no double restock)
      await expect(
        expiry.expireDue(new Date(order.createdAt.getTime() + 60 * 60_000)),
      ).resolves.toBe(0);
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 1 });
    });

    it('a cart with items from 2 sellers produces 2 seller orders with different codes', async () => {
      const { station, tunde, ada, agent } = await world();
      const lamp = await createListing(ctx.prisma, tunde, {
        priceKobo: 450_000,
      });
      const pants = await createListing(ctx.prisma, ada, {
        priceKobo: 1_450_000,
        variants: [
          { label: 'M', stock: 2 },
          { label: 'L', stock: 1, priceKobo: 1_500_000 },
        ],
      });
      await add(agent, lamp.id, 2);
      await add(
        agent,
        pants.id,
        1,
        pants.variants.find((v) => v.label === 'L')!.id,
      );
      await add(
        agent,
        pants.id,
        1,
        pants.variants.find((v) => v.label === 'M')!.id,
      );

      const placed = await checkout(agent, station.id).expect(201);
      expect(placed.body.data).toEqual({
        orderId: expect.any(String),
        totalKobo: 900_000 + 1_500_000 + 1_450_000,
        authorizationUrl: null,
        reference: null,
      });

      const order = (
        await agent.get(`/api/orders/${placed.body.data.orderId}`).expect(200)
      ).body.data;
      expect(order).toMatchObject({
        status: 'PENDING_PAYMENT',
        paymentMethod: 'CARD',
        subtotalKobo: 3_850_000,
        totalKobo: 3_850_000,
      });
      expect(order.pickupStation).toMatchObject({
        id: station.id,
        name: 'Library Pickup Point',
        openingHours: [{ day: 'MON', open: '09:00', close: '17:00' }],
      });
      const [first, second] = order.sellerOrders;
      expect(order.sellerOrders).toHaveLength(2);
      expect(first.code).not.toBe(second.code);
      for (const so of order.sellerOrders) {
        expect(so.code).toMatch(/^CM-[2-9A-HJ-NP-Z]{6}$/);
        expect(so.collectionCode).toMatch(/^\d{6}$/);
        expect(so.fulfillmentStatus).toBe('PENDING');
      }
      expect(
        order.sellerOrders.map(
          (so: {
            seller: { storeName: string };
            subtotalKobo: number;
            itemCount: number;
          }) => [so.seller.storeName, so.subtotalKobo, so.itemCount],
        ),
      ).toEqual([
        ['Tunde Tech', 900_000, 2],
        ['Ada Wears', 2_950_000, 2],
      ]);
      expect(
        second.items
          .map((i: { variantLabel: string; unitPriceKobo: number }) => [
            i.variantLabel,
            i.unitPriceKobo,
          ])
          .sort(),
      ).toEqual([
        ['L', 1_500_000],
        ['M', 1_450_000],
      ]);
      // Fee and payout are stored for the seller side, never shown to the buyer
      const rows = await ctx.prisma.sellerOrder.findMany({
        where: { orderId: order.id },
      });
      for (const so of rows) {
        expect(so.platformFeeKobo).toBe(0);
        expect(so.sellerPayoutKobo).toBe(so.subtotalKobo);
      }
      expect(JSON.stringify(order)).not.toMatch(/platformFee|sellerPayout/);
      // The cart is spent
      await expect(ctx.prisma.cartItem.count()).resolves.toBe(0);
    });
  });

  describe('refusals', () => {
    it('needs a cart, a station at your school, and items that can still be bought', async () => {
      const { station, tunde, agent } = await world();
      const empty = await checkout(agent, station.id).expect(400);
      expect(empty.body.code).toBe('CART_EMPTY');

      const lamp = await createListing(ctx.prisma, tunde, { stock: 3 });
      await add(agent, lamp.id, 2);
      const elsewhere = await createSchool(ctx.prisma);
      const farStation = await createStation(ctx.prisma, elsewhere.id);
      const closed = await createStation(ctx.prisma, lamp.institutionId, false);
      await checkout(agent, farStation.id).expect(404);
      await checkout(agent, closed.id).expect(404);

      // Archived after it went in the cart
      await ctx.prisma.listing.update({
        where: { id: lamp.id },
        data: { status: ListingStatus.ARCHIVED },
      });
      const gone = await checkout(agent, station.id).expect(409);
      expect(gone.body).toMatchObject({
        code: 'ITEM_UNAVAILABLE',
        details: { listingId: lamp.id },
      });

      // Stock fell below the cart's quantity
      await ctx.prisma.listing.update({
        where: { id: lamp.id },
        data: { status: ListingStatus.ACTIVE, stock: 1 },
      });
      const short = await checkout(agent, station.id).expect(409);
      expect(short.body).toMatchObject({
        code: 'OUT_OF_STOCK',
        details: { listingId: lamp.id, available: 1 },
      });

      // Nothing was reserved or created along the way
      await expect(ctx.prisma.order.count()).resolves.toBe(0);
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 1 });
      await expect(ctx.prisma.cartItem.count()).resolves.toBe(1);
    });

    it('takes no prices from the client, and only known payment methods', async () => {
      const { station, tunde, agent } = await world();
      const lamp = await createListing(ctx.prisma, tunde);
      await add(agent, lamp.id);
      await agent
        .post('/api/orders/checkout')
        .send({
          pickupStationId: station.id,
          paymentMethod: 'CARD',
          idempotencyKey: randomUUID(),
          totalKobo: 1,
        })
        .expect(400);
      await agent
        .post('/api/orders/checkout')
        .send({
          pickupStationId: station.id,
          paymentMethod: 'CASH',
          idempotencyKey: randomUUID(),
        })
        .expect(400);
      await agent
        .post('/api/orders/checkout')
        .send({
          pickupStationId: station.id,
          paymentMethod: 'CARD',
          idempotencyKey: 'not-a-uuid',
        })
        .expect(400);
    });

    it('needs a verified email and a school that is switched on', async () => {
      const { school, station, tunde, agent } = await world();
      await request(ctx.app.getHttpServer())
        .post('/api/orders/checkout')
        .send({})
        .expect(401);
      await request(ctx.app.getHttpServer()).get('/api/orders').expect(401);
      await request(ctx.app.getHttpServer())
        .get('/api/pickup-stations')
        .expect(401);

      const unverified = await createUser(ctx.prisma, {
        institutionId: school.id,
        emailVerifiedAt: null,
      });
      const u = await signIn(ctx.app, unverified.email);
      expect((await checkout(u, station.id).expect(403)).body.code).toBe(
        'EMAIL_NOT_VERIFIED',
      );

      const lamp = await createListing(ctx.prisma, tunde);
      await add(agent, lamp.id);
      await ctx.prisma.institution.update({
        where: { id: school.id },
        data: { isActive: false },
      });
      expect((await checkout(agent, station.id).expect(403)).body.code).toBe(
        'INSTITUTION_INACTIVE',
      );
      expect(
        (await agent.get('/api/pickup-stations').expect(403)).body.code,
      ).toBe('INSTITUTION_INACTIVE');
      await expect(ctx.prisma.order.count()).resolves.toBe(0);
    });
  });

  describe('orders', () => {
    it("lists only your orders, newest first, and someone else's order is 404", async () => {
      const { school, station, tunde, agent } = await world();
      const lamp = await createListing(ctx.prisma, tunde, { stock: 10 });
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        await add(agent, lamp.id);
        ids.push(
          (await checkout(agent, station.id).expect(201)).body.data.orderId,
        );
      }
      const page1 = (await agent.get('/api/orders?limit=2').expect(200)).body
        .data;
      expect(page1.items.map((o: { id: string }) => o.id)).toEqual([
        ids[2],
        ids[1],
      ]);
      expect(page1.items[0]).toMatchObject({
        status: 'PENDING_PAYMENT',
        pickupStation: { id: station.id, name: 'Library Pickup Point' },
        sellerOrders: [{ seller: { storeName: 'Tunde Tech' }, itemCount: 1 }],
      });
      expect(page1.items[0].sellerOrders[0]).not.toHaveProperty(
        'collectionCode',
      );
      const page2 = (
        await agent
          .get(`/api/orders?limit=2&cursor=${page1.nextCursor}`)
          .expect(200)
      ).body.data;
      expect(page2).toMatchObject({
        items: [{ id: ids[0] }],
        nextCursor: null,
      });

      const stranger = await createUser(ctx.prisma, {
        institutionId: school.id,
      });
      const s = await signIn(ctx.app, stranger.email);
      expect((await s.get('/api/orders').expect(200)).body.data.items).toEqual(
        [],
      );
      await s.get(`/api/orders/${ids[0]}`).expect(404);
      await s.post(`/api/orders/${ids[0]}/cancel`).expect(404);
      // The seller can't read the buyer's order (and its collection code) here either
      const sellerAgent = await signIn(ctx.app, tunde.email);
      await sellerAgent.get(`/api/orders/${ids[0]}`).expect(404);
    });

    it('cancels an order waiting for payment and puts its stock back; only once', async () => {
      const { station, tunde, agent } = await world();
      const lamp = await createListing(ctx.prisma, tunde, { stock: 2 });
      await add(agent, lamp.id, 2);
      const { orderId } = (await checkout(agent, station.id).expect(201)).body
        .data;
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 0, status: ListingStatus.SOLDOUT });

      const cancelled = (
        await agent.post(`/api/orders/${orderId}/cancel`).expect(200)
      ).body.data;
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.sellerOrders[0]).toMatchObject({
        fulfillmentStatus: 'CANCELLED',
        cancelReason: 'BUYER_CANCELLED',
      });
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 2, status: ListingStatus.ACTIVE });

      const again = await agent
        .post(`/api/orders/${orderId}/cancel`)
        .expect(409);
      expect(again.body.code).toBe('ORDER_NOT_CANCELLABLE');
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 2 });
      // An expired order is past cancelling, and the expiry job leaves a cancelled one alone
      await expect(
        ctx.app
          .get(OrderExpiryService)
          .expireDue(new Date(Date.now() + 60 * 60_000)),
      ).resolves.toBe(0);
    });

    it('a completed payment wins: the order is neither expired nor cancellable', async () => {
      const { station, tunde, agent } = await world();
      const lamp = await createListing(ctx.prisma, tunde, { stock: 1 });
      await add(agent, lamp.id);
      const { orderId } = (await checkout(agent, station.id).expect(201)).body
        .data;
      // What Phase 5's webhook will write
      await ctx.prisma.payment.create({
        data: {
          orderId,
          reference: `ref-${orderId}`,
          amountKobo: 450_000,
          status: PaymentStatus.COMPLETED,
        },
      });

      await expect(
        ctx.app
          .get(OrderExpiryService)
          .expireDue(new Date(Date.now() + 60 * 60_000)),
      ).resolves.toBe(0);
      const refused = await agent
        .post(`/api/orders/${orderId}/cancel`)
        .expect(409);
      expect(refused.body.code).toBe('ORDER_NOT_CANCELLABLE');
      await expect(
        ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      ).resolves.toMatchObject({ status: OrderStatus.PENDING_PAYMENT });
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 0 });
    });

    it('lists the active stations at your school only', async () => {
      const { school, station, agent } = await world();
      const second = await ctx.prisma.pickupStation.create({
        data: { ...stationData(school.id), name: 'Hostel Gate' },
      });
      await createStation(ctx.prisma, school.id, false);
      const elsewhere = await createSchool(ctx.prisma);
      await createStation(ctx.prisma, elsewhere.id);

      const list = (await agent.get('/api/pickup-stations').expect(200)).body
        .data;
      expect(list.map((s: { id: string }) => s.id)).toEqual([
        second.id,
        station.id,
      ]);
      expect(list[0]).toEqual({
        id: second.id,
        name: 'Hostel Gate',
        address: 'Hostel gate',
        contactName: 'Mrs Ade',
        contactPhone: '+234 802 000 0000',
        openingHours: [{ day: 'TUE', open: '10:00', close: '16:00' }],
      });
    });
  });
});

const stationData = (institutionId: string) => ({
  institutionId,
  name: 'Hostel Gate',
  address: 'Hostel gate',
  contactName: 'Mrs Ade',
  contactPhone: '+234 802 000 0000',
  openingHours: [{ day: 'TUE', open: '10:00', close: '16:00' }],
});
