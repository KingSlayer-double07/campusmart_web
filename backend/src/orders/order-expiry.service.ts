import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../config/env';
import { OrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { closeUnpaidOrder, unpaidOrderWhere } from './order-lifecycle';

const BATCH = 100;

// Guide 4.2 (D17): every 5 minutes, unpaid orders past expiresAt become EXPIRED, their seller
// orders CANCELLED, and their stock returns. An order whose payment completed is left alone.
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron('*/5 * * * *', { name: 'expire-unpaid-orders' })
  async run(): Promise<void> {
    // Test suites call expireDue() themselves, so a timer never races them
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    try {
      const expired = await this.expireDue();
      if (expired > 0) this.logger.log(`Expired ${expired} unpaid order(s)`);
    } catch (error) {
      this.logger.error(
        `Unpaid-order expiry failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async expireDue(now = new Date()): Promise<number> {
    let expired = 0;
    for (;;) {
      const due = await this.prisma.order.findMany({
        where: { AND: [unpaidOrderWhere(), { expiresAt: { lt: now } }] },
        orderBy: { expiresAt: 'asc' },
        select: { id: true },
        take: BATCH,
      });
      for (const { id } of due) {
        const closed = await this.prisma.$transaction((tx) =>
          closeUnpaidOrder(
            tx,
            { id, expiresAt: { lt: now } },
            OrderStatus.EXPIRED,
            now,
          ),
        );
        if (closed) expired += 1;
      }
      if (due.length < BATCH) return expired;
    }
  }
}
