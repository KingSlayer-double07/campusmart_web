import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Prisma } from '../generated/prisma/client';
import {
  EscrowStatus,
  FulfillmentStatus,
  OrderStatus,
  PayoutStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  changePct,
  conversionPct,
  daysOf,
  lagosDay,
  rangeWindows,
} from './analytics-rules';
import type { DayWindow, Metric, Range } from './analytics-rules';
import {
  SellerStatsDto,
  TimeseriesPointDto,
  TopListingDto,
} from './dto/analytics.dto';

const CACHE_MS = 60_000;

// Guide 7.1 "Orders": the seller's store orders in a paid order, placed in the window, not cancelled
const countedOrders = (sellerId: string, w: DayWindow) =>
  ({
    sellerId,
    createdAt: { gte: w.from, lt: w.to },
    fulfillmentStatus: { not: FulfillmentStatus.CANCELLED },
    order: { status: OrderStatus.PAID },
  }) satisfies Prisma.SellerOrderWhereInput;

// The same rule in SQL, for grouping by day or listing. createdAt is stored in UTC without a zone.
const countedOrdersSql = (sellerId: string, w: DayWindow) => Prisma.sql`
  so."sellerId" = ${sellerId}
  AND o."status" = 'PAID'
  AND so."fulfillmentStatus" <> 'CANCELLED'
  AND so."createdAt" >= (${w.from.toISOString()}::timestamptz AT TIME ZONE 'UTC')
  AND so."createdAt" < (${w.to.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

const lagosDaySql = Prisma.sql`((so."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos')::date`;

const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

// Guide 7.1: a seller's own numbers, never anyone else's. Each answer is kept for 60 seconds.
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  stats(sellerId: string, range: Range): Promise<SellerStatsDto> {
    return this.cached(`stats:${sellerId}:${range}`, async () => {
      const { current, previous } = rangeWindows(range, new Date());
      const [now, before, views, viewsBefore, held, released, paidOut] =
        await Promise.all([
          this.sales(sellerId, current),
          this.sales(sellerId, previous),
          this.views(sellerId, current),
          this.views(sellerId, previous),
          this.prisma.sellerOrder.aggregate({
            where: { sellerId, escrowStatus: EscrowStatus.HELD },
            _sum: { sellerPayoutKobo: true },
          }),
          this.prisma.payout.aggregate({
            where: { sellerId, status: { not: PayoutStatus.PAID } },
            _sum: { amountKobo: true },
          }),
          this.prisma.payout.aggregate({
            where: {
              sellerId,
              status: PayoutStatus.PAID,
              paidAt: { gte: current.from, lt: current.to },
            },
            _sum: { amountKobo: true },
          }),
        ]);
      return {
        range,
        views,
        viewsChangePct: changePct(views, viewsBefore),
        orders: now.orders,
        ordersChangePct: changePct(now.orders, before.orders),
        revenueKobo: now.revenueKobo,
        revenueChangePct: changePct(now.revenueKobo, before.revenueKobo),
        heldKobo: held._sum.sellerPayoutKobo ?? 0,
        releasedKobo: released._sum.amountKobo ?? 0,
        paidOutKobo: paidOut._sum.amountKobo ?? 0,
      };
    });
  }

  timeseries(
    sellerId: string,
    range: Range,
    metric: Metric,
  ): Promise<TimeseriesPointDto[]> {
    return this.cached(`series:${sellerId}:${range}:${metric}`, async () => {
      const { current } = rangeWindows(range, new Date());
      const rows = await this.prisma.$queryRaw<
        { day: Date; value: bigint | number }[]
      >(this.seriesSql(sellerId, current, metric));
      const byDay = new Map(
        rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.value)]),
      );
      return daysOf(current).map((date) => ({
        date,
        value: byDay.get(date) ?? 0,
      }));
    });
  }

  topListings(
    sellerId: string,
    range: Range,
    limit: number,
  ): Promise<TopListingDto[]> {
    return this.cached(`top:${sellerId}:${range}:${limit}`, async () => {
      const { current } = rangeWindows(range, new Date());
      const sold = await this.prisma.$queryRaw<
        { listingId: string; units: number; revenue: bigint | number }[]
      >`
        SELECT oi."listingId" AS "listingId",
               SUM(oi."quantity")::int AS units,
               SUM(oi."quantity" * oi."unitPriceKobo")::bigint AS revenue
        FROM "OrderItem" oi
        JOIN "SellerOrder" so ON so."id" = oi."sellerOrderId"
        JOIN "Order" o ON o."id" = so."orderId"
        WHERE ${countedOrdersSql(sellerId, current)}
        GROUP BY oi."listingId"
        ORDER BY units DESC, revenue DESC, oi."listingId"
        LIMIT ${limit}`;
      if (sold.length === 0) return [];
      const ids = sold.map((s) => s.listingId);
      const [listings, views] = await Promise.all([
        this.prisma.listing.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            title: true,
            images: {
              orderBy: { position: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        }),
        this.prisma.listingDailyStat.groupBy({
          by: ['listingId'],
          where: {
            listingId: { in: ids },
            date: {
              gte: dateOf(current.firstDay),
              lte: dateOf(current.lastDay),
            },
          },
          _sum: { views: true },
        }),
      ]);
      const listingById = new Map(listings.map((l) => [l.id, l]));
      const viewsById = new Map(
        views.map((v) => [v.listingId, v._sum.views ?? 0]),
      );
      return sold.map((s) => {
        const listing = listingById.get(s.listingId);
        const seen = viewsById.get(s.listingId) ?? 0;
        return {
          listingId: s.listingId,
          title: listing?.title ?? 'Removed listing',
          imageUrl: listing?.images[0]?.url ?? null,
          unitsSold: s.units,
          revenueKobo: Number(s.revenue),
          views: seen,
          conversionPct: conversionPct(s.units, seen),
        };
      });
    });
  }

  // Decision A2's raw rows only matter for today; older ones are pruned nightly
  async pruneViews(now: Date): Promise<number> {
    const { count } = await this.prisma.listingView.deleteMany({
      where: { date: { lt: dateOf(lagosDay(now)) } },
    });
    return count;
  }

  private async sales(sellerId: string, w: DayWindow) {
    const agg = await this.prisma.sellerOrder.aggregate({
      where: countedOrders(sellerId, w),
      _count: { _all: true },
      _sum: { subtotalKobo: true },
    });
    return {
      orders: agg._count._all,
      revenueKobo: agg._sum.subtotalKobo ?? 0,
    };
  }

  private async views(sellerId: string, w: DayWindow): Promise<number> {
    const agg = await this.prisma.listingDailyStat.aggregate({
      where: {
        listing: { sellerId },
        date: { gte: dateOf(w.firstDay), lte: dateOf(w.lastDay) },
      },
      _sum: { views: true },
    });
    return agg._sum.views ?? 0;
  }

  private seriesSql(sellerId: string, w: DayWindow, metric: Metric) {
    if (metric === 'views') {
      return Prisma.sql`
        SELECT s."date" AS day, SUM(s."views")::bigint AS value
        FROM "ListingDailyStat" s
        JOIN "Listing" l ON l."id" = s."listingId"
        WHERE l."sellerId" = ${sellerId}
          AND s."date" BETWEEN ${w.firstDay}::date AND ${w.lastDay}::date
        GROUP BY s."date"`;
    }
    const value =
      metric === 'orders'
        ? Prisma.sql`COUNT(*)::bigint`
        : Prisma.sql`SUM(so."subtotalKobo")::bigint`;
    return Prisma.sql`
      SELECT ${lagosDaySql} AS day, ${value} AS value
      FROM "SellerOrder" so
      JOIN "Order" o ON o."id" = so."orderId"
      WHERE ${countedOrdersSql(sellerId, w)}
      GROUP BY 1`;
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = await this.cache.get<T>(key);
    if (hit !== undefined && hit !== null) return hit;
    const value = await load();
    await this.cache.set(key, value, CACHE_MS);
    return value;
  }
}
