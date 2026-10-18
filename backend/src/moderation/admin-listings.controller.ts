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
import { AdminListingsService } from './admin-listings.service';
import {
  AdminListingDto,
  AdminListingPageDto,
  AdminListingsQueryDto,
  ModerateListingDto,
} from './dto/moderation.dto';

@ApiTags('Admin')
@AdminOnly()
@Controller('admin/listings')
export class AdminListingsController {
  constructor(private readonly listings: AdminListingsService) {}

  @ApiOperation({
    summary: 'Listings to moderate',
    description:
      'REVIEW (default, oldest first): held by a banned word, flagged by reports or an admin, or ' +
      'edited after being rejected. HIDDEN: rejected. ALL: everything not deleted.',
  })
  @ApiOkEnvelope(AdminListingPageDto)
  @Get()
  list(@Query() query: AdminListingsQueryDto): Promise<AdminListingPageDto> {
    return this.listings.list(query);
  }

  @ApiOperation({
    summary: 'Approve, reject, flag or unflag a listing',
    description:
      'APPROVE puts it live (again) and closes its reports. REJECT hides it with an M3 reason the seller ' +
      'sees, and closes its reports; a prohibited item that buyers could see suspends the seller (M4d-M4f). ' +
      'FLAG and UNFLAG move it in or out of the review queue while it stays visible. Audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminListingDto)
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'SELLER_SUSPENDED or MODERATION_NOT_APPLICABLE',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/moderate')
  moderate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ModerateListingDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminListingDto> {
    return this.listings.moderate(id, dto, admin.id);
  }
}
