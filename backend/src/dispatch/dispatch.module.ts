import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminDisputesController } from './admin-disputes.controller';
import { DeadlinesService } from './deadlines.service';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';
import { AdminDeliveriesController } from './admin-deliveries.controller';
import { AdminDeliveriesService } from './admin-deliveries.service';
import { DeliveryJobsService } from './delivery-jobs.service';
import { HandoverService } from './handover.service';
import { RiderJobsController } from './rider-jobs.controller';
import { SellerOrdersController } from './seller-orders.controller';
import { SellerOrdersService } from './seller-orders.service';

// Phase 6: delivery jobs, riders' and sellers' handovers, and the admin side of both
@Module({
  imports: [PaymentsModule, UploadsModule],
  providers: [
    DeliveryJobsService,
    HandoverService,
    SellerOrdersService,
    AdminDeliveriesService,
    ProblemsService,
    DeadlinesService,
  ],
  controllers: [
    RiderJobsController,
    SellerOrdersController,
    AdminDeliveriesController,
    ProblemsController,
    AdminDisputesController,
  ],
  exports: [DeliveryJobsService, AdminDeliveriesService, DeadlinesService],
})
export class DispatchModule {}
