import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { CursorQueryDto } from '../common/pagination';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { ListingPageDto } from '../listings/dto/listing.dto';
import { ReviewPageDto } from '../reviews/dto/review.dto';
import { StoreDto, StorePageDto, StoresQueryDto } from './dto/store.dto';
import { StoresService } from './stores.service';

const uuid = new ParseUUIDPipe();

// Guide 8.2: stores at your school, like listings
@ApiTags('Stores')
@RequireVerifiedEmail()
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @ApiOperation({
    summary: 'Stores at your school',
    description:
      'Sellers with at least one live listing, by rating × ln(1 + reviews), then paid orders in the last 30 days (R3). `featured=true` gives the home page row (up to 10).',
  })
  @ApiOkEnvelope(StorePageDto)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: StoresQueryDto,
  ): Promise<StorePageDto> {
    return this.stores.list(user, query);
  }

  @ApiOperation({ summary: 'A store’s header' })
  @ApiParam({ name: 'sellerId', format: 'uuid' })
  @ApiOkEnvelope(StoreDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get(':sellerId')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('sellerId', uuid) sellerId: string,
  ): Promise<StoreDto> {
    return this.stores.detail(user, sellerId);
  }

  @ApiOperation({ summary: 'A store’s live listings, newest first' })
  @ApiParam({ name: 'sellerId', format: 'uuid' })
  @ApiOkEnvelope(ListingPageDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get(':sellerId/listings')
  listings(
    @CurrentUser() user: AuthUser,
    @Param('sellerId', uuid) sellerId: string,
    @Query() query: CursorQueryDto,
  ): Promise<ListingPageDto> {
    return this.stores.listings(user, sellerId, query);
  }

  @ApiOperation({ summary: 'A store’s reviews, newest first' })
  @ApiParam({ name: 'sellerId', format: 'uuid' })
  @ApiOkEnvelope(ReviewPageDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get(':sellerId/reviews')
  reviews(
    @CurrentUser() user: AuthUser,
    @Param('sellerId', uuid) sellerId: string,
    @Query() query: CursorQueryDto,
  ): Promise<ReviewPageDto> {
    return this.stores.reviewsOf(user, sellerId, query);
  }
}
