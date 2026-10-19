import { Injectable } from '@nestjs/common';
import {
  DisputeStatus,
  EscrowStatus,
  PayoutStatus,
  UserRole,
  VerificationStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { inReview } from './admin-listings.service';
import { AdminOverviewDto } from './dto/moderation.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

// Guide 9.1 overview: what the platform looks like now, and what's waiting for an admin
@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async get(now = new Date()): Promise<AdminOverviewDto> {
    const since = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const [
      users,
      sellers,
      paidOrders7d,
      paid30d,
      escrow,
      openDisputes,
      pendingVerifications,
      failedPayouts,
      listingsToReview,
      openReports,
      suspendedUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.SELLER } }),
      this.prisma.order.count({ where: { paidAt: { gte: since(7) } } }),
      this.prisma.order.aggregate({
        where: { paidAt: { gte: since(30) } },
        _count: { _all: true },
        _sum: { totalKobo: true },
      }),
      this.prisma.sellerOrder.aggregate({
        where: { escrowStatus: EscrowStatus.HELD },
        _sum: { sellerPayoutKobo: true },
      }),
      this.prisma.dispute.count({ where: { status: DisputeStatus.OPEN } }),
      this.prisma.verificationRequest.count({
        where: { status: VerificationStatus.PENDING },
      }),
      this.prisma.payout.count({ where: { status: PayoutStatus.FAILED } }),
      this.prisma.listing.count({ where: { isDeleted: false, ...inReview } }),
      this.prisma.supportReport.count({ where: { status: 'OPEN' } }),
      this.prisma.user.count({ where: { isSuspended: true } }),
    ]);
    return {
      users,
      sellers,
      paidOrders7d,
      paidOrders30d: paid30d._count._all,
      gmv30dKobo: paid30d._sum.totalKobo ?? 0,
      escrowHeldKobo: escrow._sum.sellerPayoutKobo ?? 0,
      openDisputes,
      pendingVerifications,
      failedPayouts,
      listingsToReview,
      openReports,
      suspendedUsers,
    };
  }
}
