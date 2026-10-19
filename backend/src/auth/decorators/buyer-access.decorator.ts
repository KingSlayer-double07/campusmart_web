import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/swagger/error-response.dto';
import { NoRidersGuard } from '../guards/no-riders.guard';
import { RequireVerifiedEmail } from './require-verified-email.decorator';

// The cart, checkout, orders and payments: signed in with a verified email, and not a rider
// (decision DX7)
export function BuyerAccess() {
  return applyDecorators(
    RequireVerifiedEmail(),
    UseGuards(NoRidersGuard),
    ApiResponse({
      status: 403,
      type: ErrorResponseDto,
      description: 'EMAIL_NOT_VERIFIED, or RIDERS_CANNOT_BUY',
    }),
  );
}
