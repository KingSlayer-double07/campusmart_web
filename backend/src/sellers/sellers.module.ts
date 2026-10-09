import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { UploadsModule } from '../uploads/uploads.module';
import { SellerVerificationController } from './seller-verification.controller';
import { SellerVerificationService } from './seller-verification.service';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

@Module({
  imports: [ListingsModule, UploadsModule],
  controllers: [SellersController, SellerVerificationController],
  providers: [SellersService, SellerVerificationService],
})
export class SellersModule {}
