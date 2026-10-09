import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { InstitutionDto } from './dto/institution.dto';
import { InstitutionsService } from './institutions.service';

@ApiTags('Institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @ApiOperation({
    summary: 'Get all institutions',
    description:
      'Public: used by the sign-up and waitlist pages. Switched-off institutions are hidden.',
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
}
