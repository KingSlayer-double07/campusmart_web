import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { EmailCodePurpose, UserRole } from '../generated/prisma/enums';
import {
  blockedByInstitution,
  institutionInactive,
} from '../institutions/institution-access';
import { InstitutionsService } from '../institutions/institutions.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { safeUserSelect } from '../users/user.select';
import type {
  AccessTokenPayload,
  AuthUser,
  ClientMeta,
  SafeUser,
} from './auth-user';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  CODE_TTL_MINUTES,
  EmailCodeError,
  EmailCodesService,
} from './email-codes.service';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so a miss costs as long as a wrong password
const DUMMY_HASH =
  '$2b$12$M6m6d8PqpLSb2jtxtgGlIemI30VNaFcUxQ/RiM2dtI/WScHJUge8G';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly emailCodes: EmailCodesService,
    private readonly mail: MailService,
    private readonly institutions: InstitutionsService,
  ) {}

  // ── Register (D7) ─────────────────────────────────────────────────────────

  async register(dto: RegisterDto, meta: ClientMeta) {
    const institution = await this.institutions.findForEmail(dto.email);
    if (!institution) {
      throw new UnprocessableEntityException({
        code: 'INSTITUTION_NOT_SUPPORTED',
        message: "CampusMart isn't available for your school yet",
      });
    }
    if (!institution.isActive) throw institutionInactive();

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const password = await hash(dto.password, BCRYPT_ROUNDS);
    // D8: a seller account gets role SELLER and an empty SellerProfile (the store)
    const isSeller = dto.accountType === 'SELLER';
    const role = isSeller ? UserRole.SELLER : UserRole.BUYER;

    const { user, session } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password,
          role,
          institutionId: institution.id,
          ...(isSeller && { sellerProfile: { create: {} } }),
        },
        select: safeUserSelect,
      });
      const session = await this.sessions.create(user.id, meta, tx);
      return { user, session };
    });

    // A failed send mustn't fail registration; the user can request another code
    await this.sendCode(user.id, user.email, EmailCodePurpose.VERIFY_EMAIL);

    return {
      user,
      tokens: this.tokens(user, session.sessionId, session.refreshToken),
    };
  }

  // ── Email verification ────────────────────────────────────────────────────

  async verifyEmail(user: AuthUser, code: string): Promise<SafeUser> {
    if (user.emailVerifiedAt) return user;
    await this.emailCodes.consume(user.id, EmailCodePurpose.VERIFY_EMAIL, code);
    return this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
      select: safeUserSelect,
    });
  }

  async resendVerification(user: AuthUser) {
    if (user.emailVerifiedAt) return;
    await this.emailCodes.assertCanSend(user.id, EmailCodePurpose.VERIFY_EMAIL);
    await this.sendCode(user.id, user.email, EmailCodePurpose.VERIFY_EMAIL);
  }

  // ── Login, refresh, logout (D6) ───────────────────────────────────────────

  async login(dto: LoginDto, meta: ClientMeta) {
    const found = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        ...safeUserSelect,
        password: true,
        institution: { select: { isActive: true } },
      },
    });

    const passwordMatches = await compare(
      dto.password,
      found?.password ?? DUMMY_HASH,
    );
    if (!found || !found.password || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { password: _password, institution, ...user } = found;
    this.assertCanSignIn(user);
    if (blockedByInstitution({ role: user.role, institution })) {
      throw institutionInactive();
    }

    const session = await this.sessions.create(user.id, meta);
    return {
      user,
      tokens: this.tokens(user, session.sessionId, session.refreshToken),
    };
  }

  async refresh(
    refreshCookie: unknown,
    meta: ClientMeta,
  ): Promise<IssuedTokens> {
    const rotated = await this.sessions.rotate(refreshCookie, meta);
    const found = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      select: {
        ...safeUserSelect,
        institution: { select: { isActive: true } },
      },
    });
    if (!found || found.isSuspended || !found.isActive) {
      await this.sessions.revokeAll(rotated.userId);
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    const { institution, ...user } = found;
    // A switched-off institution cuts its users off here, within one access-token lifetime
    if (blockedByInstitution({ role: user.role, institution })) {
      await this.sessions.revokeAll(user.id);
      throw institutionInactive();
    }
    return this.tokens(user, rotated.sessionId, rotated.refreshToken);
  }

  async logout(refreshCookie: unknown) {
    await this.sessions.revokeByCookie(refreshCookie);
  }

  // ── Password reset ────────────────────────────────────────────────────────

  // Always succeeds from the caller's point of view, so accounts can't be probed
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isSuspended: true },
    });
    if (!user || user.isSuspended) return;
    const allowed = await this.emailCodes.canSend(
      user.id,
      EmailCodePurpose.RESET_PASSWORD,
    );
    if (!allowed) return;
    await this.sendCode(user.id, user.email, EmailCodePurpose.RESET_PASSWORD);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    // Unknown email and wrong code look the same, so accounts can't be probed
    const invalid = new EmailCodeError({
      code: 'INVALID_CODE',
      message: 'That code is incorrect or has expired',
    });
    if (!user) throw invalid;

    try {
      await this.emailCodes.consume(
        user.id,
        EmailCodePurpose.RESET_PASSWORD,
        dto.code,
      );
    } catch (error) {
      if (error instanceof EmailCodeError) throw invalid;
      throw error;
    }

    const password = await hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { password } });
      await this.sessions.revokeAll(user.id, tx);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertCanSignIn(user: { isSuspended: boolean; isActive: boolean }) {
    if (user.isSuspended) {
      throw new UnauthorizedException('This account has been suspended');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account is inactive');
    }
  }

  private tokens(
    user: { id: string; role: string },
    sessionId: string,
    refreshToken: string,
  ): IssuedTokens {
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: sessionId,
      role: user.role,
    };
    return { accessToken: this.jwt.sign(payload), refreshToken };
  }

  private async sendCode(
    userId: string,
    email: string,
    purpose: EmailCodePurpose,
  ) {
    try {
      const code = await this.emailCodes.issue(userId, purpose);
      await this.mail.send(
        email,
        purpose === EmailCodePurpose.VERIFY_EMAIL
          ? 'verify-email'
          : 'reset-password',
        { code, minutes: CODE_TTL_MINUTES },
      );
    } catch (error) {
      this.logger.error(
        `Could not send ${purpose} code to user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
