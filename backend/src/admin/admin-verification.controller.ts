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
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { AdminOnly } from './admin.guards';
import { AdminVerificationService } from './admin-verification.service';
import {
  AdminVerificationPageDto,
  AdminVerificationRequestDto,
  DecideVerificationDto,
  ListVerificationRequestsQueryDto,
} from './dto/verification-request.dto';

@ApiTags('Admin')
@AdminOnly()
@Controller('admin/verification-requests')
export class AdminVerificationController {
  constructor(private readonly verification: AdminVerificationService) {}

  @ApiOperation({
    summary: 'Seller verification requests',
    description:
      'PENDING (default) oldest first, or VERIFIED / REJECTED latest first. Each has a 10-minute link to the ID photo.',
  })
  @ApiOkEnvelope(AdminVerificationPageDto)
  @Get()
  list(
    @Query() query: ListVerificationRequestsQueryDto,
  ): Promise<AdminVerificationPageDto> {
    return this.verification.list(query);
  }

  @ApiOperation({
    summary: 'Approve or reject a seller',
    description:
      'VERIFIED lets the seller publish listings. REJECTED needs a note, which the seller sees. Audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminVerificationRequestDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'VERIFICATION_ALREADY_DECIDED',
  })
  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DecideVerificationDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminVerificationRequestDto> {
    return this.verification.decide(id, dto, admin.id);
  }
}
