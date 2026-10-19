import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ListingsBrowseController } from './listings-browse.controller';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [UploadsModule],
  controllers: [ListingsBrowseController, ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
