import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { randomInt } from 'crypto';
import { EmailCodePurpose } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
// Sending limits per user and purpose: at most 1 a minute and 5 an hour (guide 1.4 table)
const SEND_LIMITS = [
  { windowMs: 60_000, max: 1 },
  { windowMs: 60 * 60_000, max: 5 },
];

export class EmailCodeError extends BadRequestException {}

@Injectable()
export class EmailCodesService {
  constructor(private readonly prisma: PrismaService) {}

  // Creates a fresh 6-digit code and invalidates older unused ones. Returns the plaintext code,
  // which only ever goes into the email.
  async issue(userId: string, purpose: EmailCodePurpose): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hash(code, 10);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.emailCode.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.emailCode.create({
        data: {
          userId,
          purpose,
          codeHash,
          expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
        },
      }),
    ]);
    return code;
  }

  // Throws 429 RATE_LIMITED when another code would break the sending limits
  async assertCanSend(userId: string, purpose: EmailCodePurpose) {
    const now = Date.now();
    for (const { windowMs, max } of SEND_LIMITS) {
      const recent = await this.prisma.emailCode.findMany({
        where: { userId, purpose, createdAt: { gt: new Date(now - windowMs) } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
        take: max,
      });
      if (recent.length >= max) {
        const retryAfterSeconds = Math.ceil(
          (recent[0].createdAt.getTime() + windowMs - now) / 1000,
        );
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            message: `Please wait ${retryAfterSeconds} seconds before requesting another code`,
            details: { retryAfterSeconds },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  async canSend(userId: string, purpose: EmailCodePurpose) {
    try {
      await this.assertCanSend(userId, purpose);
      return true;
    } catch {
      return false;
    }
  }

  // Checks and burns the latest code. Each attempt is reserved atomically before comparing, so
  // parallel guesses can't exceed CODE_MAX_ATTEMPTS. After 5 wrong attempts the code is locked.
  async consume(userId: string, purpose: EmailCodePurpose, code: string) {
    const emailCode = await this.prisma.emailCode.findFirst({
      where: { userId, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true, expiresAt: true, attempts: true },
    });

    if (!emailCode || emailCode.expiresAt <= new Date()) {
      throw new EmailCodeError({
        code: 'CODE_EXPIRED',
        message: 'This code has expired. Request a new one.',
      });
    }

    const reserved = await this.prisma.emailCode.updateMany({
      where: {
        id: emailCode.id,
        usedAt: null,
        attempts: { lt: CODE_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0) throw lockedError();

    if (!(await compare(code, emailCode.codeHash))) {
      const attemptsLeft = Math.max(
        0,
        CODE_MAX_ATTEMPTS - (emailCode.attempts + 1),
      );
      if (attemptsLeft === 0) throw lockedError();
      throw new EmailCodeError({
        code: 'INVALID_CODE',
        message: 'That code is incorrect',
        details: { attemptsLeft },
      });
    }

    // Single use
    const burned = await this.prisma.emailCode.updateMany({
      where: { id: emailCode.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (burned.count === 0) {
      throw new EmailCodeError({
        code: 'CODE_EXPIRED',
        message: 'This code has already been used. Request a new one.',
      });
    }
  }
}

function lockedError() {
  return new EmailCodeError({
    code: 'CODE_LOCKED',
    message: 'Too many wrong attempts. Request a new code.',
  });
}
