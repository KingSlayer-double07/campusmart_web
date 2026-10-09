import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [UploadsModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
