import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

// Pull the JWT out of the HTTP-only cookie rather than the Authorization header
const cookieExtractor = (req: Request): string | null => {
  const cookies = req?.cookies as
    | Record<string, string | undefined>
    | undefined;
  return cookies?.['access_token'] ?? null;
};

export type JwtPayload = {
  sub: string; // user id
  email: string;
  role: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('This account has been suspended');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account is inactive');
    }

    return user;
  }
}
