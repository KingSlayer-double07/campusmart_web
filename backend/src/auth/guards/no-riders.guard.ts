import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums';

// Decision DX7: rider accounts can't buy. Runs after JwtAuthGuard.
@Injectable()
export class NoRidersGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role: UserRole } }>();
    if (user?.role === UserRole.DISPATCH) {
      throw new ForbiddenException({
        code: 'RIDERS_CANNOT_BUY',
        message: "Rider accounts can't buy on CampusMart",
      });
    }
    return true;
  }
}
