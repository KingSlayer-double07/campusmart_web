import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { BuyerAccess } from '../auth/decorators/buyer-access.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CursorQueryDto } from '../common/pagination';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import {
  MergeWishlistDto,
  WishlistIdsDto,
  WishlistPageDto,
} from './dto/wishlist.dto';
import { WishlistService } from './wishlist.service';

const uuid = new ParseUUIDPipe();

// Guide 8.1: favourites, for signed-in users with a verified email (riders don't buy: DX7)
@ApiTags('Wishlist')
@BuyerAccess()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @ApiOperation({
    summary: 'Your favourites, newest first',
    description:
      'Listing cards with `available: false` for ones sold out, paused or removed.',
  })
  @ApiOkEnvelope(WishlistPageDto)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: CursorQueryDto,
  ): Promise<WishlistPageDto> {
    return this.wishlist.list(user, query);
  }

  @ApiOperation({ summary: 'The ids of every favourite, for the hearts' })
  @ApiOkEnvelope(WishlistIdsDto)
  @Get('ids')
  ids(@CurrentUser() user: AuthUser): Promise<WishlistIdsDto> {
    return this.wishlist.ids(user);
  }

  @ApiOperation({
    summary: 'Move this phone’s favourites into the account (R5)',
    description:
      'Listings the user can’t see are skipped. Returns every favourite id afterwards.',
  })
  @ApiOkEnvelope(WishlistIdsDto)
  @HttpCode(HttpStatus.OK)
  @Post('merge')
  merge(
    @CurrentUser() user: AuthUser,
    @Body() dto: MergeWishlistDto,
  ): Promise<WishlistIdsDto> {
    return this.wishlist.merge(user, dto.listingIds);
  }

  @ApiOperation({
    summary: 'Save a listing',
    description: 'Idempotent. The listing must be at your school.',
  })
  @ApiParam({ name: 'listingId', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'WISHLIST_FULL',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put(':listingId')
  add(
    @CurrentUser() user: AuthUser,
    @Param('listingId', uuid) listingId: string,
  ): Promise<void> {
    return this.wishlist.add(user, listingId);
  }

  @ApiOperation({ summary: 'Take a listing out', description: 'Idempotent.' })
  @ApiParam({ name: 'listingId', format: 'uuid' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':listingId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('listingId', uuid) listingId: string,
  ): Promise<void> {
    return this.wishlist.remove(user, listingId);
  }
}
