import { Module } from '@nestjs/common';
import { ReviewsModule } from '../reviews/reviews.module';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

// Phase 8: store pages and the featured row (guide 8.2, R3)
@Module({
  imports: [ReviewsModule],
  providers: [StoresService],
  controllers: [StoresController],
})
export class StoresModule {}
