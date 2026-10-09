import {
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import { EmailCodePurpose, UserRole } from '../generated/prisma/enums';
import { InstitutionsService } from '../institutions/institutions.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuthService } from './auth.service';
import { EmailCodeError, EmailCodesService } from './email-codes.service';

const responseCode = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const sessions = {
    create: jest.fn(),
    rotate: jest.fn(),
    revokeAll: jest.fn(),
    revokeByCookie: jest.fn(),
  };
  const emailCodes = {
    issue: jest.fn(),
    consume: jest.fn(),
    assertCanSend: jest.fn(),
    canSend: jest.fn(),
  };
  const mail = { send: jest.fn() };
  const institutions = { findForEmail: jest.fn() };
  const jwt = { sign: jest.fn() };

  const user = {
    id: 'u1',
    email: 'ada@students.unilag.edu.ng',
    role: UserRole.BUYER,
    isSuspended: false,
    isActive: true,
    emailVerifiedAt: null,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    sessions.create.mockResolvedValue({
      sessionId: 's1',
      refreshToken: 's1.token',
    });
    jwt.sign.mockReturnValue('jwt');
    emailCodes.issue.mockResolvedValue('123456');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: SessionsService, useValue: sessions },
        { provide: EmailCodesService, useValue: emailCodes },
        { provide: MailService, useValue: mail },
        { provide: InstitutionsService, useValue: institutions },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    const dto = {
      email: 'ada@students.unilag.edu.ng',
      password: 'Campus2026',
      accountType: 'BUYER' as const,
    };

    it('returns 422 INSTITUTION_NOT_SUPPORTED for a non-school domain', async () => {
      institutions.findForEmail.mockResolvedValue(null);
      const error = await service
        .register({ ...dto, email: 'ada@gmail.com' }, {})
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(422);
      expect(responseCode(error)).toBe('INSTITUTION_NOT_SUPPORTED');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('takes the institution from the email domain, never from the client', async () => {
      institutions.findForEmail.mockResolvedValue({ id: 'unilag' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      await service.register(dto, {});
      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data.institutionId).toBe('unilag');
      expect(data.role).toBe(UserRole.BUYER);
      expect(data.password).toMatch(/^\$2[aby]\$/);
      expect(data.sellerProfile).toBeUndefined();
    });

    it('gives a seller account the SELLER role and an empty SellerProfile', async () => {
      institutions.findForEmail.mockResolvedValue({ id: 'unilag' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...user, role: UserRole.SELLER });

      await service.register({ ...dto, accountType: 'SELLER' }, {});
      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data.role).toBe(UserRole.SELLER);
      expect(data.sellerProfile).toEqual({ create: {} });
    });

    it('emails a verification code and issues a session with {sub, sid, role}', async () => {
      institutions.findForEmail.mockResolvedValue({ id: 'unilag' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      const { tokens } = await service.register(dto, {});
      expect(emailCodes.issue).toHaveBeenCalledWith(
        'u1',
        EmailCodePurpose.VERIFY_EMAIL,
      );
      expect(mail.send).toHaveBeenCalledWith(user.email, 'verify-email', {
        code: '123456',
        minutes: 10,
      });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'u1',
        sid: 's1',
        role: UserRole.BUYER,
      });
      expect(tokens).toEqual({ accessToken: 'jwt', refreshToken: 's1.token' });
    });

    it('still registers when the email fails to send', async () => {
      institutions.findForEmail.mockResolvedValue({ id: 'unilag' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);
      mail.send.mockRejectedValue(new Error('SMTP down'));
      jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await expect(service.register(dto, {})).resolves.toMatchObject({
        user,
      });
    });

    it('rejects an email that is already registered with 409', async () => {
      institutions.findForEmail.mockResolvedValue({ id: 'unilag' });
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.register(dto, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('rejects an unknown email with 401', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@unilag.edu.ng', password: 'Campus2026' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password with 401', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        password: await hash('Campus2026', 4),
      });
      await expect(
        service.login({ email: user.email, password: 'Wrong2026x' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('rejects a suspended account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        isSuspended: true,
        password: await hash('Campus2026', 4),
      });
      await expect(
        service.login({ email: user.email, password: 'Campus2026' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('never returns the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        password: await hash('Campus2026', 4),
      });
      const result = await service.login(
        { email: user.email, password: 'Campus2026' },
        {},
      );
      expect(result.user).not.toHaveProperty('password');
    });
  });

  describe('refresh', () => {
    it('signs out a user suspended since the last refresh', async () => {
      sessions.rotate.mockResolvedValue({
        userId: 'u1',
        sessionId: 's1',
        refreshToken: 's1.new',
      });
      prisma.user.findUnique.mockResolvedValue({ ...user, isSuspended: true });
      await expect(service.refresh('s1.old', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.revokeAll).toHaveBeenCalledWith('u1');
    });
  });

  describe('forgotPassword', () => {
    it('does nothing for an unknown email (and does not throw)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.forgotPassword('ghost@unilag.edu.ng'),
      ).resolves.toBeUndefined();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('emails a reset code to a known user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: user.email,
        isSuspended: false,
      });
      emailCodes.canSend.mockResolvedValue(true);
      await service.forgotPassword(user.email);
      expect(mail.send).toHaveBeenCalledWith(user.email, 'reset-password', {
        code: '123456',
        minutes: 10,
      });
    });
  });

  describe('resetPassword', () => {
    const dto = {
      email: user.email,
      code: '123456',
      newPassword: 'NewCampus2026',
    };

    it('answers an unknown email exactly like a wrong code', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = await service.resetPassword(dto).catch((e) => e);

      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      emailCodes.consume.mockRejectedValue(
        new EmailCodeError({ code: 'CODE_LOCKED', message: 'locked' }),
      );
      const wrong = await service.resetPassword(dto).catch((e) => e);

      expect((unknown as HttpException).getResponse()).toEqual(
        (wrong as HttpException).getResponse(),
      );
      expect(responseCode(unknown)).toBe('INVALID_CODE');
    });

    it('sets the new password and revokes every session', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await service.resetPassword(dto);
      expect(prisma.user.update.mock.calls[0][0].data.password).toMatch(
        /^\$2[aby]\$/,
      );
      expect(sessions.revokeAll).toHaveBeenCalledWith('u1', prisma);
    });
  });
});
