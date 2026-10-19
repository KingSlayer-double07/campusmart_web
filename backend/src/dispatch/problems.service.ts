import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import {
  DeliveryMethod,
  DisputeStatus,
  EscrowStatus,
  FulfillmentStatus,
  OrderStatus,
  ProblemStatus,
  UserRole,
} from '../generated/prisma/enums';
import { sellerDisplayName } from '../listings/listing-rules';
import { NotificationsService } from '../notifications/notifications.service';
import { HANDED_OVER_STATUSES } from '../payments/payment-rules';
import { PayoutsService } from '../payments/payouts.service';
import { RefundsService } from '../payments/refunds.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { isOwnUploadUrl, uploadFolder } from '../uploads/cloudinary-urls';
import { buyerDisplayName, riderName } from './dispatch-rules';
import {
  AdminDisputeDto,
  AdminDisputePageDto,
  AdminProblemPageDto,
  AdminRefundDto,
  AdminRefundResultDto,
  ClosedProblemDto,
  CloseProblemDto,
  DISPUTE_REASONS,
  EARLY_PROBLEM_REASONS,
  ListDisputesQueryDto,
  ListProblemsQueryDto,
  ReportProblemDto,
  ReportResultDto,
  ResolveDisputeDto,
  RiderProblemDto,
} from './dto/problem.dto';

const sellerNameSelect = {
  username: true,
  firstName: true,
  sellerProfile: { select: { storeName: true } },
} satisfies Prisma.UserSelect;

const disputeSelect = {
  id: true,
  reason: true,
  details: true,
  evidenceUrls: true,
  status: true,
  fault: true,
  resolutionNote: true,
  createdAt: true,
  resolvedAt: true,
  sellerOrder: {
    select: {
      id: true,
      orderId: true,
      code: true,
      deliveryMethod: true,
      subtotalKobo: true,
      collectedAt: true,
      seller: { select: sellerNameSelect },
      order: {
        select: { buyer: { select: { username: true, firstName: true } } },
      },
    },
  },
} satisfies Prisma.DisputeSelect;

type DisputeRow = Prisma.DisputeGetPayload<{ select: typeof disputeSelect }>;

const toDisputeDto = (d: DisputeRow): AdminDisputeDto => ({
  id: d.id,
  sellerOrderId: d.sellerOrder.id,
  orderId: d.sellerOrder.orderId,
  code: d.sellerOrder.code,
  storeName: sellerDisplayName(d.sellerOrder.seller),
  buyerName: buyerDisplayName(d.sellerOrder.order.buyer),
  reason: d.reason,
  details: d.details,
  evidenceUrls: d.evidenceUrls,
  status: d.status,
  fault: d.fault,
  resolutionNote: d.resolutionNote,
  deliveryMethod: d.sellerOrder.deliveryMethod,
  subtotalKobo: d.sellerOrder.subtotalKobo,
  handedOverAt: d.sellerOrder.collectedAt,
  createdAt: d.createdAt,
  resolvedAt: d.resolvedAt,
});

