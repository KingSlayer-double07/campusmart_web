import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CursorQueryDto, cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { OrderStatus } from '../generated/prisma/enums';
import type { OpeningHoursDto } from '../admin/dto/opening-hours.dto';
import { requireActiveInstitution } from '../institutions/institution-access';
import { sellerDisplayName } from '../listings/listing-rules';
import { PrismaService } from '../prisma/prisma.service';
import {
  OrderDto,
  OrderPageDto,
  OrderSummaryDto,
  PickupStationDto,
} from './dto/order.dto';
import { closeUnpaidOrder } from './order-lifecycle';

const stationSelect = {
  id: true,
  name: true,
  address: true,
  contactName: true,
  contactPhone: true,
  openingHours: true,
} satisfies Prisma.PickupStationSelect;

const sellerSelect = {
  id: true,
  username: true,
  firstName: true,
  sellerProfile: { select: { storeName: true } },
} satisfies Prisma.UserSelect;

const itemSelect = {
  id: true,
  listingId: true,
  variantId: true,
  titleSnapshot: true,
  variantLabel: true,
  imageUrl: true,
  unitPriceKobo: true,
  quantity: true,
} satisfies Prisma.OrderItemSelect;

const orderSelect = {
  id: true,
  status: true,
  paymentMethod: true,
  subtotalKobo: true,
  totalKobo: true,
  createdAt: true,
  expiresAt: true,
  paidAt: true,
  pickupStation: { select: stationSelect },
  sellerOrders: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      code: true,
      collectionCode: true,
      fulfillmentStatus: true,
      subtotalKobo: true,
      dropOffDeadline: true,
      droppedOffAt: true,
      collectedAt: true,
      cancelledAt: true,
      cancelReason: true,
      seller: { select: sellerSelect },
      items: { select: itemSelect, orderBy: { id: 'asc' } },
    },
  },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
type SellerOrderRow = OrderRow['sellerOrders'][number];

const toStation = (row: OrderRow['pickupStation']): PickupStationDto => ({
  ...row,
  openingHours: row.openingHours as unknown as OpeningHoursDto[],
});

function summary(so: SellerOrderRow) {
  return {
    id: so.id,
    code: so.code,
    seller: { id: so.seller.id, storeName: sellerDisplayName(so.seller) },
    fulfillmentStatus: so.fulfillmentStatus,
    subtotalKobo: so.subtotalKobo,
    itemCount: so.items.reduce((sum, i) => sum + i.quantity, 0),
    imageUrl: so.items.find((i) => i.imageUrl)?.imageUrl ?? null,
  };
}

// The buyer's own view: their collection codes included (guide 4.2), seller payouts and fees not
export function toOrderDto(row: OrderRow): OrderDto {
  return {
    id: row.id,
    status: row.status,
    paymentMethod: row.paymentMethod,
    subtotalKobo: row.subtotalKobo,
    totalKobo: row.totalKobo,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    paidAt: row.paidAt,
    pickupStation: toStation(row.pickupStation),
    sellerOrders: row.sellerOrders.map((so) => ({
      ...summary(so),
      collectionCode: so.collectionCode,
      dropOffDeadline: so.dropOffDeadline,
      droppedOffAt: so.droppedOffAt,
      collectedAt: so.collectedAt,
      cancelledAt: so.cancelledAt,
      cancelReason: so.cancelReason,
      items: so.items.map((i) => ({
        id: i.id,
        listingId: i.listingId,
        variantId: i.variantId,
        title: i.titleSnapshot,
        variantLabel: i.variantLabel,
        imageUrl: i.imageUrl,
        unitPriceKobo: i.unitPriceKobo,
        quantity: i.quantity,
      })),
    })),
  };
}

function toSummaryDto(row: OrderRow): OrderSummaryDto {
  return {
    id: row.id,
    status: row.status,
    paymentMethod: row.paymentMethod,
    totalKobo: row.totalKobo,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    pickupStation: { id: row.pickupStation.id, name: row.pickupStation.name },
    sellerOrders: row.sellerOrders.map(summary),
  };
}

const orderNotFound = () => new NotFoundException('Order not found');

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // Guide 4.2: active stations at the buyer's school, for checkout
  async pickupStations(user: AuthUser): Promise<PickupStationDto[]> {
    const buyer = await requireActiveInstitution(this.prisma, user);
    const rows = await this.prisma.pickupStation.findMany({
      where: { institutionId: buyer.institutionId, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: stationSelect,
    });
    return rows.map(toStation);
  }

  // The buyer's orders, newest first. Never anyone else's.
  async list(user: AuthUser, query: CursorQueryDto): Promise<OrderPageDto> {
    const rows = await this.prisma.order.findMany({
      where: { buyerId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: orderSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toSummaryDto) };
  }

  async detail(user: AuthUser, id: string): Promise<OrderDto> {
    const row = await this.prisma.order.findFirst({
      where: { id, buyerId: user.id },
      select: orderSelect,
    });
    if (!row) throw orderNotFound();
    return toOrderDto(row);
  }

  // Only while the order waits for payment; the reserved stock goes back (guide 4.2)
  async cancel(user: AuthUser, id: string): Promise<OrderDto> {
    const cancelled = await this.prisma.$transaction((tx) =>
      closeUnpaidOrder(
        tx,
        { id, buyerId: user.id },
        OrderStatus.CANCELLED,
        new Date(),
      ),
    );
    if (!cancelled) {
      const order = await this.prisma.order.findFirst({
        where: { id, buyerId: user.id },
        select: { status: true },
      });
      if (!order) throw orderNotFound();
      throw new ConflictException({
        code: 'ORDER_NOT_CANCELLABLE',
        message:
          order.status === OrderStatus.PENDING_PAYMENT
            ? "This order has been paid, so it can't be cancelled here"
            : 'Only an order waiting for payment can be cancelled',
      });
    }
    return this.detail(user, id);
  }
}
