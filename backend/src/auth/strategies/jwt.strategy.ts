import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { safeUserSelect } from '../../users/user.select';
import { ACCESS_COOKIE } from '../auth-cookies';
import type { AccessTokenPayload, AuthUser } from '../auth-user';

// The JWT lives in the httpOnly access_token cookie, never in an Authorization header
const cookieExtractor = (req: Request): string | null => {
  const cookies = req?.cookies as
    | Record<string, string | undefined>
    | undefined;
  return cookies?.[ACCESS_COOKIE] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  // One query: the session must be live and belong to the token's user (guide 1.4 rule 6), so
  // logout, "sign out other devices" and password changes take effect immediately.
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (!payload?.sub || !payload?.sid) throw new UnauthorizedException();

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { user: { select: safeUserSelect } },
    });

    if (!session) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    if (session.user.isSuspended) {
      throw new UnauthorizedException('This account has been suspended');
    }
    if (!session.user.isActive) {
      throw new UnauthorizedException('This account is inactive');
    }

    return { ...session.user, sessionId: payload.sid };
  }
}