// Phase 6: "Report a problem" (C8), disputes and their resolution (F6–F9), and the admin's
// refund for cases they decide themselves (DX6, DL8)
@Injectable()
export class ProblemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly refunds: RefundsService,
    private readonly payouts: PayoutsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // Decision C8: open from payment until 48 hours after handover. Before handover it alerts the
  // admins; after, it's a dispute that holds the payout.
  async report(
    buyer: AuthUser,
    orderId: string,
    sellerOrderId: string,
    dto: ReportProblemDto,
  ): Promise<ReportResultDto> {
    const so = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, orderId, order: { buyerId: buyer.id } },
      select: {
        id: true,
        code: true,
        sellerId: true,
        fulfillmentStatus: true,
        escrowStatus: true,
        releaseAt: true,
        order: { select: { status: true } },
        dispute: { select: { id: true } },
      },
    });
    if (!so) throw new NotFoundException('Order not found');
    if (
      so.order.status !== OrderStatus.PAID ||
      so.fulfillmentStatus === FulfillmentStatus.CANCELLED
    ) {
      throw new ConflictException({
        code: 'CANNOT_REPORT',
        message:
          'You can report a problem once the order is paid, until 48 hours after you receive it',
      });
    }
    if (so.dispute || so.fulfillmentStatus === FulfillmentStatus.DISPUTED) {
      throw new ConflictException({
        code: 'ALREADY_REPORTED',
        message:
          "You've already reported a problem with this order. CampusMart is looking into it.",
      });
    }

    if (!HANDED_OVER_STATUSES.includes(so.fulfillmentStatus)) {
      return this.earlyProblem(buyer, orderId, so, dto);
    }
    if (
      !so.releaseAt ||
      so.releaseAt.getTime() <= Date.now() ||
      so.escrowStatus !== EscrowStatus.HELD
    ) {
      throw new ConflictException({
        code: 'DISPUTE_WINDOW_CLOSED',
        message:
          'Problems can be reported up to 48 hours after you receive the order',
      });
    }
    if (!(DISPUTE_REASONS as readonly string[]).includes(dto.reason)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Choose what was wrong with the order',
      });
    }
    const evidenceUrls = this.checkEvidence(buyer.id, dto.evidenceUrls);
    const dispute = await this.prisma.$transaction(async (tx) => {
      const held = await tx.sellerOrder.updateMany({
        where: {
          id: so.id,
          fulfillmentStatus: { in: HANDED_OVER_STATUSES },
          escrowStatus: EscrowStatus.HELD,
        },
        data: { fulfillmentStatus: FulfillmentStatus.DISPUTED },
      });
      if (held.count !== 1) {
        throw new ConflictException({
          code: 'DISPUTE_WINDOW_CLOSED',
          message:
            'Problems can be reported up to 48 hours after you receive the order',
        });
      }
      const created = await tx.dispute.create({
        data: {
          sellerOrderId: so.id,
          openedById: buyer.id,
          reason: dto.reason,
          details: dto.details ?? null,
          evidenceUrls,
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          actorId: buyer.id,
          action: 'DISPUTE_OPENED',
          entityType: 'SellerOrder',
          entityId: so.id,
          meta: { disputeId: created.id, reason: dto.reason },
        },
        tx,
      );
      return created;
    });
    await this.notifications.alertAdmins({
      type: 'DISPUTE_OPENED',
      title: `Dispute on ${so.code}`,
      body: `The buyer says: ${dto.reason.replaceAll('_', ' ').toLowerCase()}. The payout is on hold until you decide.`,
      link: `/admin/disputes/${dispute.id}`,
      data: { disputeId: dispute.id },
    });
    await this.notifications.notify(so.sellerId, {
      type: 'DISPUTE_OPENED',
      title: `The buyer reported a problem with ${so.code}`,
      body: 'Your payout for it is on hold while CampusMart looks into it.',
      link: `/sellers/orders/${so.id}`,
    });
    return { kind: 'DISPUTE', id: dispute.id };
  }

  // Decision DL8: the rider reports a buyer who didn't show; an admin decides what happens
  async riderReport(
    rider: AuthUser,
    jobId: string,
    dto: RiderProblemDto,
  ): Promise<ReportResultDto> {
    const job = await this.prisma.deliveryJob.findFirst({
      where: { id: jobId, riderId: rider.id },
      select: { id: true, orderId: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    const report = await this.prisma.problemReport.create({
      data: {
        orderId: job.orderId,
        reporterId: rider.id,
        reporterRole: UserRole.DISPATCH,
        reason: dto.reason,
        details: dto.details ?? null,
      },
      select: { id: true },
    });
    await this.notifications.alertAdmins({
      type: 'PROBLEM_REPORTED',
      title:
        dto.reason === 'BUYER_NO_SHOW'
          ? 'A buyer didn’t show for a delivery'
          : 'A rider reported a problem',
      body: `${riderName(rider)}: ${dto.details ?? dto.reason.replaceAll('_', ' ').toLowerCase()}`,
      link: '/admin/disputes?tab=PROBLEMS',
      data: { problemId: report.id, jobId },
    });
    return { kind: 'PROBLEM', id: report.id };
  }

  async disputes(query: ListDisputesQueryDto): Promise<AdminDisputePageDto> {
    const rows = await this.prisma.dispute.findMany({
      where:
        query.status === 'OPEN'
          ? { status: DisputeStatus.OPEN }
          : { status: { not: DisputeStatus.OPEN } },
      orderBy:
        query.status === 'OPEN'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ resolvedAt: 'desc' }, { id: 'desc' }],
      select: disputeSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDisputeDto) };
  }

  async dispute(id: string): Promise<AdminDisputeDto> {
    const row = await this.prisma.dispute.findUnique({
      where: { id },
      select: disputeSelect,
    });
    if (!row) throw new NotFoundException('Dispute not found');
    return toDisputeDto(row);
  }

  // Decision F8: a full refund (with whose fault it was, P6) or a full release to the seller
  async resolve(
    id: string,
    dto: ResolveDisputeDto,
    adminId: string,
  ): Promise<AdminDisputeDto> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        sellerOrder: {
          select: {
            id: true,
            code: true,
            orderId: true,
            sellerId: true,
            deliveryMethod: true,
            order: { select: { buyerId: true } },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== DisputeStatus.OPEN) {
      throw new ConflictException({
        code: 'DISPUTE_RESOLVED',
        message: 'This dispute has already been decided',
      });
    }
    const so = dispute.sellerOrder;
    const now = new Date();

    if (dto.outcome === 'REFUND') {
      // Claim the dispute first so two admins can't both decide it
      const claimed = await this.prisma.dispute.updateMany({
        where: { id, status: DisputeStatus.OPEN },
        data: {
          status: DisputeStatus.RESOLVED_REFUND,
          fault: dto.fault,
          resolutionNote: dto.note,
          resolvedById: adminId,
          resolvedAt: now,
        },
      });
      if (claimed.count !== 1) throw resolvedAlready();
      try {
        await this.refunds.refundSellerOrder(so.id, {
          reason: 'DISPUTE_REFUND',
          fault: dto.fault!,
          actorId: adminId,
          note: dto.note,
        });
      } catch (error) {
        // Nothing was refunded, so the dispute is still open
        await this.prisma.dispute.update({
          where: { id },
          data: {
            status: DisputeStatus.OPEN,
            fault: null,
            resolutionNote: null,
            resolvedById: null,
            resolvedAt: null,
          },
        });
        throw error;
      }
    } else {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.dispute.updateMany({
          where: { id, status: DisputeStatus.OPEN },
          data: {
            status: DisputeStatus.RESOLVED_RELEASE,
            resolutionNote: dto.note,
            resolvedById: adminId,
            resolvedAt: now,
          },
        });
        if (claimed.count !== 1) throw resolvedAlready();
        // Back to handed over; the money goes to the seller now rather than at releaseAt
        await tx.sellerOrder.update({
          where: { id: so.id },
          data: {
            fulfillmentStatus:
              so.deliveryMethod === DeliveryMethod.DISPATCH
                ? FulfillmentStatus.DELIVERED
                : FulfillmentStatus.COLLECTED,
            releaseAt: now,
          },
        });
      });
      await this.payouts.release(so.id, adminId);
    }
    await this.audit.record({
      actorId: adminId,
      action: 'DISPUTE_RESOLVED',
      entityType: 'Dispute',
      entityId: id,
      meta: {
        outcome: dto.outcome,
        ...(dto.fault && { fault: dto.fault }),
        note: dto.note,
      },
    });
    const refunded = dto.outcome === 'REFUND';
    await this.notifications.notify(so.order.buyerId, {
      type: 'DISPUTE_RESOLVED',
      title: `Decision on ${so.code}`,
      body: refunded
        ? `You'll get a refund. ${dto.note}`
        : `The order stands and the seller is paid. ${dto.note}`,
      link: `/orders/${so.orderId}`,
    });
    await this.notifications.notify(so.sellerId, {
      type: 'DISPUTE_RESOLVED',
      title: `Decision on ${so.code}`,
      body: refunded
        ? `The buyer is refunded. ${dto.note}`
        : `Your payout is released. ${dto.note}`,
      link: `/sellers/orders/${so.id}`,
    });
    return this.dispute(id);
  }

  async problems(query: ListProblemsQueryDto): Promise<AdminProblemPageDto> {
    const rows = await this.prisma.problemReport.findMany({
      where: { status: query.status },
      orderBy:
        query.status === ProblemStatus.OPEN
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ resolvedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        orderId: true,
        sellerOrderId: true,
        reporterId: true,
        reporterRole: true,
        reason: true,
        details: true,
        status: true,
        resolutionNote: true,
        createdAt: true,
        order: {
          select: {
            sellerOrders: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                code: true,
                fulfillmentStatus: true,
                seller: { select: sellerNameSelect },
              },
            },
          },
        },
      },
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    const reporters = await this.prisma.user.findMany({
      where: { id: { in: page.items.map((r) => r.reporterId) } },
      select: { id: true, username: true, firstName: true, lastName: true },
    });
    const nameOf = (id: string, role: UserRole) => {
      const user = reporters.find((u) => u.id === id);
      if (!user) return 'Unknown';
      return role === UserRole.DISPATCH
        ? riderName(user)
        : buyerDisplayName(user);
    };
    return {
      ...page,
      items: page.items.map((r) => {
        const store = r.order.sellerOrders.find(
          (so) => so.id === r.sellerOrderId,
        );
        return {
          id: r.id,
          orderId: r.orderId,
          sellerOrderId: r.sellerOrderId,
          code: store?.code ?? null,
          storeName: store ? sellerDisplayName(store.seller) : null,
          reporterRole: r.reporterRole,
          reporterName: nameOf(r.reporterId, r.reporterRole),
          reason: r.reason,
          details: r.details,
          status: r.status,
          resolutionNote: r.resolutionNote,
          storeStates: r.order.sellerOrders.map(
            (so) => `${so.code}: ${so.fulfillmentStatus}`,
          ),
          createdAt: r.createdAt,
        };
      }),
    };
  }

  async closeProblem(
    id: string,
    dto: CloseProblemDto,
    adminId: string,
  ): Promise<ClosedProblemDto> {
    const closed = await this.prisma.problemReport.updateMany({
      where: { id, status: ProblemStatus.OPEN },
      data: {
        status: ProblemStatus.CLOSED,
        resolutionNote: dto.note,
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });
    if (closed.count !== 1) {
      const exists = await this.prisma.problemReport.count({ where: { id } });
      if (!exists) throw new NotFoundException('Report not found');
      throw new ConflictException({
        code: 'PROBLEM_CLOSED',
        message: 'This report is already closed',
      });
    }
    await this.audit.record({
      actorId: adminId,
      action: 'PROBLEM_CLOSED',
      entityType: 'ProblemReport',
      entityId: id,
      meta: { note: dto.note },
    });
    return { id, closed: true };
  }

  // Decisions DX6 and DL8: the admin decides a lost parcel or a no-show, and whose fault it was.
  // A dispute is decided through the dispute instead.
  async adminRefund(
    sellerOrderId: string,
    dto: AdminRefundDto,
    adminId: string,
  ): Promise<AdminRefundResultDto> {
    const so = await this.prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      select: { id: true, fulfillmentStatus: true },
    });
    if (!so) throw new NotFoundException('Order not found');
    if (so.fulfillmentStatus === FulfillmentStatus.DISPUTED) {
      throw new ConflictException({
        code: 'DISPUTE_OPEN',
        message: 'This order has an open dispute; decide it there',
      });
    }
    await this.refunds.refundSellerOrder(so.id, {
      reason: 'ADMIN_REFUND',
      fault: dto.fault,
      actorId: adminId,
      note: dto.reason,
    });
    return { sellerOrderId: so.id, refunded: true };
  }

  private async earlyProblem(
    buyer: AuthUser,
    orderId: string,
    so: { id: string; code: string },
    dto: ReportProblemDto,
  ): Promise<ReportResultDto> {
    if (!(EARLY_PROBLEM_REASONS as readonly string[]).includes(dto.reason)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Before it reaches you, choose late, lost or something else',
      });
    }
    const report = await this.prisma.problemReport.create({
      data: {
        orderId,
        sellerOrderId: so.id,
        reporterId: buyer.id,
        reporterRole: UserRole.BUYER,
        reason: dto.reason,
        details: dto.details ?? null,
      },
      select: { id: true },
    });
    await this.notifications.alertAdmins({
      type: 'PROBLEM_REPORTED',
      title: `Problem reported on ${so.code}`,
      body: `The buyer says: ${dto.details ?? dto.reason.toLowerCase()}`,
      link: '/admin/disputes?tab=PROBLEMS',
      data: { problemId: report.id },
    });
    return { kind: 'PROBLEM', id: report.id };
  }

  // Decision F7: photos are optional, up to 3, uploaded to the buyer's own dispute folder
  private checkEvidence(userId: string, urls: string[] | undefined): string[] {
    if (!urls?.length) return [];
    const { cloudName } = this.cloudinary.requireSettings();
    const folder = uploadFolder('DISPUTE', userId);
    if (urls.some((url) => !isOwnUploadUrl(url, cloudName, folder))) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message:
          "A photo wasn't uploaded through CampusMart. Please add it again.",
      });
    }
    return urls;
  }
}

const resolvedAlready = () =>
  new ConflictException({
    code: 'DISPUTE_RESOLVED',
    message: 'This dispute has already been decided',
  });
