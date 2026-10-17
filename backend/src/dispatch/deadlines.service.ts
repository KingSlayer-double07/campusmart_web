import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env';
import {
  DeliveryJobStatus,
  DeliveryMethod,
  EscrowStatus,
  Fault,
  FulfillmentStatus,
} from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { RefundsService } from '../payments/refunds.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TO_COLLECT,
  UNACCEPTED_ALERT_MS,
  WITH_RIDER_ALERT_MS,
} from './dispatch-rules';

const BATCH = 50;

export interface DeadlineRun {
  missedPickup: number;
  notCollected: number;
  unacceptedAlerts: number;
  withRiderAlerts: number;
}

// Phase 6 deadlines, every hour:
// - dispatch: no pickup 3 days after payment refunds that store's order (DL7b); the seller's fault
//   only if the rider reported it not ready (C11, DF11), otherwise nobody's;
// - pickup from the seller: not collected in 5 days cancels it as the buyer's fault (DL7c);
// - a job nobody accepted within 5 hours alerts the admins (DX2);
// - a parcel with the rider for 5 days without the buyer's code alerts the admins (DL6b).
@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'delivery-deadlines' })
  async run(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    try {
      const done = await this.runAll();
      if (Object.values(done).some((n) => n > 0)) {
        this.logger.log(`Delivery deadlines: ${JSON.stringify(done)}`);
      }
    } catch (error) {
      this.logger.error(
        `Delivery deadlines failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async runAll(now = new Date()): Promise<DeadlineRun> {
    return {
      missedPickup: await this.missedPickups(now),
      notCollected: await this.notCollected(now),
      unacceptedAlerts: await this.unacceptedJobs(now),
      withRiderAlerts: await this.longWithRider(now),
    };
  }

  async missedPickups(now = new Date()): Promise<number> {
    let refunded = 0;
    for (;;) {
      const due = await this.prisma.sellerOrder.findMany({
        where: {
          deliveryMethod: DeliveryMethod.DISPATCH,
          fulfillmentStatus: { in: TO_COLLECT },
          escrowStatus: EscrowStatus.HELD,
          pickupDeadline: { lte: now },
        },
        orderBy: [{ pickupDeadline: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          code: true,
          notReadyAt: true,
          fulfillmentStatus: true,
          order: {
            select: { deliveryJob: { select: { id: true, riderId: true } } },
          },
        },
        take: BATCH,
      });
      const before = refunded;
      for (const so of due) {
        const done = await this.refund(so.id, {
          reason: 'MISSED_PICKUP_DEADLINE',
          fault: so.notReadyAt ? Fault.SELLER : Fault.NONE,
        });
        if (!done) continue;
        refunded += 1;
        const job = so.order.deliveryJob;
        if (
          job?.riderId &&
          so.fulfillmentStatus === FulfillmentStatus.RIDER_ASSIGNED
        ) {
          await this.notifications.notify(job.riderId, {
            type: 'STOP_CANCELLED',
            title: `${so.code} was cancelled`,
            body: 'It wasn’t collected by its deadline, so the buyer was refunded. Skip that store.',
            link: `/dispatch/jobs/${job.id}`,
          });
        }
      }
      if (due.length < BATCH || refunded === before) return refunded;
    }
  }

  async notCollected(now = new Date()): Promise<number> {
    let refunded = 0;
    for (;;) {
      const due = await this.prisma.sellerOrder.findMany({
        where: {
          fulfillmentStatus: FulfillmentStatus.AWAITING_PICKUP,
          escrowStatus: EscrowStatus.HELD,
          pickupDeadline: { lte: now },
        },
        orderBy: [{ pickupDeadline: 'asc' }, { id: 'asc' }],
        select: { id: true },
        take: BATCH,
      });
      const before = refunded;
      for (const so of due) {
        if (
          await this.refund(so.id, {
            reason: 'NOT_COLLECTED',
            fault: Fault.BUYER,
          })
        ) {
          refunded += 1;
        }
      }
      // A full batch that refunded nothing would come back the same: stop until the next run
      if (due.length < BATCH || refunded === before) return refunded;
    }
  }

  async unacceptedJobs(now = new Date()): Promise<number> {
    const due = await this.prisma.deliveryJob.findMany({
      where: {
        status: DeliveryJobStatus.OPEN,
        unacceptedAlertAt: null,
        createdAt: { lte: new Date(now.getTime() - UNACCEPTED_ALERT_MS) },
      },
      select: { id: true, institution: { select: { name: true } } },
      take: BATCH,
    });
    let alerted = 0;
    for (const job of due) {
      const claimed = await this.prisma.deliveryJob.updateMany({
        where: { id: job.id, unacceptedAlertAt: null },
        data: { unacceptedAlertAt: now },
      });
      if (claimed.count !== 1) continue;
      alerted += 1;
      await this.notifications.alertAdmins({
        type: 'JOB_UNACCEPTED',
        title: 'No rider has taken a delivery',
        body: `A job at ${job.institution.name} has waited 5 hours. Assign a rider.`,
        link: '/admin/deliveries',
        data: { jobId: job.id },
      });
    }
    return alerted;
  }

  async longWithRider(now = new Date()): Promise<number> {
    const due = await this.prisma.sellerOrder.findMany({
      where: {
        fulfillmentStatus: FulfillmentStatus.WITH_RIDER,
        riderAlertAt: null,
        pickedUpAt: { lte: new Date(now.getTime() - WITH_RIDER_ALERT_MS) },
      },
      select: { id: true, code: true },
      take: BATCH,
    });
    let alerted = 0;
    for (const so of due) {
      const claimed = await this.prisma.sellerOrder.updateMany({
        where: { id: so.id, riderAlertAt: null },
        data: { riderAlertAt: now },
      });
      if (claimed.count !== 1) continue;
      alerted += 1;
      await this.notifications.alertAdmins({
        type: 'WITH_RIDER_TOO_LONG',
        title: `${so.code} has been with the rider for 5 days`,
        body: 'The buyer’s code hasn’t been entered. Check with the rider and the buyer.',
        link: '/admin/deliveries?view=ACTIVE',
        data: { sellerOrderId: so.id },
      });
    }
    return alerted;
  }

  // Already refunded or released by someone else in the meantime: skip it
  private async refund(
    sellerOrderId: string,
    input: { reason: string; fault: Fault },
  ) {
    try {
      await this.refunds.refundSellerOrder(sellerOrderId, {
        ...input,
        actorId: null,
      });
      return true;
    } catch (error) {
      if (error instanceof ConflictException) return false;
      throw error;
    }
  }
}
