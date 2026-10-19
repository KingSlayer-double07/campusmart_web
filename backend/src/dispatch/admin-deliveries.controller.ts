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
import { CursorQueryDto } from '../common/pagination';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { AdminDeliveriesService } from './admin-deliveries.service';
import {
  AdminDeliveryJobDto,
  AdminDeliveryJobPageDto,
  AdminReasonDto,
  AssignRiderDto,
  ListDeliveriesQueryDto,
  LockedHandoverPageDto,
  UnlockResultDto,
} from './dto/admin-delivery.dto';

const uuid = new ParseUUIDPipe();

// Phase 6: delivery jobs for admins (C5, F5)
@ApiTags('Admin')
@AdminOnly()
@Controller('admin')
export class AdminDeliveriesController {
  constructor(private readonly deliveries: AdminDeliveriesService) {}

  @ApiOperation({ summary: 'Delivery jobs', description: 'By view' })
  @ApiOkEnvelope(AdminDeliveryJobPageDto)
  @Get('deliveries')
  list(
    @Query() query: ListDeliveriesQueryDto,
  ): Promise<AdminDeliveryJobPageDto> {
    return this.deliveries.list(query);
  }

  @ApiOperation({
    summary: 'Assign or reassign a rider',
    description:
      'An active rider at the job’s campus. Logged with your id and the old and new rider (C5).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminDeliveryJobDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'INVALID_RIDER',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'JOB_CLOSED',
  })
  @HttpCode(HttpStatus.OK)
  @Post('deliveries/:id/assign')
  assign(
    @Param('id', uuid) id: string,
    @Body() dto: AssignRiderDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminDeliveryJobDto> {
    return this.deliveries.assign(id, dto, admin.id);
  }

  @ApiOperation({
    summary: 'Locked handovers',
    description: 'Orders locked after 5 wrong buyer codes (F5), oldest first',
  })
  @ApiOkEnvelope(LockedHandoverPageDto)
  @Get('locked-handovers')
  locked(@Query() query: CursorQueryDto): Promise<LockedHandoverPageDto> {
    return this.deliveries.locked(query);
  }

  @ApiOperation({
    summary: 'Unlock a handover',
    description:
      'After checking with the buyer. Needs a reason, kept in the audit log.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'The seller order' })
  @ApiOkEnvelope(UnlockResultDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'NOT_LOCKED',
  })
  @HttpCode(HttpStatus.OK)
  @Post('seller-orders/:id/unlock')
  unlock(
    @Param('id', uuid) id: string,
    @Body() dto: AdminReasonDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<UnlockResultDto> {
    return this.deliveries.unlock(id, dto.reason, admin.id);
  }
}
