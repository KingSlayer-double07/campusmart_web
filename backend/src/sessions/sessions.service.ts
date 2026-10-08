import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ClientMeta } from '../auth/auth-user';
import { SessionDto } from './dto/session.dto';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (D6)

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes in base64url

type Db = PrismaService | Prisma.TransactionClient;

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const newToken = () => randomBytes(32).toString('base64url');

function sameHash(a: string, b: string) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

// The refresh cookie holds `<sessionId>.<token>` (guide 1.4 rule 5)
export function parseRefreshCookie(
  value: unknown,
): { sid: string; token: string } | null {
  if (typeof value !== 'string') return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const sid = value.slice(0, dot);
  const token = value.slice(dot + 1);
  return UUID_RE.test(sid) && TOKEN_RE.test(token) ? { sid, token } : null;
}

const sessionEnded = () =>
  new UnauthorizedException('Your session has ended. Sign in again.');

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, meta: ClientMeta, db: Db = this.prisma) {
    const token = newToken();
    const session = await db.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(token),
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        ipAddress: meta.ipAddress ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
      select: { id: true },
    });
    return { sessionId: session.id, refreshToken: `${session.id}.${token}` };
  }

  // Rotation with reuse detection: a matching token is swapped for a new one; a stale one means
  // the old token was replayed, so the whole session is revoked.
  async rotate(cookie: unknown, meta: ClientMeta) {
    const parsed = parseRefreshCookie(cookie);
    if (!parsed) throw sessionEnded();

    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sid },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw sessionEnded();
    }

    if (!sameHash(sha256(parsed.token), session.refreshTokenHash)) {
      await this.revokeById(session.id);
      throw sessionEnded();
    }

    const token = newToken();
    // Conditional on the hash we just checked, so two concurrent refreshes can't both win
    const { count } = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: session.refreshTokenHash,
        revokedAt: null,
      },
      data: {
        refreshTokenHash: sha256(token),
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        ...(meta.ipAddress && { ipAddress: meta.ipAddress }),
      },
    });
    if (count !== 1) {
      await this.revokeById(session.id);
      throw sessionEnded();
    }

    return {
      userId: session.userId,
      sessionId: session.id,
      refreshToken: `${session.id}.${token}`,
    };
  }

  // Logout: revoke the session named by the refresh cookie, but only if the token is genuine
  async revokeByCookie(cookie: unknown) {
    const parsed = parseRefreshCookie(cookie);
    if (!parsed) return;
    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sid },
      select: { id: true, refreshTokenHash: true },
    });
    if (session && sameHash(sha256(parsed.token), session.refreshTokenHash)) {
      await this.revokeById(session.id);
    }
  }

  async list(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ipAddress: true, lastUsedAt: true },
    });
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  // Ownership is part of the WHERE clause: another user's session id is a 404
  async revoke(userId: string, sessionId: string) {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Session not found');
  }

  async revokeOthers(
    userId: string,
    currentSessionId: string,
    db: Db = this.prisma,
  ) {
    await db.session.updateMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string, db: Db = this.prisma) {
    await db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeById(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
