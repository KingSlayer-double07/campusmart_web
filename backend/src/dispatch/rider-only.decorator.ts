import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';

// The rider app's routes (DISPATCH only); anyone else gets 403
export const RiderOnly = () =>
  applyDecorators(
    RequireVerifiedEmail(),
    UseGuards(RolesGuard),
    Roles(UserRole.DISPATCH),
    ApiResponse({
      status: 403,
      type: ErrorResponseDto,
      description: 'Not a rider',
    }),
  );
