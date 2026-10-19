import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';
import { AnalyticsService } from './analytics.service';
import {
  InventoryAlertsDto,
  RangeQueryDto,
  SellerStatsDto,
  TimeseriesPointDto,
  TimeseriesQueryDto,
  TopListingDto,
  TopListingsQueryDto,
} from './dto/analytics.dto';
import { LowStockService } from './low-stock.service';

const CACHED = 'Kept for 60 seconds, so a new order can take a minute to show.';

// Guide 7.1: the seller dashboard's numbers, always the signed-in seller's own
// Class decorators apply bottom-up, so RolesGuard (listed first) runs after the sign-in guards
@ApiTags('Sellers')
@UseGuards(RolesGuard)
@RequireVerifiedEmail()
@Roles(UserRole.SELLER)
@ApiResponse({
  status: 403,
  type: ErrorResponseDto,
  description: 'Not a seller',
})
@Controller('sellers/me')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly lowStock: LowStockService,
  ) {}

  @ApiOperation({
    summary: 'Your views, orders, revenue and payouts for a range',
    description: `Orders are your store orders in a PAID order, placed in the range, not cancelled; revenue is their item subtotals. ${CACHED}`,
  })
  @ApiOkEnvelope(SellerStatsDto)
  @Get('stats')
  stats(
    @CurrentUser() seller: AuthUser,
    @Query() query: RangeQueryDto,
  ): Promise<SellerStatsDto> {
    return this.analytics.stats(seller.id, query.range);
  }

  @ApiOperation({
    summary: 'One value per Lagos day of the range',
    description: `Revenue in kobo, orders or views; days with none are 0. ${CACHED}`,
  })
  @ApiOkEnvelope([TimeseriesPointDto])
  @Get('analytics/timeseries')
  timeseries(
    @CurrentUser() seller: AuthUser,
    @Query() query: TimeseriesQueryDto,
  ): Promise<TimeseriesPointDto[]> {
    return this.analytics.timeseries(seller.id, query.range, query.metric);
  }

  @ApiOperation({
    summary: 'Your best sellers in the range',
    description: `By units sold, then revenue. Only listings that sold appear. ${CACHED}`,
  })
  @ApiOkEnvelope([TopListingDto])
  @Get('analytics/top-listings')
  topListings(
    @CurrentUser() seller: AuthUser,
    @Query() query: TopListingsQueryDto,
  ): Promise<TopListingDto[]> {
    return this.analytics.topListings(seller.id, query.range, query.limit);
  }

  @ApiOperation({
    summary: 'Items running low',
    description:
      'Live and sold-out listings, or their options, with the low-stock level or fewer left. Always fresh, so a restock shows at once.',
  })
  @ApiOkEnvelope(InventoryAlertsDto)
  @Get('inventory/alerts')
  inventoryAlerts(
    @CurrentUser() seller: AuthUser,
  ): Promise<InventoryAlertsDto> {
    return this.lowStock.alerts(seller.id);
  }
}
