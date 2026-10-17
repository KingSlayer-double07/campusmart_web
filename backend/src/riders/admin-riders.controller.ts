import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin/admin.guards';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import {
  AdminRiderDto,
  AdminRiderPageDto,
  InviteRiderDto,
  ListRidersQueryDto,
  SetRiderActiveDto,
} from './dto/rider.dto';
import { RidersService } from './riders.service';

// Phase 6 (decision DX1): admins invite, list and switch off riders
@ApiTags('Admin')
@AdminOnly()
@Controller('admin/riders')
export class AdminRidersController {
  constructor(private readonly riders: RidersService) {}

  @ApiOperation({
    summary: 'List riders',
    description: 'Newest first. `q` matches the email or name.',
  })
  @ApiOkEnvelope(AdminRiderPageDto)
  @Get()
  list(@Query() query: ListRidersQueryDto): Promise<AdminRiderPageDto> {
    return this.riders.list(query);
  }

  @ApiOperation({
    summary: 'Invite a rider',
    description:
      'Creates a rider account at that campus and emails a link to set the password (7 days). Logged with your id.',
  })
  @ApiOkEnvelope(AdminRiderDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED, or INVALID_REFERENCE for the institution',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'EMAIL_TAKEN',
  })
  @Post()
  invite(
    @Body() dto: InviteRiderDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminRiderDto> {
    return this.riders.invite(dto, admin.id);
  }

  @ApiOperation({
    summary: 'Send the invite again',
    description: 'A new link; the old one stops working',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminRiderDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'INVITE_ALREADY_ACCEPTED',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/resend-invite')
  resend(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminRiderDto> {
    return this.riders.resendInvite(id, admin.id);
  }

  @ApiOperation({
    summary: 'Switch a rider off or on',
    description:
      'Switching off ends their sessions. Refused while they hold a job: reassign it first.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminRiderDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'RIDER_HAS_JOBS',
  })
  @Patch(':id')
  setActive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetRiderActiveDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminRiderDto> {
    return this.riders.setActive(id, dto, admin.id);
  }
}
