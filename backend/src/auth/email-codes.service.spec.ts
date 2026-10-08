import { HttpException } from '@nestjs/common';
import { hash } from 'bcrypt';
import { EmailCodePurpose } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  CODE_MAX_ATTEMPTS,
  EmailCodeError,
  EmailCodesService,
} from './email-codes.service';

const P = EmailCodePurpose.VERIFY_EMAIL;

async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpException).getResponse() as { code: string }).code;
  }
  throw new Error('expected a rejection');
}

describe('EmailCodesService', () => {
  const prisma = {
    emailCode: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new EmailCodesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );
  });

  describe('issue', () => {
    it('creates a 6-digit code stored only as a bcrypt hash, expiring in 10 minutes', async () => {
      const code = await service.issue('u1', P);
      expect(code).toMatch(/^\d{6}$/);
      const { data } = prisma.emailCode.create.mock.calls[0][0];
      expect(data.codeHash).toMatch(/^\$2[aby]\$/);
      expect(data.codeHash).not.toContain(code);
      const minutes = (data.expiresAt.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(9.9);
      expect(minutes).toBeLessThanOrEqual(10);
    });

    it('invalidates older unused codes of the same purpose', async () => {
      await service.issue('u1', P);
      expect(prisma.emailCode.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', purpose: P, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });
  });

  describe('consume', () => {
    let codeHash: string;
    beforeAll(async () => {
      codeHash = await hash('123456', 4);
    });

    const latest = (attempts = 0, expiresInMs = 60_000) => ({
      id: 'c1',
      codeHash,
      attempts,
      expiresAt: new Date(Date.now() + expiresInMs),
    });

    it('accepts the right code once and burns it', async () => {
      prisma.emailCode.findFirst.mockResolvedValue(latest());
      prisma.emailCode.updateMany.mockResolvedValue({ count: 1 });
      await service.consume('u1', P, '123456');
      expect(prisma.emailCode.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'c1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('rejects a wrong code with INVALID_CODE and the attempts left', async () => {
      prisma.emailCode.findFirst.mockResolvedValue(latest(1));
      prisma.emailCode.updateMany.mockResolvedValue({ count: 1 });
      const promise = service.consume('u1', P, '000000');
      await expect(promise).rejects.toBeInstanceOf(EmailCodeError);
      await promise.catch((e: EmailCodeError) =>
        expect(e.getResponse()).toMatchObject({
          code: 'INVALID_CODE',
          details: { attemptsLeft: 3 },
        }),
      );
    });

    it('locks the code on the 5th wrong attempt', async () => {
      prisma.emailCode.findFirst.mockResolvedValue(
        latest(CODE_MAX_ATTEMPTS - 1),
      );
      prisma.emailCode.updateMany.mockResolvedValue({ count: 1 });
      expect(await errorCode(service.consume('u1', P, '000000'))).toBe(
        'CODE_LOCKED',
      );
    });

    it('refuses even the right code once 5 attempts are used', async () => {
      prisma.emailCode.findFirst.mockResolvedValue(latest(CODE_MAX_ATTEMPTS));
      prisma.emailCode.updateMany.mockResolvedValue({ count: 0 }); // reservation fails
      expect(await errorCode(service.consume('u1', P, '123456'))).toBe(
        'CODE_LOCKED',
      );
    });

    it('reserves the attempt atomically before comparing', async () => {
      prisma.emailCode.findFirst.mockResolvedValue(latest());
      prisma.emailCode.updateMany.mockResolvedValue({ count: 1 });
      await service.consume('u1', P, '123456');
      expect(prisma.emailCode.updateMany.mock.calls[0][0]).toEqual({
        where: { id: 'c1', usedAt: null, attempts: { lt: CODE_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
    });

    it('rejects an expired code', async () => {
      prisma.emailCode.findFirst.mockResolvedValue(latest(0, -1));
      expect(await errorCode(service.consume('u1', P, '123456'))).toBe(
        'CODE_EXPIRED',
      );
    });

    it('rejects when there is no unused code', async () => {
      prisma.emailCode.findFirst.mockResolvedValue(null);
      expect(await errorCode(service.consume('u1', P, '123456'))).toBe(
        'CODE_EXPIRED',
      );
    });

    it('is single-use when two correct submissions race', async () => {
      prisma.emailCode.findFirst.mockResolvedValue(latest());
      prisma.emailCode.updateMany
        .mockResolvedValueOnce({ count: 1 }) // attempt reserved
        .mockResolvedValueOnce({ count: 0 }); // someone else burned it first
      expect(await errorCode(service.consume('u1', P, '123456'))).toBe(
        'CODE_EXPIRED',
      );
    });
  });

  describe('assertCanSend', () => {
    it('allows a send when nothing was sent recently', async () => {
      prisma.emailCode.findMany.mockResolvedValue([]);
      await expect(service.assertCanSend('u1', P)).resolves.toBeUndefined();
    });

    it('allows at most 1 a minute', async () => {
      prisma.emailCode.findMany.mockResolvedValueOnce([
        { createdAt: new Date(Date.now() - 20_000) },
      ]);
      const error = await service
        .assertCanSend('u1', P)
        .catch((e: HttpException) => e);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'RATE_LIMITED',
        details: { retryAfterSeconds: 40 },
      });
    });

    it('allows at most 5 an hour', async () => {
      const fiveInTheHour = Array.from({ length: 5 }, (_, i) => ({
        createdAt: new Date(Date.now() - (50 - i) * 60_000),
      }));
      prisma.emailCode.findMany
        .mockResolvedValueOnce([]) // nothing in the last minute
        .mockResolvedValueOnce(fiveInTheHour);
      const error = await service
        .assertCanSend('u1', P)
        .catch((e: HttpException) => e);
      expect((error as HttpException).getStatus()).toBe(429);
    });
  });
});
