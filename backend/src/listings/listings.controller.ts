import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { ListingDto } from './dto/listing.dto';
import { ListingsService } from './listings.service';

const NOT_FOUND = {
  status: 404,
  type: ErrorResponseDto,
  description: 'Not in your institution, deleted, or not yours',
} as const;

// Sellers' writes. The reads guests may make too are in listings-browse.controller.ts.
@ApiTags('Listings')
@RequireVerifiedEmail()
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

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
    return this.listings.setStatus(user, id, dto);
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
