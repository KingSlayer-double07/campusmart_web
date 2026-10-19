import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';
import { SellerListingsQueryDto } from '../listings/dto/listing-query.dto';
import { ListingPageDto } from '../listings/dto/listing.dto';
import { ListingsService } from '../listings/listings.service';
import {
  SellerProfileDto,
  UpdateSellerProfileDto,
} from './dto/seller-profile.dto';
import { SellersService } from './sellers.service';

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
export class SellersController {
  constructor(
    private readonly sellers: SellersService,
    private readonly listingsService: ListingsService,
  ) {}

  @ApiOperation({ summary: 'Your store profile' })
  @ApiOkEnvelope(SellerProfileDto)
  @Get()
  me(@CurrentUser() user: AuthUser): Promise<SellerProfileDto> {
    return this.sellers.me(user.id);
  }

  @ApiOperation({
    summary: 'Edit your store profile',
    description:
      'storeName, bio, logoUrl (AVATAR upload) and the isOnline toggle',
  })
  @ApiOkEnvelope(SellerProfileDto)
  @Patch()
  update(
    @Body() dto: UpdateSellerProfileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SellerProfileDto> {
    return this.sellers.update(user.id, dto);
  }

  @ApiOperation({
    summary: 'Your listings, every status including drafts',
    description: 'Newest first; filter with status',
  })
  @ApiOkEnvelope(ListingPageDto)
  @Get('listings')
  listings(
    @Query() query: SellerListingsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ListingPageDto> {
    return this.listingsService.sellerListings(user, query);
  }
}
