import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseRefreshCookie,
  REFRESH_TOKEN_TTL_MS,
  SessionsService,
} from './sessions.service';

const SID = '6f1c1f9e-2a7b-4c1e-9a49-6f0d1f6a7b21';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('SessionsService', () => {
  const prisma = {
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new SessionsService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  describe('create', () => {
    it('stores only the SHA-256 of a 32-byte base64url token, valid 30 days', async () => {
      prisma.session.create.mockResolvedValue({ id: SID });
      const before = Date.now();
      const { refreshToken, sessionId } = await service.create('u1', {
        userAgent: 'UA',
        ipAddress: '1.2.3.4',
      });

      const parsed = parseRefreshCookie(refreshToken);
      expect(sessionId).toBe(SID);
      expect(parsed?.sid).toBe(SID);
      expect(parsed?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const { data } = prisma.session.create.mock.calls[0][0];
      expect(data.refreshTokenHash).toBe(sha256(parsed!.token));
      expect(data.refreshTokenHash).not.toContain(parsed!.token);
      expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + REFRESH_TOKEN_TTL_MS,
      );
    });
  });

  describe('rotate', () => {
    const token = 'a'.repeat(43);
    const live = {
      id: SID,
      userId: 'u1',
      refreshTokenHash: sha256(token),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('swaps a matching token for a new one, conditionally on the old hash', async () => {
      prisma.session.findUnique.mockResolvedValue(live);
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.rotate(`${SID}.${token}`, {});
      expect(result.userId).toBe('u1');
      expect(result.refreshToken).not.toBe(`${SID}.${token}`);

      const { where, data } = prisma.session.updateMany.mock.calls[0][0];
      expect(where).toMatchObject({
        id: SID,
        refreshTokenHash: sha256(token),
        revokedAt: null,
      });
      expect(data.refreshTokenHash).toBe(
        sha256(parseRefreshCookie(result.refreshToken)!.token),
      );
    });

    it('revokes the session when an old (already rotated) token is replayed', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...live,
        refreshTokenHash: sha256('b'.repeat(43)),
      });
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.rotate(`${SID}.${token}`, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: SID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokes when a concurrent refresh already rotated the token', async () => {
      prisma.session.findUnique.mockResolvedValue(live);
      prisma.session.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await expect(
        service.rotate(`${SID}.${token}`, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.session.updateMany).toHaveBeenLastCalledWith({
        where: { id: SID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it.each([
      ['a revoked session', { ...live, revokedAt: new Date() }],
      ['an expired session', { ...live, expiresAt: new Date(Date.now() - 1) }],
      ['an unknown session', null],
    ])('rejects %s', async (_label, session) => {
      prisma.session.findUnique.mockResolvedValue(session);
      await expect(
        service.rotate(`${SID}.${token}`, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it.each([undefined, '', 'garbage', `${SID}`, `not-a-uuid.${token}`])(
      'rejects a malformed cookie %p without touching the database',
      async (cookie) => {
        await expect(service.rotate(cookie, {})).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
        expect(prisma.session.findUnique).not.toHaveBeenCalled();
      },
    );
  });

  describe('list', () => {
    it('flags the current session', async () => {
      prisma.session.findMany.mockResolvedValue([
        { id: 'a', userAgent: null, ipAddress: null, lastUsedAt: new Date() },
        { id: 'b', userAgent: null, ipAddress: null, lastUsedAt: new Date() },
      ]);
      const list = await service.list('u1', 'b');
      expect(list.map((s) => [s.id, s.current])).toEqual([
        ['a', false],
        ['b', true],
      ]);
    });
  });

  describe('revoke', () => {
    it("is scoped to the user, so another user's session is a 404", async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revoke('u1', 'theirs')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.session.updateMany.mock.calls[0][0].where).toMatchObject({
        id: 'theirs',
        userId: 'u1',
      });
    });
  });

  describe('revokeOthers', () => {
    it('keeps the current session', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 2 });
      await service.revokeOthers('u1', 'current');
      expect(prisma.session.updateMany.mock.calls[0][0].where).toEqual({
        userId: 'u1',
        revokedAt: null,
        id: { not: 'current' },
      });
    });
  });
});
