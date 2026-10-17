import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { lagosDay } from './analytics-rules';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  const prisma = {
    sellerOrder: { aggregate: jest.fn() },
    payout: { aggregate: jest.fn() },
    listingDailyStat: { aggregate: jest.fn(), groupBy: jest.fn() },
    listing: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key))),
    set: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve(value);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    store.clear();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  function salesThenViews() {
    // Current range, then the previous one
    prisma.sellerOrder.aggregate
      .mockResolvedValueOnce({
        _count: { _all: 4 },
        _sum: { subtotalKobo: 2_000_000 },
      })
      .mockResolvedValueOnce({
        _count: { _all: 0 },
        _sum: { subtotalKobo: null },
      })
      .mockResolvedValueOnce({ _sum: { sellerPayoutKobo: 950_000 } });
    prisma.listingDailyStat.aggregate
      .mockResolvedValueOnce({ _sum: { views: 30 } })
      .mockResolvedValueOnce({ _sum: { views: 20 } });
    prisma.payout.aggregate
      .mockResolvedValueOnce({ _sum: { amountKobo: 400_000 } })
      .mockResolvedValueOnce({ _sum: { amountKobo: null } });
  }

  it('builds the stats from the seller’s own rows, with change against the previous range', async () => {
    salesThenViews();
    await expect(service.stats('s1', '7d')).resolves.toEqual({
      range: '7d',
      views: 30,
      viewsChangePct: 50,
      orders: 4,
      ordersChangePct: null,
      revenueKobo: 2_000_000,
      revenueChangePct: null,
      heldKobo: 950_000,
      releasedKobo: 400_000,
      paidOutKobo: 0,
    });
    for (const [args] of prisma.sellerOrder.aggregate.mock.calls) {
      expect(args.where.sellerId).toBe('s1');
    }
    expect(prisma.sellerOrder.aggregate.mock.calls[0][0].where).toMatchObject({
      fulfillmentStatus: { not: 'CANCELLED' },
      order: { status: 'PAID' },
    });
  });

  it('answers again from the cache for 60 seconds, per seller and range', async () => {
    salesThenViews();
    const first = await service.stats('s1', '7d');
    await expect(service.stats('s1', '7d')).resolves.toEqual(first);
    expect(prisma.sellerOrder.aggregate).toHaveBeenCalledTimes(3);
    expect(cache.set).toHaveBeenCalledWith('stats:s1:7d', first, 60_000);
  });

  it('fills days without sales with 0', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { day: new Date(`${lagosDay(new Date())}T00:00:00Z`), value: BigInt(3) },
    ]);
    const series = await service.timeseries('s1', '7d', 'orders');
    expect(series).toHaveLength(7);
    expect(series.filter((p) => p.value === 0)).toHaveLength(6);
    expect(series.map((p) => p.value).reduce((a, b) => a + b)).toBe(3);
  });

  it('top listings carry views and conversion, and nothing when nothing sold', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.topListings('s1', '30d', 5)).resolves.toEqual([]);

    prisma.$queryRaw.mockResolvedValueOnce([
      { listingId: 'l1', units: 3, revenue: BigInt(1_350_000) },
    ]);
    prisma.listing.findMany.mockResolvedValue([
      { id: 'l1', title: 'Desk lamp', images: [{ url: 'lamp.jpg' }] },
    ]);
    prisma.listingDailyStat.groupBy.mockResolvedValue([
      { listingId: 'l1', _sum: { views: 40 } },
    ]);
    await expect(service.topListings('s1', '7d', 5)).resolves.toEqual([
      {
        listingId: 'l1',
        title: 'Desk lamp',
        imageUrl: 'lamp.jpg',
        unitsSold: 3,
        revenueKobo: 1_350_000,
        views: 40,
        conversionPct: 7.5,
      },
    ]);
  });
});
