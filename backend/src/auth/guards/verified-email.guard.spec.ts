import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { VerifiedEmailGuard } from './verified-email.guard';

const contextFor = (user: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('VerifiedEmailGuard', () => {
  const guard = new VerifiedEmailGuard();

  it('lets a verified user through', () => {
    expect(guard.canActivate(contextFor({ emailVerifiedAt: new Date() }))).toBe(
      true,
    );
  });

  it('returns 403 EMAIL_NOT_VERIFIED for an unverified user', () => {
    try {
      guard.canActivate(contextFor({ emailVerifiedAt: null }));
      fail('expected a ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
  });

  it('returns 401 when nobody is signed in', () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
