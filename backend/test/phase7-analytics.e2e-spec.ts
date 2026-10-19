import { LowStockService } from '../src/analytics/low-stock.service';
import {
  DeliveryMethod,
  FulfillmentStatus,
  ListingStatus,
  UserRole,
} from '../src/generated/prisma/enums';
import { PaymentsService } from '../src/payments/payments.service';
import * as fx from './commerce-fixtures';
import {
  client,
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TestContext,
  truncateAll,
} from './utils';

const DAY = 24 * 60 * 60 * 1000;

describe('Phase 7 seller analytics (e2e)', () => {
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
    const school = await fx.createSchool(ctx.prisma);
    const place = await fx.createCampusPlace(ctx.prisma, school.id);
    const ada = await fx.createSeller(ctx.prisma, school.id, 'Ada Wears');
    const tunde = await fx.createSeller(ctx.prisma, school.id, 'Tunde Tech');
    const buyer = await createUser(ctx.prisma, { institutionId: school.id });
    const buyer2 = await createUser(ctx.prisma, { institutionId: school.id });
    return { school, place, ada, tunde, buyer, buyer2 };
  }
  type World = Awaited<ReturnType<typeof world>>;

  // An order for one store per entry, paid through the real webhook handler unless `paid` is false,
  // then moved back in time by `daysAgo`
  async function order(
    w: World,
    stores: {
      seller: { id: string; institutionId: string | null };
      priceKobo: number;
    }[],
    { daysAgo = 0, paid = true } = {},
  ) {
    const placed = await fx.createUnpaidOrder(
      ctx.prisma,
      w.buyer,
      stores.map((s) => ({ ...s, method: DeliveryMethod.DISPATCH })),
      { campusPlaceId: w.place.id },
    );
    if (paid) {
      await ctx.app
        .get(PaymentsService)
        .handleEvent(fx.chargeSuccess(placed.reference, placed.totalKobo));
    }
    if (daysAgo) {
      await ctx.prisma.sellerOrder.updateMany({
        where: { orderId: placed.id },
        data: { createdAt: new Date(Date.now() - daysAgo * DAY) },
      });
    }
    return ctx.prisma.sellerOrder.findMany({
      where: { orderId: placed.id },
      include: { items: true },
    });
  }

  // The checklist's SQL: paid, not cancelled, placed since the start of the Lagos day 6 days ago
  async function revenueInSql(sellerId: string) {
    const [row] = await ctx.prisma.$queryRaw<
      { orders: number; revenue: bigint | null }[]
    >`
      SELECT COUNT(*)::int AS orders, SUM(so."subtotalKobo")::bigint AS revenue
      FROM "SellerOrder" so
      JOIN "Order" o ON o."id" = so."orderId"
      WHERE so."sellerId" = ${sellerId}
        AND o."status" = 'PAID'
        AND so."fulfillmentStatus" <> 'CANCELLED'
        AND so."createdAt" >= (
          (date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') - interval '6 days')
            AT TIME ZONE 'Africa/Lagos'
        ) AT TIME ZONE 'UTC'`;
    return { orders: row.orders, revenueKobo: Number(row.revenue ?? 0) };
  }

  it('revenue for a range is the sum of paid store-order subtotals in it, checked in SQL; one seller never sees another’s', async () => {
    const w = await world();
    // Ada: two sales this week, one last week, one unpaid, one cancelled
    await order(w, [{ seller: w.ada, priceKobo: 450_000 }]);
    const shared = await order(
      w,
      [
        { seller: w.ada, priceKobo: 1_200_000 },
        { seller: w.tunde, priceKobo: 2_000_000 },
      ],
      { daysAgo: 3 },
    );
    await order(w, [{ seller: w.ada, priceKobo: 300_000 }], { daysAgo: 10 });
    await order(w, [{ seller: w.ada, priceKobo: 700_000 }], { paid: false });
    const [cancelled] = await order(w, [{ seller: w.ada, priceKobo: 900_000 }]);
    await ctx.prisma.sellerOrder.update({
      where: { id: cancelled.id },
      data: { fulfillmentStatus: FulfillmentStatus.CANCELLED },
    });
    // Tunde: one more sale of his own
    await order(w, [{ seller: w.tunde, priceKobo: 650_000 }]);

    // Views: two buyers on Ada's lamp, one of them twice; Ada's own view doesn't count (A2)
    const adaLamp = shared.find((so) => so.sellerId === w.ada.id)!.items[0]
      .listingId;
    const b1 = await signIn(ctx.app, w.buyer.email);
    const b2 = await signIn(ctx.app, w.buyer2.email);
    const ada = await signIn(ctx.app, w.ada.email);
    await b1.get(`/api/listings/${adaLamp}`).expect(200);
    await b1.get(`/api/listings/${adaLamp}`).expect(200);
    await b2.get(`/api/listings/${adaLamp}`).expect(200);
    await ada.get(`/api/listings/${adaLamp}`).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const stats = (await ada.get('/api/sellers/me/stats?range=7d').expect(200))
      .body.data;
    const sql = await revenueInSql(w.ada.id);
    expect(sql).toEqual({ orders: 2, revenueKobo: 1_650_000 });
    expect(stats).toMatchObject({
      range: '7d',
      orders: sql.orders,
      revenueKobo: sql.revenueKobo,
      // Last week: one order of 300,000
      ordersChangePct: 100,
      revenueChangePct: 450,
      views: 2,
      viewsChangePct: null,
      // Paid but not handed over yet: all four still held (the cancelled one too, until refunded)
      heldKobo: 450_000 + 1_200_000 + 300_000 + 900_000,
      releasedKobo: 0,
      paidOutKobo: 0,
    });

    // Tunde sees his own two sales and none of Ada's, nor her views
    const tunde = await signIn(ctx.app, w.tunde.email);
    const his = (await tunde.get('/api/sellers/me/stats?range=30d').expect(200))
      .body.data;
    expect(await revenueInSql(w.tunde.id)).toEqual({
      orders: his.orders,
      revenueKobo: his.revenueKobo,
    });
    expect(his).toMatchObject({ orders: 2, revenueKobo: 2_650_000, views: 0 });

    // One value per day, zero-filled, adding up to the stats
    const series = (
      await ada
        .get('/api/sellers/me/analytics/timeseries?range=7d&metric=revenue')
        .expect(200)
    ).body.data as { date: string; value: number }[];
    expect(series).toHaveLength(7);
    expect(series.reduce((n, p) => n + p.value, 0)).toBe(1_650_000);
    expect(series[6].value).toBe(450_000);
    const orders = (
      await ada
        .get('/api/sellers/me/analytics/timeseries?range=90d&metric=orders')
        .expect(200)
    ).body.data as { value: number }[];
    expect(orders).toHaveLength(90);
    expect(orders.reduce((n, p) => n + p.value, 0)).toBe(3);
    const views = (
      await ada
        .get('/api/sellers/me/analytics/timeseries?metric=views')
        .expect(200)
    ).body.data as { value: number }[];
    expect(views[6].value).toBe(2);

    // Best sellers: Ada's only, with views and conversion
    const top = (
      await ada
        .get('/api/sellers/me/analytics/top-listings?range=7d')
        .expect(200)
    ).body.data;
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({
      listingId: adaLamp,
      unitsSold: 1,
      revenueKobo: 1_200_000,
      views: 2,
      conversionPct: 50,
    });
    expect(
      (
        await tunde.get('/api/sellers/me/analytics/top-listings').expect(200)
      ).body.data.map((t: { revenueKobo: number }) => t.revenueKobo),
    ).toEqual([2_000_000, 650_000]);
  });

  it('only sellers get analytics, and the queries are checked', async () => {
    const w = await world();
    const buyer = await signIn(ctx.app, w.buyer.email);
    for (const path of [
      '/api/sellers/me/stats',
      '/api/sellers/me/analytics/timeseries',
      '/api/sellers/me/analytics/top-listings',
      '/api/sellers/me/inventory/alerts',
    ]) {
      await buyer.get(path).expect(403);
      await client(ctx.app).get(path).expect(401);
    }
    const ada = await signIn(ctx.app, w.ada.email);
    await ada.get('/api/sellers/me/stats?range=1y').expect(400);
    await ada.get('/api/sellers/me/stats?sellerId=someone-else').expect(400);
    await ada
      .get('/api/sellers/me/analytics/timeseries?metric=profit')
      .expect(400);
    await ada
      .get('/api/sellers/me/analytics/top-listings?limit=50')
      .expect(400);
  });

  it('a listing with 2 units left appears in the alerts; restocking removes it; sellers are told once', async () => {
    const w = await world();
    const lamp = await fx.createListing(ctx.prisma, w.ada, {
      title: 'Desk lamp',
      stock: 2,
    });
    const pants = await fx.createListing(ctx.prisma, w.ada, {
      title: 'Cargo pants',
      variants: [
        { label: 'M', stock: 0 },
        { label: 'L', stock: 10 },
      ],
    });
    await fx.createListing(ctx.prisma, w.ada, { title: 'Kettle', stock: 8 });
    await fx.createListing(ctx.prisma, w.ada, {
      title: 'Draft mug',
      stock: 0,
      status: ListingStatus.DRAFT,
    });
    // Another seller's low item never shows in Ada's list
    await fx.createListing(ctx.prisma, w.tunde, { title: 'Charger', stock: 1 });

    const ada = await signIn(ctx.app, w.ada.email);
    const alerts = async () =>
      (await ada.get('/api/sellers/me/inventory/alerts').expect(200)).body.data;
    expect(await alerts()).toEqual({
      threshold: 5,
      items: [
        {
          listingId: pants.id,
          variantId: pants.variants.find((v) => v.label === 'M')!.id,
          title: 'Cargo pants',
          variantLabel: 'M',
          imageUrl: expect.stringContaining('lamp.jpg'),
          stock: 0,
        },
        expect.objectContaining({
          listingId: lamp.id,
          variantId: null,
          stock: 2,
        }),
      ],
    });

    // Each seller with a low item is told once (guide 7.2.4)
    const lowStock = ctx.app.get(LowStockService);
    const told = (userId: string) =>
      ctx.prisma.notification.count({ where: { userId, type: 'LOW_STOCK' } });
    await expect(lowStock.notifyNewlyLow()).resolves.toBe(2);
    await expect(lowStock.notifyNewlyLow()).resolves.toBe(0);
    await expect(told(w.ada.id)).resolves.toBe(1);

    // Restocking takes the lamp off the list at once
    await ada.patch(`/api/listings/${lamp.id}`).send({ stock: 10 }).expect(200);
    expect(
      (await alerts()).items.map((i: { title: string }) => i.title),
    ).toEqual(['Cargo pants']);

    // An empty list re-arms the alert; running low again tells the seller again
    await ctx.prisma.listingVariant.updateMany({
      where: { listingId: pants.id },
      data: { stock: 10 },
    });
    await expect(lowStock.notifyNewlyLow()).resolves.toBe(0);
    expect((await alerts()).items).toEqual([]);
    await ctx.prisma.listing.update({
      where: { id: lamp.id },
      data: { stock: 3 },
    });
    await expect(lowStock.notifyNewlyLow()).resolves.toBe(1);
    await expect(told(w.ada.id)).resolves.toBe(2);

    // The level is an admin setting (A1)
    const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
    await (
      await signIn(ctx.app, admin.email)
    )
      .patch('/api/admin/settings')
      .send({ lowStockThreshold: 2 })
      .expect(200);
    expect(await alerts()).toEqual({ threshold: 2, items: [] });
  });
});
