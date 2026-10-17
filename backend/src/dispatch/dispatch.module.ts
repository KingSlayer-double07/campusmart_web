import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { AdminDeliveriesController } from './admin-deliveries.controller';
import { AdminDeliveriesService } from './admin-deliveries.service';
import { DeliveryJobsService } from './delivery-jobs.service';
import { HandoverService } from './handover.service';
import { RiderJobsController } from './rider-jobs.controller';
import { SellerOrdersController } from './seller-orders.controller';
import { SellerOrdersService } from './seller-orders.service';

// Phase 6: delivery jobs, riders' and sellers' handovers, and the admin side of both
@Module({
  imports: [PaymentsModule],
  providers: [
    DeliveryJobsService,
    HandoverService,
    SellerOrdersService,
    AdminDeliveriesService,
  ],
  controllers: [
    RiderJobsController,
    SellerOrdersController,
    AdminDeliveriesController,
  ],
  exports: [DeliveryJobsService, AdminDeliveriesService],
})
export class DispatchModule {}
