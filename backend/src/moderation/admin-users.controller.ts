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
import { AdminUsersService } from './admin-users.service';
import {
  AdminUserDto,
  AdminUserPageDto,
  AdminUsersQueryDto,
  ReasonDto,
  SetRoleDto,
} from './dto/moderation.dto';

const uuid = new ParseUUIDPipe();

@ApiTags('Admin')
@AdminOnly()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @ApiOperation({
    summary: 'Users, newest first',
    description:
      'Search by email or name; filter by role, school or suspended.',
  })
  @ApiOkEnvelope(AdminUserPageDto)
  @Get()
  list(@Query() query: AdminUsersQueryDto): Promise<AdminUserPageDto> {
    return this.users.list(query);
  }

  @ApiOperation({
    summary: 'Change a user’s role',
    description:
      'BUYER, SELLER or ADMIN; the only way to grant ADMIN (M1). Not your own role, and not a rider’s. ' +
      'The user is signed out. A seller who stops selling has their live listings archived. Audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminUserDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'CANNOT_CHANGE_ROLE, NO_INSTITUTION or VALIDATION_FAILED',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Patch(':id/role')
  setRole(
    @Param('id', uuid) id: string,
    @Body() dto: SetRoleDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminUserDto> {
    return this.users.setRole(id, dto, admin.id);
  }

  @ApiOperation({
    summary: 'Suspend a user',
    description:
      'Signs them out everywhere at once and archives their live listings; open orders stay for admins. ' +
      'They see the reason when they try to sign in (M6). Not yourself or another admin. Audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminUserDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'CANNOT_SUSPEND or VALIDATION_FAILED',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'ALREADY_SUSPENDED',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/suspend')
  suspend(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminUserDto> {
    return this.users.suspend(id, dto.reason, admin.id);
  }

  @ApiOperation({
    summary: 'Lift a suspension',
    description:
      'They can sign in again. Archived listings stay archived. Audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminUserDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'NOT_SUSPENDED',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/unsuspend')
  unsuspend(
    @Param('id', uuid) id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminUserDto> {
    return this.users.unsuspend(id, admin.id);
  }
}
