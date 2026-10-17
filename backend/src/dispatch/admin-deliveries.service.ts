import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import {
  DeliveryJobStatus,
  DeliveryMethod,
  FulfillmentStatus,
  UserRole,
} from '../generated/prisma/enums';
import { sellerDisplayName } from '../listings/listing-rules';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buyerDisplayName,
  LIVE_JOB,
  riderName,
  TO_COLLECT,
} from './dispatch-rules';
import {
  AdminDeliveryJobDto,
  AdminDeliveryJobPageDto,
  AssignRiderDto,
  ListDeliveriesQueryDto,
  LockedHandoverPageDto,
} from './dto/admin-delivery.dto';
import { CursorQueryDto } from '../common/pagination';

const adminJobSelect = {
  id: true,
  status: true,
  createdAt: true,
  acceptedAt: true,
  unacceptedAlertAt: true,
  institution: { select: { name: true } },
  rider: { select: { id: true, firstName: true, lastName: true } },
  order: {
    select: {
      id: true,
      buyerId: true,
      deliveryAddress: true,
      campusPlace: { select: { name: true } },
      buyer: { select: { username: true, firstName: true } },
      sellerOrders: {
        where: { deliveryMethod: DeliveryMethod.DISPATCH },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          code: true,
          sellerId: true,
          fulfillmentStatus: true,
          pickupDeadline: true,
          pickedUpAt: true,
          notReadyAt: true,
          collectedAt: true,
          handoverLockedAt: true,
          seller: {
            select: {
              username: true,
              firstName: true,
              sellerProfile: {
                select: { storeName: true, pickupArea: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DeliveryJobSelect;

type AdminJobRow = Prisma.DeliveryJobGetPayload<{
  select: typeof adminJobSelect;
}>;

const toDto = (row: AdminJobRow): AdminDeliveryJobDto => ({
  id: row.id,
  orderId: row.order.id,
  status: row.status,
  createdAt: row.createdAt,
  acceptedAt: row.acceptedAt,
  unacceptedAlertAt: row.unacceptedAlertAt,
  institutionName: row.institution.name,
  rider: row.rider ? { id: row.rider.id, name: riderName(row.rider) } : null,
  buyerName: buyerDisplayName(row.order.buyer),
  destination:
    row.order.campusPlace?.name ??
    `Off campus: ${row.order.deliveryAddress ?? ''}`.trim(),
  stops: row.order.sellerOrders.map((so) => ({
    sellerOrderId: so.id,
    code: so.code,
    storeName: sellerDisplayName(so.seller),
    area: so.seller.sellerProfile?.pickupArea ?? null,
    status: so.fulfillmentStatus,
    pickupDeadline: so.pickupDeadline,
    pickedUpAt: so.pickedUpAt,
    notReadyAt: so.notReadyAt,
    deliveredAt:
      so.fulfillmentStatus === FulfillmentStatus.DELIVERED
        ? so.collectedAt
        : null,
    handoverLocked: so.handoverLockedAt !== null,
  })),
});

const VIEWS: Record<
  ListDeliveriesQueryDto['view'],
  DeliveryJobStatus[] | undefined
> = {
  OPEN: [DeliveryJobStatus.OPEN],
  ACTIVE: [DeliveryJobStatus.ASSIGNED],
  DONE: [DeliveryJobStatus.DONE, DeliveryJobStatus.CANCELLED],
  ALL: undefined,
};

// Phase 6 for admins: every delivery job, assigning riders (C5), and unlocking handovers (F5)
@Injectable()
export class AdminDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListDeliveriesQueryDto): Promise<AdminDeliveryJobPageDto> {
    const statuses = VIEWS[query.view];
    const rows = await this.prisma.deliveryJob.findMany({
      where: {
        ...(statuses && { status: { in: statuses } }),
        ...(query.institutionId && { institutionId: query.institutionId }),
      },
      orderBy:
        query.view === 'OPEN'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: adminJobSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  // Seller orders locked after 5 wrong buyer codes, by rider or seller handover (F5)
  async locked(query: CursorQueryDto): Promise<LockedHandoverPageDto> {
    const rows = await this.prisma.sellerOrder.findMany({
      where: { handoverLockedAt: { not: null } },
      orderBy: [{ handoverLockedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        orderId: true,
        code: true,
        deliveryMethod: true,
        handoverLockedAt: true,
        seller: {
          select: {
            username: true,
            firstName: true,
            sellerProfile: { select: { storeName: true } },
          },
        },
        order: {
          select: { buyer: { select: { username: true, firstName: true } } },
        },
      },
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return {
      ...page,
      items: page.items.map((so) => ({
        sellerOrderId: so.id,
        orderId: so.orderId,
        code: so.code,
        storeName: sellerDisplayName(so.seller),
        buyerName: buyerDisplayName(so.order.buyer),
        deliveryMethod: so.deliveryMethod,
        lockedAt: so.handoverLockedAt!,
      })),
    };
  }

  // Decision C5: an admin assigns a rider to an open job, or reassigns one. The new rider sets
  // their arrival windows; parcels already with the old rider stay as they are.
  async assign(
    jobId: string,
    dto: AssignRiderDto,
    adminId: string,
  ): Promise<AdminDeliveryJobDto> {
    const job = await this.prisma.deliveryJob.findUnique({
      where: { id: jobId },
      select: { ...adminJobSelect, institutionId: true, riderId: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (!LIVE_JOB.includes(job.status)) {
      throw new ConflictException({
        code: 'JOB_CLOSED',
        message: 'This job is finished',
      });
    }
    const rider = await this.prisma.user.findFirst({
      where: {
        id: dto.riderId,
        role: UserRole.DISPATCH,
        isActive: true,
        institutionId: job.institutionId,
        password: { not: null },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!rider) {
      throw new BadRequestException({
        code: 'INVALID_RIDER',
        message:
          'Choose an active rider at this campus who has accepted their invite',
      });
    }
    const previous = job.riderId;
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryJob.update({
        where: { id: job.id },
        data: {
          status: DeliveryJobStatus.ASSIGNED,
          riderId: rider.id,
          assignedById: adminId,
          acceptedAt: new Date(),
        },
      });
      // The new rider will say when they're coming
      await tx.sellerOrder.updateMany({
        where: {
          orderId: job.order.id,
          deliveryMethod: DeliveryMethod.DISPATCH,
          fulfillmentStatus: { in: TO_COLLECT },
        },
        data: {
          fulfillmentStatus: FulfillmentStatus.RIDER_ASSIGNED,
          arrivalFrom: null,
          arrivalTo: null,
        },
      });
      await this.audit.record(
        {
          actorId: adminId,
          action: 'JOB_ASSIGNED',
          entityType: 'DeliveryJob',
          entityId: job.id,
          meta: {
            from: previous,
            to: rider.id,
            ...(dto.reason && { reason: dto.reason }),
          },
        },
        tx,
      );
    });

    const name = riderName(rider);
    await this.notifications.notify(rider.id, {
      type: 'JOB_ASSIGNED',
      title: 'CampusMart gave you a delivery job',
      body: 'Open it and say when you will reach each store.',
      link: `/dispatch/jobs/${job.id}`,
    });
    if (previous && previous !== rider.id) {
      await this.notifications.notify(previous, {
        type: 'JOB_REASSIGNED',
        title: 'A delivery job was given to another rider',
        body: 'CampusMart reassigned it. You don’t need to collect anything more for it.',
        link: '/dispatch',
      });
    }
    const waiting = job.order.sellerOrders.filter((so) =>
      TO_COLLECT.includes(so.fulfillmentStatus),
    );
    await this.notifications.notify(
      waiting.map((so) => so.sellerId),
      {
        type: 'RIDER_ASSIGNED',
        title: 'A rider is assigned to your order',
        body: `${name} will collect it. You’ll see when they’re coming once they set a time.`,
        link: '/sellers/orders',
      },
    );
    await this.notifications.notify(job.order.buyerId, {
      type: 'RIDER_ASSIGNED',
      title: 'A rider has your order',
      body: `${name} is delivering your order.`,
      link: `/orders/${job.order.id}`,
    });
    return toDto(
      await this.prisma.deliveryJob.findUniqueOrThrow({
        where: { id: job.id },
        select: adminJobSelect,
      }),
    );
  }

  // Decision F5: after checking with the buyer, an admin unlocks a handover, with a reason
  async unlock(sellerOrderId: string, reason: string, adminId: string) {
    const so = await this.prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      select: {
        id: true,
        code: true,
        orderId: true,
        sellerId: true,
        handoverLockedAt: true,
        order: { select: { buyerId: true } },
      },
    });
    if (!so) throw new NotFoundException('Order not found');
    if (!so.handoverLockedAt) {
      throw new ConflictException({
        code: 'NOT_LOCKED',
        message: 'This order isn’t locked',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.sellerOrder.update({
        where: { id: so.id },
        data: { handoverLockedAt: null, collectionAttempts: 0 },
      });
      await this.audit.record(
        {
          actorId: adminId,
          action: 'HANDOVER_UNLOCKED',
          entityType: 'SellerOrder',
          entityId: so.id,
          meta: { reason },
        },
        tx,
      );
    });
    await this.notifications.notify(so.order.buyerId, {
      type: 'HANDOVER_UNLOCKED',
      title: `Order ${so.code} unlocked`,
      body: 'You can give your code again when you receive it.',
      link: `/orders/${so.orderId}`,
    });
    return { sellerOrderId: so.id, unlocked: true };
  }
}
