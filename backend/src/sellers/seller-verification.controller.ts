import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';
import {
  MyVerificationDto,
  SubmitVerificationDto,
} from './dto/verification.dto';
import { SellerVerificationService } from './seller-verification.service';

// Guide 9.2.5: sellers send a student ID photo; an admin approves it at /admin/verifications.
// Class decorators apply bottom-up, so RolesGuard (listed first) runs after the sign-in guards.
@ApiTags('Sellers')
@UseGuards(RolesGuard)
@RequireVerifiedEmail()
@Roles(UserRole.SELLER)
@ApiResponse({
  status: 403,
  type: ErrorResponseDto,
  description: 'Not a seller',
})
@Controller('users/me')
export class SellerVerificationController {
  constructor(private readonly verification: SellerVerificationService) {}

  @ApiOperation({
    summary: 'Your verification status and latest request',
    description:
      "Includes the admin's reason when the latest request was rejected",
  })
  @ApiOkEnvelope(MyVerificationDto)
  @Get('verification')
  mine(@CurrentUser() user: AuthUser): Promise<MyVerificationDto> {
    return this.verification.mine(user.id);
  }

  @ApiOperation({
    summary: 'Ask to be verified',
    description:
      'documentUrl is a student ID photo uploaded with purpose VERIFICATION. Puts the seller in PENDING until an admin decides.',
  })
  @ApiOkEnvelope(MyVerificationDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'INVALID_DOCUMENT: not your private VERIFICATION upload',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'ALREADY_VERIFIED or VERIFICATION_PENDING',
  })
  @ApiResponse({
    status: 503,
    type: ErrorResponseDto,
    description: 'UPLOADS_NOT_CONFIGURED',
  })
  @Post('verify')
  submit(
    @Body() dto: SubmitVerificationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MyVerificationDto> {
    return this.verification.submit(user, dto);
  }
}
