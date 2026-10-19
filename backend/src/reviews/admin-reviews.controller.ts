import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin/admin.guards';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import {
  AdminReviewDto,
  AdminReviewPageDto,
  AdminReviewsQueryDto,
  HideReviewDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

const uuid = new ParseUUIDPipe();

// Decision R4: admins hide an abusive review, with a reason; the ratings are recounted
@ApiTags('Admin')
@AdminOnly()
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @ApiOperation({ summary: 'Reviews, newest first: shown or hidden' })
  @ApiOkEnvelope(AdminReviewPageDto)
  @Get()
  list(@Query() query: AdminReviewsQueryDto): Promise<AdminReviewPageDto> {
    return this.reviews.adminList(query);
  }

  @ApiOperation({
    summary: 'Hide a review',
    description:
      'It stops showing and counting towards the ratings. Audited with the reason.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminReviewDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'ALREADY_HIDDEN',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/hide')
  hide(
    @Param('id', uuid) id: string,
    @Body() dto: HideReviewDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminReviewDto> {
    return this.reviews.hide(id, dto.reason, admin.id);
  }

  @ApiOperation({ summary: 'Show a hidden review again' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminReviewDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'NOT_HIDDEN',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/show')
  show(
    @Param('id', uuid) id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminReviewDto> {
    return this.reviews.show(id, admin.id);
  }
}
