import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GuestOrUser } from '../auth/decorators/guest-or-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import {
  GuestSchoolQueryDto,
  ListListingsQueryDto,
} from './dto/listing-query.dto';
import { ListingCardDto, ListingDto, ListingPageDto } from './dto/listing.dto';
import { ListingsService } from './listings.service';

const NOT_FOUND = {
  status: 404,
  type: ErrorResponseDto,
  description:
    'Not at this school, not active, or deleted; or (guests) no such school',
} as const;
const SCHOOL_OFF = {
  status: 403,
  type: ErrorResponseDto,
  description: 'INSTITUTION_INACTIVE: the guest’s school is switched off',
} as const;

// Guide 3.1's buyer reads, open to guests since 2026-10-19: signed in, they show your own school;
// signed out, the school in institutionId. Guests aren't counted as views (A2).
@ApiTags('Listings')
@GuestOrUser()
@Controller('listings')
export class ListingsBrowseController {
  constructor(private readonly listings: ListingsService) {}

  @ApiOperation({
    summary: 'Browse listings at your institution, or a guest’s chosen one',
    description:
      'Active listings only. Search matches the title or description. Sorts: newest, price_asc, ' +
      'price_desc, popular (views in the last 7 days; first 200 results).',
  })
  @ApiOkEnvelope(ListingPageDto)
  @ApiResponse(SCHOOL_OFF)
  @ApiResponse({
    status: 404,
    type: ErrorResponseDto,
    description: 'Guests: no such school',
  })
  @Get()
  browse(
    @Query() query: ListListingsQueryDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<ListingPageDto> {
    return this.listings.browse(user, query);
  }

  @ApiOperation({
    summary: 'One listing with photos, options and seller',
    description:
      'Records a view for a signed-in buyer, not the seller or a guest. The seller also sees their own drafts here.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ListingDto)
  @ApiResponse(SCHOOL_OFF)
  @ApiResponse(NOT_FOUND)
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: GuestSchoolQueryDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<ListingDto> {
    return this.listings.findOne(user, id, query.institutionId);
  }

  @ApiOperation({ summary: 'Up to 10 active listings in the same category' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope([ListingCardDto])
  @ApiResponse(SCHOOL_OFF)
  @ApiResponse(NOT_FOUND)
  @Get(':id/related')
  related(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: GuestSchoolQueryDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<ListingCardDto[]> {
    return this.listings.related(user, id, query.institutionId);
  }
}
