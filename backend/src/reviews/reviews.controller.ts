import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { BuyerAccess } from '../auth/decorators/buyer-access.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { CursorQueryDto } from '../common/pagination';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { CreateReviewDto, ReviewDto, ReviewPageDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

const uuid = new ParseUUIDPipe();

// Guide 8.4: rating what you received, and reading a listing's reviews
@ApiTags('Reviews')
@RequireVerifiedEmail()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @ApiOperation({
    summary: 'Rate an item you received',
    description:
      'The buyer only, once the store order is DELIVERED or COLLECTED; one review per item per store order. No edits (R4).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'The store order' })
  @ApiOkEnvelope(ReviewDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'NOT_IN_ORDER',
  })
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: 'REVIEW_NOT_OPEN: not received yet',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'ALREADY_REVIEWED',
  })
  @BuyerAccess()
  @Post('seller-orders/:id/reviews')
  create(
    @CurrentUser() buyer: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.create(buyer, id, dto);
  }

  @ApiOperation({ summary: 'A listing’s reviews, newest first' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ReviewPageDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get('listings/:id/reviews')
  forListing(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Query() query: CursorQueryDto,
  ): Promise<ReviewPageDto> {
    return this.reviews.forListing(user, id, query);
  }
}
