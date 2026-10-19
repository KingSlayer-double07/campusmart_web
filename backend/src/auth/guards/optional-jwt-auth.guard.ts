import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../auth-cookies';

// Guests welcome: no access cookie means no user. A cookie that's there but doesn't check out
// is still a 401, so the app refreshes the session instead of quietly showing the guest view.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const cookies = context.switchToHttp().getRequest<Request>().cookies as
      Record<string, string | undefined> | undefined;
    if (!cookies?.[ACCESS_COOKIE]) return true;
    return super.canActivate(context);
  }
}
