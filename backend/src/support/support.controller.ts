import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import {
  CreateSupportReportDto,
  SupportContactsDto,
  SupportReceiptDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @ApiOperation({
    summary: 'How to reach CampusMart (T4)',
    description: 'Public. Each one unset is null.',
  })
  @ApiOkEnvelope(SupportContactsDto)
  @Get('contacts')
  contacts(): SupportContactsDto {
    return this.support.contacts();
  }

  @ApiOperation({
    summary: 'Send a report to CampusMart',
    description:
      'Any signed-in user. Admins see it at /admin/reports and are alerted.',
  })
  @ApiOkEnvelope(SupportReceiptDto, { status: 201 })
  @ApiCookieAuth()
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED or INVALID_IMAGE',
  })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reports')
  report(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSupportReportDto,
  ): Promise<SupportReceiptDto> {
    return this.support.report(user, dto);
  }
}
