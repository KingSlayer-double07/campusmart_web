import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import { FulfillmentStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_CODE_TRIES } from './dispatch-rules';
import { settleJob } from './job-state';

const locked = () =>
  new HttpException(
    {
      code: 'HANDOVER_LOCKED',
      message:
        "Too many wrong codes. This order is locked until CampusMart unlocks it; we've been told.",
    },
    HttpStatus.LOCKED,
  );

export interface HandoverInput {
  actorId: string;
  // Rider at the buyer (DL5): WITH_RIDER -> DELIVERED. Seller, buyer collecting: AWAITING_PICKUP -> COLLECTED.
  from: FulfillmentStatus;
  to: FulfillmentStatus;
  by: 'RIDER' | 'SELLER';
}

// The buyer's 3-digit code completes a handover (DL5, DF10a). 5 wrong tries lock the order and
// alert the admins (F5). A correct code starts the 48-hour window before the payout (D11).
@Injectable()
export class HandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handOver(sellerOrderId: string, code: string, input: HandoverInput) {
    const so = await this.prisma.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      select: {
        id: true,
        code: true,
        orderId: true,
        sellerId: true,
        collectionCode: true,
        fulfillmentStatus: true,
        handoverLockedAt: true,
        order: { select: { buyerId: true } },
      },
    });
    if (so.handoverLockedAt) throw locked();
    if (so.fulfillmentStatus !== input.from) {
      throw new ConflictException({
        code: 'NOT_READY_FOR_HANDOVER',
        message: "This order isn't waiting to be handed over",
      });
    }
    if (code.trim() !== so.collectionCode) {
      return this.wrongCode(so, input.actorId);
    }

    const now = new Date();
    const hours = this.config.get('ESCROW_DISPUTE_WINDOW_HOURS', {
      infer: true,
    });
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.sellerOrder.updateMany({
        where: {
          id: so.id,
          fulfillmentStatus: input.from,
          handoverLockedAt: null,
        },
        data: {
          fulfillmentStatus: input.to,
          collectedAt: now,
          releaseAt: new Date(now.getTime() + hours * 3_600_000),
          collectionAttempts: 0,
        },
      });
      if (done.count !== 1) {
        throw new ConflictException({
          code: 'NOT_READY_FOR_HANDOVER',
          message: "This order isn't waiting to be handed over",
        });
      }
      await settleJob(tx, so.orderId);
      await this.audit.record(
        {
          actorId: input.actorId,
          action: 'ORDER_HANDED_OVER',
          entityType: 'SellerOrder',
          entityId: so.id,
          meta: { by: input.by },
        },
        tx,
      );
    });
    await this.notifications.notify(so.order.buyerId, {
      type: 'ORDER_HANDED_OVER',
      title: `Order ${so.code} handed over`,
      body: `Enjoy! If something's wrong with it, report a problem within ${hours} hours.`,
      link: `/orders/${so.orderId}`,
    });
    await this.notifications.notify(so.sellerId, {
      type: 'ORDER_HANDED_OVER',
      title: `Order ${so.code} reached the buyer`,
      body: `Your payout follows in ${hours} hours unless the buyer reports a problem.`,
      link: `/sellers/orders/${so.id}`,
    });
    return { id: so.id, fulfillmentStatus: input.to, collectedAt: now };
  }

  private async wrongCode(
    so: { id: string; code: string },
    actorId: string,
  ): Promise<never> {
    await this.prisma.sellerOrder.updateMany({
      where: { id: so.id, handoverLockedAt: null },
      data: { collectionAttempts: { increment: 1 } },
    });
    const { collectionAttempts } =
      await this.prisma.sellerOrder.findUniqueOrThrow({
        where: { id: so.id },
        select: { collectionAttempts: true },
      });
    if (collectionAttempts < MAX_CODE_TRIES) {
      const left = MAX_CODE_TRIES - collectionAttempts;
      throw new BadRequestException({
        code: 'WRONG_CODE',
        message: `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
        details: { triesLeft: left },
      });
    }
    const lockedNow = await this.prisma.sellerOrder.updateMany({
      where: { id: so.id, handoverLockedAt: null },
      data: { handoverLockedAt: new Date() },
    });
    if (lockedNow.count === 1) {
      await this.audit.record({
        actorId,
        action: 'HANDOVER_LOCKED',
        entityType: 'SellerOrder',
        entityId: so.id,
        meta: { attempts: collectionAttempts },
      });
      await this.notifications.alertAdmins({
        type: 'HANDOVER_LOCKED',
        title: `Order ${so.code} is locked`,
        body: `${MAX_CODE_TRIES} wrong handover codes were entered. Check with the buyer, then unlock it with a reason.`,
        link: '/admin/deliveries?view=LOCKED',
        data: { sellerOrderId: so.id },
      });
    }
    throw locked();
  }
}
