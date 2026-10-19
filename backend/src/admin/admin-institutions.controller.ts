import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { AdminOnly } from './admin.guards';
import { AdminInstitutionsService } from './admin-institutions.service';
import { AdminListQueryDto } from './dto/active-toggle.dto';
import {
  AdminInstitutionDto,
  AdminInstitutionPageDto,
  CreateInstitutionDto,
  UpdateInstitutionDto,
} from './dto/institution.dto';

@ApiTags('Admin')
@AdminOnly()
@Controller('admin/institutions')
export class AdminInstitutionsController {
  constructor(private readonly institutions: AdminInstitutionsService) {}

  @ApiOperation({
    summary: 'List institutions',
    description:
      'Every institution, active or not, by name. `q` matches the name or an exact domain.',
  })
  @ApiOkEnvelope(AdminInstitutionPageDto)
  @Get()
  list(@Query() query: AdminListQueryDto): Promise<AdminInstitutionPageDto> {
    return this.institutions.list(query);
  }

  @ApiOperation({
    summary: 'Add an institution',
    description:
      'Students can sign up with emails on its domains straight away.',
  })
  @ApiOkEnvelope(AdminInstitutionDto, { status: 201 })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'CONFLICT (name taken) or DOMAIN_IN_USE (details.domain)',
  })
  @Post()
  create(
    @Body() dto: CreateInstitutionDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminInstitutionDto> {
    return this.institutions.create(dto, admin.id);
  }

  @ApiOperation({
    summary: 'Edit or switch an institution on or off',
    description:
      'Switching it off (isActive: false, with a reason) blocks sign-ups, hides it from the public list ' +
      'and stops everyone but admins signing in; signed-in users are cut off at their next refresh.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminInstitutionDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description:
      'CONFLICT, DOMAIN_IN_USE, or INSTITUTION_HAS_OPEN_ORDERS (details.openOrders) when switching off a school with orders in progress',
  })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInstitutionDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminInstitutionDto> {
    return this.institutions.update(id, dto, admin.id);
  }
}
