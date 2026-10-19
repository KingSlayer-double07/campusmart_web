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
import { AdminCampusPlacesService } from './admin-campus-places.service';
import {
  AdminCampusPlaceDto,
  AdminCampusPlacePageDto,
  CreateCampusPlaceDto,
  ListCampusPlacesQueryDto,
  UpdateCampusPlaceDto,
} from './dto/campus-place.dto';

@ApiTags('Admin')
@AdminOnly()
@Controller('admin/campus-places')
export class AdminCampusPlacesController {
  constructor(private readonly places: AdminCampusPlacesService) {}

  @ApiOperation({
    summary: 'List campus places',
    description:
      'Every delivery place, active or not, by institution then name. `q` matches the name.',
  })
  @ApiOkEnvelope(AdminCampusPlacePageDto)
  @Get()
  list(
    @Query() query: ListCampusPlacesQueryDto,
  ): Promise<AdminCampusPlacePageDto> {
    return this.places.list(query);
  }

  @ApiOperation({
    summary: 'Add a campus place',
    description:
      'Buyers at that school can choose it for delivery straight away',
  })
  @ApiOkEnvelope(AdminCampusPlaceDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description:
      'VALIDATION_FAILED, or INVALID_REFERENCE for an unknown institution',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'The institution already has a place with this name',
  })
  @Post()
  create(
    @Body() dto: CreateCampusPlaceDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminCampusPlaceDto> {
    return this.places.create(dto, admin.id);
  }

  @ApiOperation({
    summary: 'Rename or switch a campus place on or off',
    description:
      'The institution cannot change. Switching it off (isActive: false) needs a reason; orders already placed keep it.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminCampusPlaceDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCampusPlaceDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminCampusPlaceDto> {
    return this.places.update(id, dto, admin.id);
  }
}
