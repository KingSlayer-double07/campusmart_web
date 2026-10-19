import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AccessTokenPayload } from '../../auth/auth-user';

type TrackedRequest = {
  ip?: string;
  cookies?: Record<string, unknown>;
  body?: unknown;
};

// Students share campus NAT addresses, so rate limits follow the account, not the IP
// (decided 2026-10-09):
//   1. a valid access token        -> the user id (verify-email, resend, password change, ...)
//   2. an email in the request body -> that email (login, register, forgot/reset password)
//   3. anything else                -> the client IP
// The token is verified, not just decoded, so a forged `sub` can't be used to dodge a limit.
export function throttleTracker(
  req: TrackedRequest,
  verifyAccessToken: (token: string) => string | null,
): string {
  const token = req.cookies?.access_token;
  if (typeof token === 'string' && token.length > 0) {
    const userId = verifyAccessToken(token);
    if (userId) return `user:${userId}`;
  }

  const email =
    typeof req.body === 'object' && req.body !== null
      ? (req.body as Record<string, unknown>).email
      : undefined;
  if (typeof email === 'string' && email.trim().length > 0) {
    return `email:${email.trim().toLowerCase()}`;
  }

  return `ip:${req.ip ?? 'unknown'}`;
}

@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  private jwt?: JwtService;

  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(
      throttleTracker(req as TrackedRequest, (token) => this.userIdFrom(token)),
    );
  }

  private userIdFrom(token: string): string | null {
    // Created lazily: JWT_SECRET is validated by ConfigModule before the first request
    this.jwt ??= new JwtService({ secret: process.env.JWT_SECRET });
    try {
      return this.jwt.verify<AccessTokenPayload>(token).sub ?? null;
    } catch {
      return null; // expired or forged: fall back to the email or IP
    }
  }
}
