import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const contextWith = (cookies?: Record<string, string>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ cookies }) }),
  }) as unknown as ExecutionContext;

describe('OptionalJwtAuthGuard', () => {
  const parent = jest.spyOn(
    (AuthGuard('jwt') as { prototype: { canActivate: () => unknown } })
      .prototype,
    'canActivate',
  );

  beforeEach(() => parent.mockReset().mockReturnValue(true));

  it('lets a guest without an access cookie through, as no user', () => {
    expect(new OptionalJwtAuthGuard().canActivate(contextWith())).toBe(true);
    expect(
      new OptionalJwtAuthGuard().canActivate(contextWith({ other: 'x' })),
    ).toBe(true);
    expect(parent).not.toHaveBeenCalled();
  });

  it('checks an access cookie as usual, so a bad one is still a 401', () => {
    void new OptionalJwtAuthGuard().canActivate(
      contextWith({ access_token: 'jwt' }),
    );
    expect(parent).toHaveBeenCalledTimes(1);
  });
});
