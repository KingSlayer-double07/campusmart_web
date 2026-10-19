import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GuestOrUser } from '../auth/decorators/guest-or-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { ListingReviewsQueryDto, ReviewPageDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

// Guide 8.4: a listing's reviews, which guests may read too (decision 2026-10-19)
@ApiTags('Reviews')
@GuestOrUser()
@Controller('listings')
export class ListingReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @ApiOperation({ summary: 'A listing’s reviews, newest first' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ReviewPageDto)
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: 'INSTITUTION_INACTIVE: the guest’s school is switched off',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get(':id/reviews')
  forListing(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListingReviewsQueryDto,
  ): Promise<ReviewPageDto> {
    return this.reviews.forListing(user, id, query);
  }
}
