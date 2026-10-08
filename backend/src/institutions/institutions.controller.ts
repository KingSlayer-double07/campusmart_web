import {
  Controller,
  Get,
  Param,
  UseGuards,
  Body,
  Post,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { InstitutionDto } from './dto/institution.dto';
import { InstitutionsService } from './institutions.service';

@ApiTags('Institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @ApiOperation({
    summary: 'Get all institutions',
    description: 'Public: used by the sign-up and waitlist pages',
  })
  @ApiOkEnvelope([InstitutionDto])
  @Get()
  async getAllInstitutions(): Promise<InstitutionDto[]> {
    return this.institutionsService.getAllInstitutions();
  }

  @ApiOperation({ summary: 'Get institution by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(InstitutionDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get(':id')
  async getInstitutionById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<InstitutionDto> {
    return this.institutionsService.getInstitutionById(id);
  }

  // Replaced by POST /admin/institutions in Phase 9
  @ApiOperation({
    summary: 'Create a new institution',
    description: 'Admin only',
  })
  @ApiCookieAuth()
  @ApiOkEnvelope(InstitutionDto, { status: 201 })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  async createInstitution(
    @Body() dto: CreateInstitutionDto,
  ): Promise<InstitutionDto> {
    return this.institutionsService.createInstitution(dto);
  }
}
