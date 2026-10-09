import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';
import {
  CreateListingDto,
  ListingStatusDto,
  UpdateListingDto,
} from './dto/listing-input.dto';
import { ListListingsQueryDto } from './dto/listing-query.dto';
import { ListingCardDto, ListingDto, ListingPageDto } from './dto/listing.dto';
import { ListingsService } from './listings.service';

const NOT_FOUND = {
  status: 404,
  type: ErrorResponseDto,
  description:
    'Not in your institution, not active, deleted, or (owner routes) not yours',
} as const;

@ApiTags('Listings')
@RequireVerifiedEmail()
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @ApiOperation({
    summary: 'Browse listings at your institution',
    description:
      'Active listings only. Search matches the title or description. Sorts: newest, price_asc, ' +
      'price_desc, popular (views in the last 7 days; first 200 results).',
  })
  @ApiOkEnvelope(ListingPageDto)
  @Get()
  browse(
    @Query() query: ListListingsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ListingPageDto> {
    return this.listings.browse(user, query);
  }

  @ApiOperation({
    summary: 'One listing with photos, options and seller',
    description:
      "Records a view unless you're the seller. The seller also sees their own drafts here.",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ListingDto)
  @ApiResponse(NOT_FOUND)
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ListingDto> {
    return this.listings.findOne(user, id);
  }

  @ApiOperation({ summary: 'Up to 10 active listings in the same category' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope([ListingCardDto])
  @ApiResponse(NOT_FOUND)
  @Get(':id/related')
  related(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ListingCardDto[]> {
    return this.listings.related(user, id);
  }

  @ApiOperation({
    summary: 'Create a listing (sellers)',
    description:
      'Photos must be uploaded with a LISTING signature from POST /uploads/signature. ' +
      'An ACTIVE listing with no stock is saved as SOLDOUT.',
  })
  @ApiOkEnvelope(ListingDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description:
      'VALIDATION_FAILED, or INVALID_IMAGE for a photo not uploaded through CampusMart',
  })
  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER)
  @Post()
  create(
    @Body() dto: CreateListingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ListingDto> {
    return this.listings.create(user, dto);
  }

  @ApiOperation({
    summary: 'Edit your listing',
    description:
      'Partial update. images and variants, when sent, replace the whole set (options are matched by name).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ListingDto)
  @ApiResponse(NOT_FOUND)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateListingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ListingDto> {
    return this.listings.update(user, id, dto);
  }

  @ApiOperation({
    summary: 'Publish, unpublish or archive your listing',
    description:
      'ACTIVE with no stock becomes SOLDOUT. A listing under review (FLAGGED) cannot change.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ListingDto)
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'LISTING_UNDER_REVIEW',
  })
  @Patch(':id/status')
  setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ListingStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ListingDto> {
    return this.listings.setStatus(user, id, dto.status);
  }

  @ApiOperation({ summary: 'Delete your listing (soft delete)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'LISTING_HAS_OPEN_ORDERS (details.openOrders)',
  })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.listings.remove(user, id);
  }
}
