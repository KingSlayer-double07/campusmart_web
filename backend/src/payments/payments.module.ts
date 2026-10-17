import { Module } from '@nestjs/common';
import { AdminPayoutsController } from './admin-payouts.controller';
import { PayoutAccountsService } from './payout-accounts.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import {
  PaymentsController,
  PaymentsPublicController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

// Phase 5: Paystack payments, escrow release, payouts and refunds
@Module({
  controllers: [
    PaymentsPublicController,
    PaymentsController,
    PayoutsController,
    AdminPayoutsController,
  ],
  providers: [
    PaymentsService,
    PayoutsService,
    PayoutAccountsService,
    RefundsService,
  ],
  exports: [PaymentsService, PayoutsService, RefundsService],
})
export class PaymentsModule {}
