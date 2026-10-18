import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin/admin.guards';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { AdminAuditService } from './admin-audit.service';
import { AdminOverviewService } from './admin-overview.service';
import {
  AdminOverviewDto,
  AuditPageDto,
  AuditQueryDto,
} from './dto/moderation.dto';

@ApiTags('Admin')
@AdminOnly()
@Controller('admin')
export class AdminInsightsController {
  constructor(
    private readonly overview: AdminOverviewService,
    private readonly audit: AdminAuditService,
  ) {}

  @ApiOperation({
    summary: 'Platform numbers and what’s waiting for an admin',
    description:
      'Paid orders and GMV count orders by when they were paid; GMV includes delivery fees.',
  })
  @ApiOkEnvelope(AdminOverviewDto)
  @Get('overview')
  getOverview(): Promise<AdminOverviewDto> {
    return this.overview.get();
  }

  @ApiOperation({
    summary: 'Audit log, newest first',
    description:
      'Every admin change and money movement: who (null for a system job), what and when.',
  })
  @ApiOkEnvelope(AuditPageDto)
  @Get('audit-log')
  auditLog(@Query() query: AuditQueryDto): Promise<AuditPageDto> {
    return this.audit.list(query);
  }
}
