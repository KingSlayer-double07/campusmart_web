import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/swagger/error-response.dto';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard';

// Reads a guest may make (decision 2026-10-19: guests browse a school they pick). Signed in,
// the user is checked as usual; signed out, the route sees no user.
export function GuestOrUser() {
  return applyDecorators(
    UseGuards(OptionalJwtAuthGuard),
    ApiCookieAuth(),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description:
        'UNAUTHENTICATED: a session that has ended, or a guest without institutionId',
    }),
  );
}
