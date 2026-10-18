import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env';
import { sellerDisplayName } from '../listings/listing-rules';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { REVIEWABLE } from './review-rules';

const HOUR_MS = 60 * 60 * 1000;
const REMIND_AFTER_MS = 24 * HOUR_MS;
// Orders handed over before this window aren't chased (e.g. when this job first runs)
const REMIND_WITHIN_MS = 7 * 24 * HOUR_MS;
const BATCH = 200;

// Guide 8.4: 24 hours after handover, the buyer is asked once to rate what they received
@Injectable()
export class ReviewRemindersService {
  private readonly logger = new Logger(ReviewRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'review-reminders' })
  async run(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    try {
      const sent = await this.remind(new Date());
      if (sent > 0) this.logger.log(`Review reminders sent: ${sent}`);
    } catch (error) {
      this.logger.error(
        `Review reminders failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async remind(now: Date): Promise<number> {
    const due = await this.prisma.sellerOrder.findMany({
      where: {
        fulfillmentStatus: { in: REVIEWABLE },
        reviewReminderAt: null,
        collectedAt: {
          lte: new Date(now.getTime() - REMIND_AFTER_MS),
          gte: new Date(now.getTime() - REMIND_WITHIN_MS),
        },
        reviews: { none: {} },
      },
      orderBy: { collectedAt: 'asc' },
      take: BATCH,
      select: {
        id: true,
        orderId: true,
        order: { select: { buyerId: true } },
        seller: {
          select: {
            username: true,
            firstName: true,
            sellerProfile: { select: { storeName: true } },
          },
        },
      },
    });
    let sent = 0;
    for (const so of due) {
      // Claimed first, so two API instances never ask twice
      const { count } = await this.prisma.sellerOrder.updateMany({
        where: { id: so.id, reviewReminderAt: null },
        data: { reviewReminderAt: now },
      });
      if (count === 0) continue;
      await this.notifications.notify(
        so.order.buyerId,
        {
          type: 'REVIEW_REMINDER',
          title: `How was your order from ${sellerDisplayName(so.seller)}?`,
          body: 'Rate what you received. It helps other students choose.',
          link: `/orders/${so.orderId}#rate`,
        },
        { email: false },
      );
      sent += 1;
    }
    return sent;
  }
}
