import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { ReportListingDto, ReportReceiptDto } from './dto/moderation.dto';
import { ListingReportsService } from './listing-reports.service';

@ApiTags('Listings')
@RequireVerifiedEmail()
@Controller('listings')
export class ListingReportsController {
  constructor(private readonly reports: ListingReportsService) {}

  @ApiOperation({
    summary: 'Report a listing',
    description:
      'Once per user per listing. Five different users’ reports send it to the admins; a prohibited-item ' +
      'report hides it at once until an admin reviews it (M4, M4b).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ReportReceiptDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'OWN_LISTING or VALIDATION_FAILED',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'ALREADY_REPORTED',
  })
  @Post(':id/report')
  report(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReportListingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReportReceiptDto> {
    return this.reports.report(user, id, dto);
  }
}
