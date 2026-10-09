import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { UploadsModule } from '../uploads/uploads.module';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

@Module({
  imports: [ListingsModule, UploadsModule],
  controllers: [SellersController],
  providers: [SellersService],
})
export class SellersModule {}
