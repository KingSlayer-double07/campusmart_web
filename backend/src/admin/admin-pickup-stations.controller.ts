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
import { AdminPickupStationsService } from './admin-pickup-stations.service';
import {
  AdminPickupStationDto,
  AdminPickupStationPageDto,
  CreatePickupStationDto,
  ListPickupStationsQueryDto,
  UpdatePickupStationDto,
} from './dto/pickup-station.dto';

@ApiTags('Admin')
@AdminOnly()
@Controller('admin/pickup-stations')
export class AdminPickupStationsController {
  constructor(private readonly stations: AdminPickupStationsService) {}

  @ApiOperation({
    summary: 'List pickup stations',
    description:
      'Every station, active or not, by institution then name. `q` matches the name or address.',
  })
  @ApiOkEnvelope(AdminPickupStationPageDto)
  @Get()
  list(
    @Query() query: ListPickupStationsQueryDto,
  ): Promise<AdminPickupStationPageDto> {
    return this.stations.list(query);
  }

  @ApiOperation({ summary: 'Add a pickup station' })
  @ApiOkEnvelope(AdminPickupStationDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description:
      'VALIDATION_FAILED, or INVALID_REFERENCE for an unknown institution',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'The institution already has a station with this name',
  })
  @Post()
  create(
    @Body() dto: CreatePickupStationDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminPickupStationDto> {
    return this.stations.create(dto, admin.id);
  }

  @ApiOperation({
    summary: 'Edit or switch a pickup station on or off',
    description:
      'The institution cannot change. Switching it off (isActive: false) needs a reason.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminPickupStationDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePickupStationDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminPickupStationDto> {
    return this.stations.update(id, dto, admin.id);
  }
}
