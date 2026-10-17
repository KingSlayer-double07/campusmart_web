import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
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
  normaliseOrderCode,
  riderName,
  windowProblem,
} from './dispatch-rules';
import {
  AcceptJobDto,
  ArrivalTimesDto,
  DeliveryJobDto,
  DeliveryJobPageDto,
  HandoverCodeDto,
  ListJobsQueryDto,
  NotReadyDto,
} from './dto/delivery-job.dto';
import { HandoverService } from './handover.service';

const time = new Intl.DateTimeFormat('en-NG', {
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});
const day = new Intl.DateTimeFormat('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Lagos',
});
const windowText = (from: Date, to: Date) =>
  `${day.format(from)}, ${time.format(from)} to ${time.format(to)}`;

const stopSelect = {
  id: true,
  code: true,
  sellerId: true,
  fulfillmentStatus: true,
  arrivalFrom: true,
  arrivalTo: true,
  pickupDeadline: true,
  pickedUpAt: true,
  notReadyAt: true,
  notReadyNote: true,
  collectedAt: true,
  handoverLockedAt: true,
  seller: {
    select: {
      username: true,
      firstName: true,
      sellerProfile: {
        select: {
          storeName: true,
          pickupArea: true,
          pickupAddress: true,
          contactPhone: true,
        },
      },
    },
  },
  items: {
    select: { titleSnapshot: true, variantLabel: true, quantity: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.SellerOrderSelect;

export const jobSelect = {
  id: true,
  status: true,
  riderId: true,
  institutionId: true,
  createdAt: true,
  acceptedAt: true,
  order: {
    select: {
      id: true,
      buyerId: true,
      deliveryFeeKobo: true,
      deliveryAddress: true,
      buyerPhone: true,
      campusPlace: { select: { name: true } },
      buyer: { select: { username: true, firstName: true } },
      sellerOrders: {
        where: { deliveryMethod: DeliveryMethod.DISPATCH },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: stopSelect,
      },
    },
  },
} satisfies Prisma.DeliveryJobSelect;

type JobRow = Prisma.DeliveryJobGetPayload<{ select: typeof jobSelect }>;
type StopRow = JobRow['order']['sellerOrders'][number];

// Decision C6: before accepting, a rider sees the two areas only; the store names, addresses and
// phones, and the buyer, once the job is theirs
export function toJobDto(row: JobRow, riderId: string | null): DeliveryJobDto {
  const full = riderId !== null && row.riderId === riderId;
  const order = row.order;
  return {
    id: row.id,
    status: row.status,
    mine: full,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    deliveryFeeKobo: order.deliveryFeeKobo,
    destination: {
      offCampus: !order.campusPlace,
      campusPlace: order.campusPlace?.name ?? null,
      address: full ? order.deliveryAddress : null,
    },
    buyer: full
      ? { name: buyerDisplayName(order.buyer), phone: order.buyerPhone }
      : null,
    stops: order.sellerOrders.map((so) => {
      const profile = so.seller.sellerProfile;
      return {
        sellerOrderId: so.id,
        storeName: full ? sellerDisplayName(so.seller) : null,
        area: profile?.pickupArea ?? null,
        address: full ? (profile?.pickupAddress ?? null) : null,
        phone: full ? (profile?.contactPhone ?? null) : null,
        itemCount: so.items.reduce((n, i) => n + i.quantity, 0),
        items: full
          ? so.items.map((i) => ({
              title: i.titleSnapshot,
              variantLabel: i.variantLabel,
              quantity: i.quantity,
            }))
          : [],
        status: so.fulfillmentStatus,
        arrivalFrom: so.arrivalFrom,
        arrivalTo: so.arrivalTo,
        pickupDeadline: so.pickupDeadline,
        pickedUpAt: so.pickedUpAt,
        notReadyAt: so.notReadyAt,
        notReadyNote: so.notReadyNote,
        deliveredAt:
          so.fulfillmentStatus === FulfillmentStatus.DELIVERED
            ? so.collectedAt
            : null,
        handoverLocked: so.handoverLockedAt !== null,
      };
    }),
  };
}

const jobNotFound = () => new NotFoundException('Job not found');

// Phase 6 for riders (DISPATCH): see the jobs at their campus, take one, collect from each store
// with its CM- code, and hand over with the buyer's code (DX2, DX5, DF7, DF8b, DF11, DL5)
@Injectable()
export class DeliveryJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly handover: HandoverService,
  ) {}

  async list(
    rider: AuthUser,
    query: ListJobsQueryDto,
  ): Promise<DeliveryJobPageDto> {
    const campus = this.campusOf(rider);
    const where: Prisma.DeliveryJobWhereInput =
      query.scope === 'OPEN'
        ? { institutionId: campus, status: DeliveryJobStatus.OPEN }
        : query.scope === 'MINE'
          ? { riderId: rider.id, status: DeliveryJobStatus.ASSIGNED }
          : {
              riderId: rider.id,
              status: {
                in: [DeliveryJobStatus.DONE, DeliveryJobStatus.CANCELLED],
              },
            };
    const rows = await this.prisma.deliveryJob.findMany({
      where,
      // Oldest open job first; your own newest first
      orderBy:
        query.scope === 'OPEN'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: jobSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map((r) => toJobDto(r, rider.id)) };
  }

  async detail(rider: AuthUser, id: string): Promise<DeliveryJobDto> {
    return toJobDto(await this.visibleJob(rider, id), rider.id);
  }

  // Decision DX2: the first rider to accept takes the job; anyone after gets 409
  async accept(
    rider: AuthUser,
    id: string,
    dto: AcceptJobDto,
  ): Promise<DeliveryJobDto> {
    const job = await this.visibleJob(rider, id);
    if (job.status !== DeliveryJobStatus.OPEN) throw jobTaken();
    const toCollect = job.order.sellerOrders.filter(
      (so) => so.fulfillmentStatus === FulfillmentStatus.AWAITING_RIDER,
    );
    const windows = new Map(dto.windows.map((w) => [w.sellerOrderId, w]));
    if (
      windows.size !== dto.windows.length ||
      windows.size !== toCollect.length ||
      toCollect.some((so) => !windows.has(so.id))
    ) {
      throw new BadRequestException({
        code: 'WINDOW_REQUIRED',
        message: 'Say when you will reach each store on this job',
      });
    }
    for (const so of toCollect) {
      this.checkWindow(windows.get(so.id)!, so.pickupDeadline);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.deliveryJob.updateMany({
        where: { id: job.id, status: DeliveryJobStatus.OPEN },
        data: {
          status: DeliveryJobStatus.ASSIGNED,
          riderId: rider.id,
          acceptedAt: now,
          assignedById: null,
        },
      });
      if (claimed.count !== 1) throw jobTaken();
      for (const so of toCollect) {
        const w = windows.get(so.id)!;
        await tx.sellerOrder.updateMany({
          where: {
            id: so.id,
            fulfillmentStatus: FulfillmentStatus.AWAITING_RIDER,
          },
          data: {
            fulfillmentStatus: FulfillmentStatus.RIDER_ASSIGNED,
            arrivalFrom: w.from,
            arrivalTo: w.to,
          },
        });
      }
      await this.audit.record(
        {
          actorId: rider.id,
          action: 'JOB_ACCEPTED',
          entityType: 'DeliveryJob',
          entityId: job.id,
        },
        tx,
      );
    });
    await this.announceRider(job, rider, toCollect, windows);
    return this.detail(rider, id);
  }

  // Decision DF8b: the rider can move their arrival window; the seller hears about it
  async updateWindow(
    rider: AuthUser,
    id: string,
    sellerOrderId: string,
    dto: ArrivalTimesDto,
  ): Promise<DeliveryJobDto> {
    const job = await this.myJob(rider, id);
    const stop = this.stopOf(job, sellerOrderId);
    if (stop.fulfillmentStatus !== FulfillmentStatus.RIDER_ASSIGNED) {
      throw stopNotWaiting();
    }
    this.checkWindow(dto, stop.pickupDeadline);
    await this.prisma.sellerOrder.update({
      where: { id: stop.id },
      data: { arrivalFrom: dto.from, arrivalTo: dto.to },
    });
    await this.notifications.notify(stop.sellerId, {
      type: 'RIDER_WINDOW_CHANGED',
      title: `New pickup time for ${stop.code}`,
      body: `${riderName(rider)} will now come ${windowText(dto.from, dto.to)}.`,
      link: `/sellers/orders/${stop.id}`,
    });
    return this.detail(rider, id);
  }

  // Decision DX5: at each store the rider enters (or scans) its CM- code; the parcel is with them
  async pickup(
    rider: AuthUser,
    id: string,
    rawCode: string,
  ): Promise<DeliveryJobDto> {
    const job = await this.myJob(rider, id);
    const code = normaliseOrderCode(rawCode);
    const stop = job.order.sellerOrders.find((so) => so.code === code);
    if (!stop) {
      throw new BadRequestException({
        code: 'WRONG_CODE',
        message: "That code isn't for a store on this job",
      });
    }
    if (stop.fulfillmentStatus !== FulfillmentStatus.RIDER_ASSIGNED) {
      throw new ConflictException({
        code:
          stop.fulfillmentStatus === FulfillmentStatus.CANCELLED
            ? 'STOP_NOT_WAITING'
            : 'ALREADY_PICKED_UP',
        message:
          stop.fulfillmentStatus === FulfillmentStatus.CANCELLED
            ? 'This store’s order was cancelled'
            : 'You already have this parcel',
      });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.sellerOrder.updateMany({
        where: {
          id: stop.id,
          fulfillmentStatus: FulfillmentStatus.RIDER_ASSIGNED,
        },
        data: {
          fulfillmentStatus: FulfillmentStatus.WITH_RIDER,
          pickedUpAt: now,
        },
      });
      if (moved.count !== 1) throw stopNotWaiting();
      await this.audit.record(
        {
          actorId: rider.id,
          action: 'PARCEL_PICKED_UP',
          entityType: 'SellerOrder',
          entityId: stop.id,
          meta: { jobId: job.id },
        },
        tx,
      );
    });
    const { collectionCode } = await this.prisma.sellerOrder.findUniqueOrThrow({
      where: { id: stop.id },
      select: { collectionCode: true },
    });
    const store = sellerDisplayName(stop.seller);
    // Decision C7: the buyer's code shows once the rider has the parcel
    await this.notifications.notify(job.order.buyerId, {
      type: 'PARCEL_WITH_RIDER',
      title: `Your order from ${store} is on its way`,
      body: `${riderName(rider)} has it. Give them your code ${collectionCode} when it reaches you, and not before.`,
      link: `/orders/${job.order.id}`,
    });
    await this.notifications.notify(stop.sellerId, {
      type: 'PARCEL_WITH_RIDER',
      title: `${stop.code} picked up`,
      body: `${riderName(rider)} has collected it.`,
      link: `/sellers/orders/${stop.id}`,
    });
    return this.detail(rider, id);
  }

  // Decision DF11: the store wasn't ready or the seller wasn't there. The rider delivers the
  // rest, and comes back for this one before its deadline; after that it's the seller's fault (C11).
  async notReady(
    rider: AuthUser,
    id: string,
    sellerOrderId: string,
    dto: NotReadyDto,
  ): Promise<DeliveryJobDto> {
    const job = await this.myJob(rider, id);
    const stop = this.stopOf(job, sellerOrderId);
    if (stop.fulfillmentStatus !== FulfillmentStatus.RIDER_ASSIGNED) {
      throw stopNotWaiting();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.sellerOrder.update({
        where: { id: stop.id },
        data: { notReadyAt: new Date(), notReadyNote: dto.note ?? null },
      });
      await this.audit.record(
        {
          actorId: rider.id,
          action: 'STORE_NOT_READY',
          entityType: 'SellerOrder',
          entityId: stop.id,
          meta: { jobId: job.id, ...(dto.note && { note: dto.note }) },
        },
        tx,
      );
    });
    const deadline = stop.pickupDeadline
      ? day.format(stop.pickupDeadline)
      : 'the deadline';
    await this.notifications.notify(stop.sellerId, {
      type: 'STORE_NOT_READY',
      title: `The rider couldn't collect ${stop.code}`,
      body: `${riderName(rider)} found it not ready${dto.note ? ` (${dto.note})` : ''}. They'll come back before ${deadline}. If it isn't ready by then, the order is cancelled and refunded, and it counts against your store.`,
      link: `/sellers/orders/${stop.id}`,
    });
    await this.notifications.notify(job.order.buyerId, {
      type: 'STORE_NOT_READY',
      title: `${sellerDisplayName(stop.seller)} wasn't ready`,
      body: 'The rider will bring the rest of your order now and come back for this part.',
      link: `/orders/${job.order.id}`,
    });
    return this.detail(rider, id);
  }

  // Decision DL5: the rider enters the buyer's code for each store
  async handOver(
    rider: AuthUser,
    id: string,
    dto: HandoverCodeDto,
  ): Promise<DeliveryJobDto> {
    const job = await this.myJob(rider, id);
    const stop = this.stopOf(job, dto.sellerOrderId);
    await this.handover.handOver(stop.id, dto.code, {
      actorId: rider.id,
      from: FulfillmentStatus.WITH_RIDER,
      to: FulfillmentStatus.DELIVERED,
      by: 'RIDER',
    });
    return this.detail(rider, id);
  }

  // Decision C5: a rider can give a job back while they carry nothing from it; the admins are
  // told so they can reassign it, and it opens to the campus's riders again
  async drop(rider: AuthUser, id: string): Promise<DeliveryJobDto> {
    const job = await this.myJob(rider, id);
    if (
      job.order.sellerOrders.some(
        (so) => so.fulfillmentStatus === FulfillmentStatus.WITH_RIDER,
      )
    ) {
      throw new ConflictException({
        code: 'PARCELS_WITH_RIDER',
        message:
          'You have parcels from this job. Deliver them, or ask CampusMart to reassign it.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const released = await tx.deliveryJob.updateMany({
        where: {
          id: job.id,
          riderId: rider.id,
          status: DeliveryJobStatus.ASSIGNED,
        },
        data: {
          status: DeliveryJobStatus.OPEN,
          riderId: null,
          acceptedAt: null,
        },
      });
      if (released.count !== 1) throw jobNotFound();
      await tx.sellerOrder.updateMany({
        where: {
          orderId: job.order.id,
          fulfillmentStatus: FulfillmentStatus.RIDER_ASSIGNED,
        },
        data: {
          fulfillmentStatus: FulfillmentStatus.AWAITING_RIDER,
          arrivalFrom: null,
          arrivalTo: null,
        },
      });
      await this.audit.record(
        {
          actorId: rider.id,
          action: 'JOB_DROPPED',
          entityType: 'DeliveryJob',
          entityId: job.id,
        },
        tx,
      );
    });
    await this.notifications.alertAdmins({
      type: 'JOB_DROPPED',
      title: 'A rider gave back a delivery job',
      body: `${riderName(rider)} dropped a job. It is open to riders again; you can assign one.`,
      link: '/admin/deliveries',
      data: { jobId: job.id },
    });
    await this.notifications.notify(
      job.order.sellerOrders
        .filter(
          (so) => so.fulfillmentStatus === FulfillmentStatus.RIDER_ASSIGNED,
        )
        .map((so) => so.sellerId),
      {
        type: 'RIDER_CHANGED',
        title: 'Your rider changed',
        body: "The rider who was coming can't make it. You'll hear when another one accepts.",
        link: '/sellers/orders',
      },
    );
    return toJobDto(
      await this.prisma.deliveryJob.findUniqueOrThrow({
        where: { id: job.id },
        select: jobSelect,
      }),
      rider.id,
    );
  }

  // A job at the rider's campus that is open, or theirs. Anything else is 404, so riders can't
  // probe other campuses or other riders' jobs.
  private async visibleJob(rider: AuthUser, id: string) {
    const job = await this.prisma.deliveryJob.findFirst({
      where: { id, institutionId: this.campusOf(rider) },
      select: jobSelect,
    });
    if (
      !job ||
      (job.status !== DeliveryJobStatus.OPEN && job.riderId !== rider.id)
    ) {
      throw jobNotFound();
    }
    return job;
  }

  private async myJob(rider: AuthUser, id: string) {
    const job = await this.visibleJob(rider, id);
    if (job.riderId !== rider.id || job.status !== DeliveryJobStatus.ASSIGNED) {
      throw new ConflictException({
        code: 'JOB_NOT_YOURS',
        message: 'Accept this job first',
      });
    }
    return job;
  }

  private stopOf(job: JobRow, sellerOrderId: string): StopRow {
    const stop = job.order.sellerOrders.find((so) => so.id === sellerOrderId);
    if (!stop) throw new NotFoundException('That store isn’t on this job');
    return stop;
  }

  private campusOf(rider: AuthUser): string {
    if (rider.role !== UserRole.DISPATCH || !rider.institutionId) {
      throw new ForbiddenException('Riders only');
    }
    return rider.institutionId;
  }

  private checkWindow(w: ArrivalTimesDto, deadline: Date | null) {
    const problem = windowProblem(w.from, w.to, deadline);
    if (problem) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: problem,
      });
    }
  }

  // Each seller learns who is coming and when (DF8b, DX8); the buyer learns the rider's name
  private async announceRider(
    job: JobRow,
    rider: AuthUser,
    stops: StopRow[],
    windows: Map<string, ArrivalTimesDto>,
  ) {
    const name = riderName(rider);
    for (const so of stops) {
      const w = windows.get(so.id)!;
      await this.notifications.notify(so.sellerId, {
        type: 'RIDER_ASSIGNED',
        title: `A rider is coming for ${so.code}`,
        body: `${name} will collect it ${windowText(w.from, w.to)}. Have it packed, and give them the code ${so.code} when they arrive.`,
        link: `/sellers/orders/${so.id}`,
      });
    }
    await this.notifications.notify(job.order.buyerId, {
      type: 'RIDER_ASSIGNED',
      title: 'A rider has your order',
      body: `${name} is collecting your order from the store${stops.length > 1 ? 's' : ''} and will bring it to you.`,
      link: `/orders/${job.order.id}`,
    });
  }
}

const jobTaken = () =>
  new ConflictException({
    code: 'JOB_TAKEN',
    message: 'Another rider took this job first',
  });

const stopNotWaiting = () =>
  new ConflictException({
    code: 'STOP_NOT_WAITING',
    message: 'This store isn’t waiting for you any more',
  });
