import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// The user JwtStrategy.validate() attached to the request
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ user?: unknown }>().user,
);
