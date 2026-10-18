import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
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
import { inviteTokenHash } from '../riders/invite-token';
import { SessionsService } from '../sessions/sessions.service';
import { safeUserSelect } from '../users/user.select';
import type {
  AccessTokenPayload,
  AuthUser,
  ClientMeta,
  SafeUser,
} from './auth-user';
import { AcceptInviteDto } from './dto/accept-invite.dto';
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
        suspendedReason: true,
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
    const {
      password: _password,
      institution,
      suspendedReason,
      ...user
    } = found;
    this.assertCanSignIn({ ...user, suspendedReason });
    if (blockedByInstitution({ role: user.role, institution })) {
      throw institutionInactive();
    }
    if (user.role === UserRole.ADMIN) await this.adminCode(user, dto.code);

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
        suspendedReason: true,
        institution: { select: { isActive: true } },
      },
    });
    if (!found || found.isSuspended || !found.isActive) {
      await this.sessions.revokeAll(rotated.userId);
      if (found?.isSuspended) throw accountSuspended(found.suspendedReason);
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    const { institution, suspendedReason: _reason, ...user } = found;
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

  // ── Rider invites (DX1) ───────────────────────────────────────────────────

  async inviteInfo(token: string) {
    const invite = await this.findInvite(token);
    if (!invite) throw new NotFoundException(invalidInvite);
    return {
      email: invite.user.email,
      firstName: invite.user.firstName,
      institutionName: invite.user.institution?.name ?? '',
    };
  }

  // Sets the password, confirms the email (the link reached it) and signs the rider in
  async acceptInvite(dto: AcceptInviteDto, meta: ClientMeta) {
    const invite = await this.findInvite(dto.token);
    if (!invite) throw new BadRequestException(invalidInvite);
    if (blockedByInstitution(invite.user)) throw institutionInactive();
    const password = await hash(dto.password, BCRYPT_ROUNDS);
    const now = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException(invalidInvite);
      return tx.user.update({
        where: { id: invite.userId },
        data: { password, emailVerifiedAt: now },
        select: safeUserSelect,
      });
    });
    const session = await this.sessions.create(user.id, meta);
    return {
      user,
      tokens: this.tokens(user, session.sessionId, session.refreshToken),
    };
  }

  // A usable invite: unused, unexpired, for an active rider who hasn't set a password yet
  private async findInvite(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: inviteTokenHash(token) },
      select: {
        id: true,
        userId: true,
        usedAt: true,
        expiresAt: true,
        user: {
          select: {
            email: true,
            firstName: true,
            role: true,
            password: true,
            isActive: true,
            isSuspended: true,
            institution: { select: { name: true, isActive: true } },
          },
        },
      },
    });
    if (
      !invite ||
      invite.usedAt ||
      invite.expiresAt <= new Date() ||
      invite.user.role !== UserRole.DISPATCH ||
      invite.user.password ||
      !invite.user.isActive ||
      invite.user.isSuspended
    ) {
      return null;
    }
    return invite;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Decision M7: an admin's right password emails a code; the sign-in finishes with it
  private async adminCode(user: { id: string; email: string }, code?: string) {
    if (code) {
      try {
        await this.emailCodes.consume(
          user.id,
          EmailCodePurpose.ADMIN_SIGN_IN,
          code,
        );
        return;
      } catch (error) {
        // Wrong, expired or locked: a 401 like a wrong password, with the code's reason
        if (error instanceof EmailCodeError) {
          throw new UnauthorizedException(error.getResponse());
        }
        throw error;
      }
    }
    const sent = await this.emailCodes.canSend(
      user.id,
      EmailCodePurpose.ADMIN_SIGN_IN,
    );
    if (sent) {
      await this.sendCode(user.id, user.email, EmailCodePurpose.ADMIN_SIGN_IN);
    }
    throw new UnauthorizedException({
      code: 'ADMIN_CODE_REQUIRED',
      message: sent
        ? `We emailed you a 6-digit code. Enter it to finish signing in. It expires in ${CODE_TTL_MINUTES} minutes.`
        : 'We sent you a code a moment ago. Enter the latest one from your email.',
      details: { codeSent: sent },
    });
  }

  private assertCanSignIn(user: {
    isSuspended: boolean;
    isActive: boolean;
    suspendedReason?: string | null;
  }) {
    if (user.isSuspended) throw accountSuspended(user.suspendedReason ?? null);
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
      await this.mail.send(email, CODE_TEMPLATES[purpose], {
        code,
        minutes: CODE_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(
        `Could not send ${purpose} code to user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

const CODE_TEMPLATES = {
  VERIFY_EMAIL: 'verify-email',
  RESET_PASSWORD: 'reset-password',
  ADMIN_SIGN_IN: 'admin-sign-in',
} as const satisfies Record<EmailCodePurpose, string>;

// Decision M6: a suspended user sees the admin's reason
export function accountSuspended(reason: string | null) {
  return new UnauthorizedException({
    code: 'ACCOUNT_SUSPENDED',
    message: reason
      ? `Your account is suspended: ${reason}. Contact CampusMart support if you think this is a mistake.`
      : 'Your account is suspended. Contact CampusMart support if you think this is a mistake.',
    details: { reason },
  });
}

const invalidInvite = {
  code: 'INVALID_INVITE',
  message:
    'This invite link has expired or was already used. Ask an admin to send a new one.',
};
