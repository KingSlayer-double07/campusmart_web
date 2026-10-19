import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import {
  DeliveryJobStatus,
  DeliveryMethod,
  Fault,
  FulfillmentStatus,
} from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { RefundsService } from '../payments/refunds.service';
import { PrismaService } from '../prisma/prisma.service';
import { BEFORE_PICKUP, buyerDisplayName, riderName } from './dispatch-rules';
import {
  CancelSellerOrderDto,
  ListSellerOrdersQueryDto,
  SellerOrderCountsDto,
  SellerOrderTab,
  SellerSideOrderDto,
  SellerSideOrderPageDto,
} from './dto/seller-order.dto';
import { HandoverService } from './handover.service';

// Each tab is a set of states; station-era states sit where they belong
const TABS: Record<SellerOrderTab, FulfillmentStatus[]> = {
  TO_PREPARE: [...BEFORE_PICKUP, FulfillmentStatus.AWAITING_DROPOFF],
  ON_THE_WAY: [FulfillmentStatus.WITH_RIDER, FulfillmentStatus.DROPPED_OFF],
  DONE: [FulfillmentStatus.DELIVERED, FulfillmentStatus.COLLECTED],
  PROBLEMS: [FulfillmentStatus.DISPUTED],
  CANCELLED: [FulfillmentStatus.CANCELLED],
};

