import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FAULT_DAYS, RECENT_ORDERS, trustScore } from './trust-rules';
import type { TrustWeights } from './trust-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

interface SellerRow {
  id: string;
  trustScore: number;
  verified: boolean;
  ratingAvg: number;
  completed: number;
  settled: number;
  faults: number;
}

// Guide 8.4: every seller's trust score, recalculated nightly. A changed weight applies at the
// next run (R1b). "Completed" means delivered or collected; settled orders are those paid and
// finished either way. Seller-fault refunds include the seller's own cancellations (F10, P6).
@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron('30 2 * * *', { name: 'trust-scores', timeZone: 'Africa/Lagos' })
  async nightly(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    try {
      const changed = await this.recalculate(new Date());
      this.logger.log(`Trust scores recalculated; ${changed} changed`);
    } catch (error) {
      this.logger.error(
        `Trust scores failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Returns how many sellers' scores changed
  async recalculate(now: Date): Promise<number> {
    const s = await this.settings.all();
    const weights: TrustWeights = {
      rating: s.trustWeightRating,
      completed: s.trustWeightCompleted,
      verified: s.trustWeightVerified,
      penalty: s.trustPenaltySellerFault,
    };
    const since = new Date(now.getTime() - FAULT_DAYS * DAY_MS).toISOString();
    const rows = await this.prisma.$queryRaw<SellerRow[]>`
      WITH recent AS (
        SELECT so."sellerId", so."fulfillmentStatus",
               row_number() OVER (
                 PARTITION BY so."sellerId" ORDER BY so."createdAt" DESC, so."id" DESC
               ) AS rn
        FROM "SellerOrder" so
        WHERE so."escrowStatus" <> 'PENDING'
          AND so."fulfillmentStatus" IN ('DELIVERED', 'COLLECTED', 'CANCELLED')
      ),
      shares AS (
        SELECT "sellerId",
               COUNT(*) FILTER (WHERE "fulfillmentStatus" IN ('DELIVERED', 'COLLECTED'))::int AS completed,
               COUNT(*)::int AS settled
        FROM recent WHERE rn <= ${RECENT_ORDERS}
        GROUP BY "sellerId"
      ),
      faults AS (
        SELECT so."sellerId", COUNT(*)::int AS faults
        FROM "Refund" r
        JOIN "SellerOrder" so ON so."id" = r."sellerOrderId"
        WHERE r."fault" = 'SELLER'
          AND r."createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
        GROUP BY so."sellerId"
      )
      SELECT u."id", u."trustScore",
             u."verificationStatus" = 'VERIFIED' AS verified,
             COALESCE(sp."ratingAvg", 0) AS "ratingAvg",
             COALESCE(sh.completed, 0) AS completed,
             COALESCE(sh.settled, 0) AS settled,
             COALESCE(f.faults, 0) AS faults
      FROM "User" u
      LEFT JOIN "SellerProfile" sp ON sp."userId" = u."id"
      LEFT JOIN shares sh ON sh."sellerId" = u."id"
      LEFT JOIN faults f ON f."sellerId" = u."id"
      WHERE u."role" = 'SELLER'`;
    let changed = 0;
    for (const row of rows) {
      const score = trustScore(
        {
          ratingAvg: Number(row.ratingAvg),
          completed: row.completed,
          settled: row.settled,
          verified: row.verified,
          sellerFaults: row.faults,
        },
        weights,
      );
      if (score === row.trustScore) continue;
      await this.prisma.user.update({
        where: { id: row.id },
        data: { trustScore: score },
      });
      changed += 1;
    }
    return changed;
  }
}
