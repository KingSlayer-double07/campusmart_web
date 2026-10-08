import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { safeUserSelect } from './user.select';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const sessions = { revokeOthers: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: SessionsService, useValue: sessions },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('safeUserSelect', () => {
    it('never selects secrets', () => {
      expect(safeUserSelect).not.toHaveProperty('password');
      expect(safeUserSelect).not.toHaveProperty('passwordResetToken');
      expect(safeUserSelect).not.toHaveProperty('googleId');
    });
  });

  describe('updateProfile', () => {
    it('returns only the safe user shape', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({ id: 'u1' });
      await service.updateProfile('u1', { firstName: 'Ada' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ select: safeUserSelect }),
      );
    });

    it('never writes the email or institution', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await service.updateProfile('u1', {
        firstName: 'Ada',
        email: 'x@y.z',
        institutionId: 'i2',
      } as never);
      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('email');
      expect(data).not.toHaveProperty('institutionId');
    });
  });

  describe('getPublicProfile', () => {
    it('does not select the email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await service.getPublicProfile('u1');
      const { select } = prisma.user.findUnique.mock.calls[0][0];
      expect(select).not.toHaveProperty('email');
      expect(select).not.toHaveProperty('password');
    });
  });

  describe('changePassword', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        password: await hash('OldPass123', 4),
      });
    });

    it('rejects a wrong current password with 401', async () => {
      await expect(
        service.changePassword('u1', 's1', {
          currentPassword: 'WrongPass1',
          newPassword: 'NewPass123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sessions.revokeOthers).not.toHaveBeenCalled();
    });

    it('rejects a new password equal to the current one with 400', async () => {
      await expect(
        service.changePassword('u1', 's1', {
          currentPassword: 'OldPass123',
          newPassword: 'OldPass123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stores a new hash and signs out every other session', async () => {
      await service.changePassword('u1', 's1', {
        currentPassword: 'OldPass123',
        newPassword: 'NewPass123',
      });
      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data.password).toEqual(expect.stringMatching(/^\$2[aby]\$/));
      expect(data.password).not.toBe('NewPass123');
      expect(sessions.revokeOthers).toHaveBeenCalledWith('u1', 's1', prisma);
    });
  });
});
