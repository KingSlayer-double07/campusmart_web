import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/swagger/error-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../guards/verified-email.guard';

// Signed in and email verified, or 401 / 403 EMAIL_NOT_VERIFIED. Every commerce endpoint from
// Phase 3 onward uses this instead of a bare JwtAuthGuard.
export function RequireVerifiedEmail() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, VerifiedEmailGuard),
    ApiCookieAuth(),
    ApiUnauthorizedResponse({ type: ErrorResponseDto }),
    ApiForbiddenResponse({
      type: ErrorResponseDto,
      description: 'EMAIL_NOT_VERIFIED',
    }),
  );
}
