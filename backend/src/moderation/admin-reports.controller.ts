import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin/admin.guards';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import {
  AdminReportDto,
  AdminReportPageDto,
  AdminReportsQueryDto,
  UpdateReportDto,
} from './dto/moderation.dto';
import { ListingReportsService } from './listing-reports.service';

@ApiTags('Admin')
@AdminOnly()
@Controller('admin/support-reports')
export class AdminReportsController {
  constructor(private readonly reports: ListingReportsService) {}

  @ApiOperation({
    summary: 'Reports from users',
    description:
      'OPEN (default) oldest first, or CLOSED latest first. Listing reports close themselves when an admin moderates the listing.',
  })
  @ApiOkEnvelope(AdminReportPageDto)
  @Get()
  list(@Query() query: AdminReportsQueryDto): Promise<AdminReportPageDto> {
    return this.reports.list(query);
  }

  @ApiOperation({
    summary: 'Close or reopen a report',
    description: 'Closing needs a note saying what was done. Audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminReportDto)
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'Already in that status',
  })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateReportDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminReportDto> {
    return this.reports.update(id, dto, admin.id);
  }
}
