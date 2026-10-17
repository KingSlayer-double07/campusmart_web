import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env';
import { AnalyticsService } from './analytics.service';
import { LowStockService } from './low-stock.service';

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Phase 7 background work. Off in tests, which call the services directly.
@Injectable()
export class AnalyticsJobs {
  private readonly logger = new Logger(AnalyticsJobs.name);

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly lowStock: LowStockService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'low-stock-alerts' })
  async lowStockAlerts(): Promise<void> {
    if (this.isTest()) return;
    try {
      const told = await this.lowStock.notifyNewlyLow();
      if (told > 0) this.logger.log(`Low-stock alerts sent: ${told}`);
    } catch (error) {
      this.logger.error(`Low-stock alerts failed: ${message(error)}`);
    }
  }

  @Cron('30 3 * * *', { name: 'prune-listing-views', timeZone: 'Africa/Lagos' })
  async pruneViews(): Promise<void> {
    if (this.isTest()) return;
    try {
      await this.analytics.pruneViews(new Date());
    } catch (error) {
      this.logger.error(`Pruning listing views failed: ${message(error)}`);
    }
  }

  private isTest() {
    return this.config.get('NODE_ENV', { infer: true }) === 'test';
  }
}
