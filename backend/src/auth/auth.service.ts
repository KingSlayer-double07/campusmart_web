import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../generated/prisma/enums';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterUserDto } from './dto/register-user.dto';
// TODO(resend): Uncomment with src/mail/mail.service.ts once Resend is set up.
// import { BadRequestException, Logger } from '@nestjs/common';
// import { randomInt } from 'crypto';
// import { EmailCodePurpose } from '../generated/prisma/enums';
// import { PrismaService } from '../prisma/prisma.service';
// import { MailService } from '../mail/mail.service';
//
// const VERIFICATION_CODE_TTL_MINUTES = 10;
// const VERIFICATION_CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  // private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    // private readonly prisma: PrismaService,
    // private readonly mailService: MailService,
  ) {}

  // Called by LocalStrategy — validates credentials without issuing a token
  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.password) {
      return null;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return null;
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('This account has been suspended');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account is inactive');
    }

    // Strip password before returning — this becomes req.user in the controller
    const { password: _pw, ...safeUser } = user;
    return safeUser;
  }

  // Shared token-signing logic used after both registration and login
  signToken(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    return this.jwtService.sign(payload);
  }

  async registerUser(dto: RegisterUserDto) {
    const user = await this.usersService.create({
      ...dto,
    });

    // TODO(resend): A failed send shouldn't fail registration — the user can request a new code.
    // await this.sendVerificationCode(user.id, user.email).catch((err) =>
    //   this.logger.error(`Could not send verification code to ${user.email}: ${err.message}`),
    // );

    const token = this.signToken(user.id, user.email, user.role);
    return { user, token };
  }

  // ── Email verification ────────────────────────────────────────────────────
  // TODO(resend): Disabled until Resend is set up — see src/mail/mail.service.ts.

  // // Issues a fresh 6-digit code, invalidating any earlier unused ones
  // async sendVerificationCode(userId: string, email: string) {
  //   const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  //   const codeHash = await bcrypt.hash(code, 10);
  //   const now = new Date();
  //
  //   await this.prisma.$transaction([
  //     this.prisma.emailCode.updateMany({
  //       where: { userId, purpose: EmailCodePurpose.VERIFY_EMAIL, usedAt: null },
  //       data: { usedAt: now },
  //     }),
  //     this.prisma.emailCode.create({
  //       data: {
  //         userId,
  //         purpose: EmailCodePurpose.VERIFY_EMAIL,
  //         codeHash,
  //         expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MINUTES * 60_000),
  //       },
  //     }),
  //   ]);
  //
  //   await this.mailService.sendVerificationCode(email, code, VERIFICATION_CODE_TTL_MINUTES);
  // }
  //
  // async resendVerificationCode(userId: string) {
  //   const user = await this.prisma.user.findUnique({
  //     where: { id: userId },
  //     select: { email: true, emailVerifiedAt: true },
  //   });
  //
  //   if (!user) {
  //     throw new UnauthorizedException();
  //   }
  //
  //   if (user.emailVerifiedAt) {
  //     throw new BadRequestException('Email is already verified');
  //   }
  //
  //   await this.sendVerificationCode(userId, user.email);
  // }
  //
  // async verifyEmail(userId: string, code: string) {
  //   const emailCode = await this.prisma.emailCode.findFirst({
  //     where: {
  //       userId,
  //       purpose: EmailCodePurpose.VERIFY_EMAIL,
  //       usedAt: null,
  //       expiresAt: { gt: new Date() },
  //     },
  //     orderBy: { createdAt: 'desc' },
  //   });
  //
  //   if (!emailCode || emailCode.attempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
  //     throw new BadRequestException('Verification code is invalid or has expired. Request a new one.');
  //   }
  //
  //   const codeMatches = await bcrypt.compare(code, emailCode.codeHash);
  //
  //   if (!codeMatches) {
  //     await this.prisma.emailCode.update({
  //       where: { id: emailCode.id },
  //       data: { attempts: { increment: 1 } },
  //     });
  //     throw new BadRequestException('Incorrect verification code');
  //   }
  //
  //   const now = new Date();
  //   await this.prisma.$transaction([
  //     this.prisma.emailCode.update({ where: { id: emailCode.id }, data: { usedAt: now } }),
  //     this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } }),
  //   ]);
  // }

  // Called after LocalStrategy has already validated credentials
  async login(user: any) {
    const token = this.signToken(user.id, user.email, user.role);
    return { user, token };
  }
}