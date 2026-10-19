import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';

// Goes on every admin controller class (guide 9.1), so no route can be left open by mistake
export const AdminOnly = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(UserRole.ADMIN),
    ApiCookieAuth(),
    ApiResponse({ status: 401, type: ErrorResponseDto }),
    ApiResponse({
      status: 403,
      type: ErrorResponseDto,
      description: 'Not an admin',
    }),
  );
