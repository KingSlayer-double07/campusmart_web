import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ListingStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { stockAlerts } from './analytics-rules';
import { InventoryAlertsDto } from './dto/analytics.dto';

// Live and sold-out listings count; drafts, archived and flagged ones don't
const WATCHED = [ListingStatus.ACTIVE, ListingStatus.SOLDOUT];

// The same items stockAlerts() lists, one row per item, for every seller at once
const lowItemsSql = (threshold: number) => Prisma.sql`
  SELECT l."sellerId"
  FROM "Listing" l
  JOIN "ListingVariant" v ON v."listingId" = l."id" AND v."isActive"
  WHERE NOT l."isDeleted" AND l."status" IN ('ACTIVE', 'SOLDOUT') AND v."stock" <= ${threshold}
  UNION ALL
  SELECT l."sellerId"
  FROM "Listing" l
  WHERE NOT l."isDeleted" AND l."status" IN ('ACTIVE', 'SOLDOUT') AND l."stock" <= ${threshold}
    AND NOT EXISTS (
      SELECT 1 FROM "ListingVariant" v WHERE v."listingId" = l."id" AND v."isActive"
    )`;

// Guide 7.1 and 7.2.4: items at or below the low-stock level (A1), and a notification when a
// seller's list goes from empty to not empty
@Injectable()
export class LowStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async alerts(sellerId: string): Promise<InventoryAlertsDto> {
    const threshold = await this.settings.get('lowStockThreshold');
    const rows = await this.prisma.listing.findMany({
      where: { sellerId, isDeleted: false, status: { in: WATCHED } },
      select: {
        id: true,
        title: true,
        stock: true,
        images: {
          orderBy: { position: 'asc' },
          take: 1,
          select: { url: true },
        },
        variants: {
          where: { isActive: true },
          select: { id: true, label: true, stock: true },
        },
      },
    });
    return {
      threshold,
      items: stockAlerts(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          stock: r.stock,
          imageUrl: r.images[0]?.url ?? null,
          variants: r.variants,
        })),
        threshold,
      ),
    };
  }

  // Run every few minutes: tells each seller whose list just became non-empty, once, and
  // re-arms sellers whose list is empty again. Returns how many were told.
  async notifyNewlyLow(): Promise<number> {
    const threshold = await this.settings.get('lowStockThreshold');
    const told = await this.prisma.$queryRaw<
      { sellerId: string; items: number }[]
    >`
      WITH low AS (
        SELECT "sellerId", COUNT(*)::int AS items
        FROM (${lowItemsSql(threshold)}) i
        GROUP BY "sellerId"
      )
      UPDATE "SellerProfile" sp
      SET "lowStockAlertedAt" = now()
      FROM low
      WHERE sp."userId" = low."sellerId" AND sp."lowStockAlertedAt" IS NULL
      RETURNING sp."userId" AS "sellerId", low.items`;
    await this.prisma.$executeRaw`
      UPDATE "SellerProfile" sp
      SET "lowStockAlertedAt" = NULL
      WHERE sp."lowStockAlertedAt" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM (${lowItemsSql(threshold)}) i WHERE i."sellerId" = sp."userId"
        )`;
    for (const { sellerId, items } of told) {
      await this.notifications.notify(
        sellerId,
        {
          type: 'LOW_STOCK',
          title: 'Some items are running low',
          body: `${items} ${items === 1 ? 'item has' : 'items have'} ${threshold} or fewer left. Restock so buyers can keep ordering.`,
          link: '/sellers/analytics#stock',
        },
        { email: false },
      );
    }
    return told.length;
  }
}
