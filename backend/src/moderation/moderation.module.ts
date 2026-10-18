import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { AdminAuditService } from './admin-audit.service';
import { AdminInsightsController } from './admin-insights.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminListingsService } from './admin-listings.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { ListingReportsController } from './listing-reports.controller';
import { ListingReportsService } from './listing-reports.service';
import { SuspensionService } from './suspension.service';

// Phase 9: users and suspension, listing moderation, reports, the audit log and the overview
@Module({
  imports: [SessionsModule],
  controllers: [
    AdminUsersController,
    AdminListingsController,
    AdminReportsController,
    AdminInsightsController,
    ListingReportsController,
  ],
  providers: [
    SuspensionService,
    AdminUsersService,
    AdminListingsService,
    ListingReportsService,
    AdminAuditService,
    AdminOverviewService,
  ],
})
export class ModerationModule {}