const sellerOrderSelect = {
  id: true,
  code: true,
  createdAt: true,
  deliveryMethod: true,
  subtotalKobo: true,
  sellerPayoutKobo: true,
  fulfillmentStatus: true,
  escrowStatus: true,
  pickupDeadline: true,
  arrivalFrom: true,
  arrivalTo: true,
  pickedUpAt: true,
  notReadyAt: true,
  notReadyNote: true,
  collectedAt: true,
  releaseAt: true,
  cancelledAt: true,
  cancelReason: true,
  handoverLockedAt: true,
  order: {
    select: {
      paidAt: true,
      buyer: { select: { username: true, firstName: true } },
      deliveryJob: {
        select: {
          status: true,
          rider: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
  items: {
    select: {
      titleSnapshot: true,
      variantLabel: true,
      imageUrl: true,
      quantity: true,
      unitPriceKobo: true,
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.SellerOrderSelect;

type Row = Prisma.SellerOrderGetPayload<{ select: typeof sellerOrderSelect }>;

function toDto(row: Row): SellerSideOrderDto {
  const job = row.order.deliveryJob;
  const riderVisible =
    row.deliveryMethod === DeliveryMethod.DISPATCH &&
    job?.status === DeliveryJobStatus.ASSIGNED &&
    job.rider !== null;
  return {
    id: row.id,
    code: row.code,
    placedAt: row.order.paidAt ?? row.createdAt,
    buyerName: buyerDisplayName(row.order.buyer),
    deliveryMethod: row.deliveryMethod,
    items: row.items.map((i) => ({
      title: i.titleSnapshot,
      variantLabel: i.variantLabel,
      imageUrl: i.imageUrl,
      quantity: i.quantity,
      unitPriceKobo: i.unitPriceKobo,
    })),
    subtotalKobo: row.subtotalKobo,
    sellerPayoutKobo: row.sellerPayoutKobo,
    fulfillmentStatus: row.fulfillmentStatus,
    escrowStatus: row.escrowStatus,
    pickupDeadline: row.pickupDeadline,
    rider: riderVisible ? { name: riderName(job.rider!) } : null,
    arrivalFrom: row.arrivalFrom,
    arrivalTo: row.arrivalTo,
    pickedUpAt: row.pickedUpAt,
    notReadyAt: row.notReadyAt,
    notReadyNote: row.notReadyNote,
    handedOverAt: row.collectedAt,
    releaseAt: row.releaseAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    canCancel: BEFORE_PICKUP.includes(row.fulfillmentStatus),
    handoverLocked: row.handoverLockedAt !== null,
  };
}

const notFound = () => new NotFoundException('Order not found');

// Guide 6.2 rebuilt for delivery (Phase 6): a seller's own orders, never anyone else's (404)
@Injectable()
export class SellerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundsService,
    private readonly handover: HandoverService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    seller: AuthUser,
    query: ListSellerOrdersQueryDto,
  ): Promise<SellerSideOrderPageDto> {
    const rows = await this.prisma.sellerOrder.findMany({
      where: {
        sellerId: seller.id,
        fulfillmentStatus: { in: TABS[query.tab] },
      },
      // What needs doing soonest first; finished ones newest first
      orderBy:
        query.tab === 'TO_PREPARE'
          ? [{ pickupDeadline: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: sellerOrderSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  async counts(seller: AuthUser): Promise<SellerOrderCountsDto> {
    const groups = await this.prisma.sellerOrder.groupBy({
      by: ['fulfillmentStatus'],
      where: { sellerId: seller.id },
      _count: { _all: true },
    });
    const count = (statuses: FulfillmentStatus[]) =>
      groups
        .filter((g) => statuses.includes(g.fulfillmentStatus))
        .reduce((n, g) => n + g._count._all, 0);
    return {
      TO_PREPARE: count(TABS.TO_PREPARE),
      ON_THE_WAY: count(TABS.ON_THE_WAY),
      DONE: count(TABS.DONE),
      PROBLEMS: count(TABS.PROBLEMS),
      CANCELLED: count(TABS.CANCELLED),
    };
  }

  async detail(seller: AuthUser, id: string): Promise<SellerSideOrderDto> {
    const row = await this.prisma.sellerOrder.findFirst({
      where: { id, sellerId: seller.id },
      select: sellerOrderSelect,
    });
    if (!row) throw notFound();
    return toDto(row);
  }

  // Decision F10: before the parcel leaves the seller, the seller can cancel. The buyer is
  // refunded in full and it counts against the store (P6: the seller's fault).
  async cancel(
    seller: AuthUser,
    id: string,
    dto: CancelSellerOrderDto,
  ): Promise<SellerSideOrderDto> {
    const so = await this.prisma.sellerOrder.findFirst({
      where: { id, sellerId: seller.id },
      select: {
        id: true,
        code: true,
        fulfillmentStatus: true,
        order: {
          select: {
            deliveryJob: {
              select: { id: true, riderId: true, status: true },
            },
          },
        },
      },
    });
    if (!so) throw notFound();
    if (!BEFORE_PICKUP.includes(so.fulfillmentStatus)) {
      throw new ConflictException({
        code: 'NOT_CANCELLABLE',
        message: 'Only an order that hasn’t left you yet can be cancelled',
      });
    }
    await this.refunds.refundSellerOrder(so.id, {
      reason: 'SELLER_CANCELLED',
      fault: Fault.SELLER,
      actorId: seller.id,
      note: dto.reason,
    });
    // The rider on the job no longer needs to come to this store
    const job = so.order.deliveryJob;
    if (
      job?.riderId &&
      so.fulfillmentStatus === FulfillmentStatus.RIDER_ASSIGNED
    ) {
      await this.notifications.notify(job.riderId, {
        type: 'STOP_CANCELLED',
        title: `${so.code} was cancelled`,
        body: 'The seller cancelled this part of the job. Skip that store.',
        link: `/dispatch/jobs/${job.id}`,
      });
    }
    return this.detail(seller, id);
  }

  // Decision DL5: the buyer collecting from the seller gives their code; the seller enters it
  async handOver(
    seller: AuthUser,
    id: string,
    code: string,
  ): Promise<SellerSideOrderDto> {
    const so = await this.prisma.sellerOrder.findFirst({
      where: { id, sellerId: seller.id },
      select: { id: true, deliveryMethod: true },
    });
    if (!so) throw notFound();
    if (so.deliveryMethod !== DeliveryMethod.SELLER_PICKUP) {
      throw new ConflictException({
        code: 'NOT_READY_FOR_HANDOVER',
        message:
          'A rider delivers this order; the rider enters the buyer’s code',
      });
    }
    await this.handover.handOver(so.id, code, {
      actorId: seller.id,
      from: FulfillmentStatus.AWAITING_PICKUP,
      to: FulfillmentStatus.COLLECTED,
      by: 'SELLER',
    });
    return this.detail(seller, id);
  }
}
