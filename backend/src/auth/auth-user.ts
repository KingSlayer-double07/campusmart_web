import type { Prisma } from '../generated/prisma/client';
import { safeUserSelect } from '../users/user.select';

export type SafeUser = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;

// What JwtStrategy.validate() puts on req.user: the safe user plus the session behind the token
export type AuthUser = SafeUser & { sessionId: string };

// Access-token payload (D6, guide 1.4 rule 4)
export interface AccessTokenPayload {
  sub: string; // user id
  sid: string; // session id
  role: string;
}

// Request metadata recorded on a session for the Active Sessions page
export interface ClientMeta {
  userAgent?: string;
  ipAddress?: string;
}
