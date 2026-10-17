import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsJobs } from './analytics.jobs';
import { AnalyticsService } from './analytics.service';
import { LowStockService } from './low-stock.service';

// Phase 7: seller analytics and low-stock alerts. The cache is in memory, per API instance.
@Module({
  imports: [CacheModule.register()],
  providers: [AnalyticsService, LowStockService, AnalyticsJobs],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
