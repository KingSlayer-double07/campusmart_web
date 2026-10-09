import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { OrderExpiryService } from './order-expiry.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [CheckoutService, OrdersService, OrderExpiryService],
})
export class OrdersModule {}
