import { Module } from '@nestjs/common';
import { AdminReviewsController } from './admin-reviews.controller';
import { ReviewRemindersService } from './review-reminders.service';
import { ListingReviewsController } from './listing-reviews.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

// Phase 8: reviews (guide 8.4, R4)
@Module({
  providers: [ReviewsService, ReviewRemindersService],
  controllers: [
    ListingReviewsController,
    ReviewsController,
    AdminReviewsController,
  ],
  exports: [ReviewsService],
})
export class ReviewsModule {}
