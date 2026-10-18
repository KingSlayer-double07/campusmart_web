import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { ListingStatus, UserRole } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { SuspensionService } from './suspension.service';

const failure = (error: unknown) => ({
  status: (error as HttpException).getStatus(),
  code: ((error as HttpException).getResponse() as { code?: string }).code,
});

describe('SuspensionService', () => {
  let service: SuspensionService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    listing: { updateMany: jest.fn() },
    moderationAction: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const sessions = { revokeAll: jest.fn() };
  const notifications = { notify: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.listing.updateMany.mockResolvedValue({ count: 2 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        SuspensionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SessionsService, useValue: sessions },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(SuspensionService);
  });

  describe('suspend', () => {
    it('signs the user out everywhere, archives live listings and records why (guide 9.1 rule 1)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: UserRole.SELLER,
      });
      await service.suspend('u1', 'Sold fake phones', 'admin');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', isSuspended: false },
        data: expect.objectContaining({
          isSuspended: true,
          suspendedReason: 'Sold fake phones',
          suspendedById: 'admin',
          suspendedAt: expect.any(Date),
        }),
      });
      expect(sessions.revokeAll).toHaveBeenCalledWith('u1', prisma);
      expect(prisma.listing.updateMany).toHaveBeenCalledWith({
        where: {
          sellerId: 'u1',
          isDeleted: false,
          status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
        },
        data: { status: ListingStatus.ARCHIVED },
      });
      expect(prisma.moderationAction.create).toHaveBeenCalledWith({
        data: {
          type: 'SUSPEND_USER',
          reason: 'Sold fake phones',
          targetUserId: 'u1',
          moderatorId: 'admin',
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        {
          actorId: 'admin',
          action: 'USER_SUSPENDED',
          entityType: 'User',
          entityId: 'u1',
          meta: {
            reason: 'Sold fake phones',
            archivedListings: 2,
            automatic: false,
          },
        },
        prisma,
      );
    });

    it.each([
      ['yourself', { id: 'admin', role: UserRole.ADMIN }],
      ['another admin', { id: 'u2', role: UserRole.ADMIN }],
    ])('refuses to suspend %s', async (_label, target) => {
      prisma.user.findUnique.mockResolvedValue(target);
      const error = await service
        .suspend(target.id, 'Testing', 'admin')
        .catch((e: unknown) => e);
      expect(failure(error)).toEqual({ status: 400, code: 'CANNOT_SUSPEND' });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('answers 409 when someone suspended them first, and changes nothing else', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: UserRole.BUYER,
      });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      const error = await service
        .suspend('u1', 'Testing', 'admin')
        .catch((e: unknown) => e);
      expect(failure(error)).toEqual({
        status: 409,
        code: 'ALREADY_SUSPENDED',
      });
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const error = await service
        .suspend('nope', 'Testing', 'admin')
        .catch((e: unknown) => e);
      expect(failure(error).status).toBe(404);
    });
  });

  describe('suspendForProhibitedItem (M4d, M4e)', () => {
    it('suspends the seller with the listing named, marked automatic', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        role: UserRole.SELLER,
        isSuspended: false,
      });
      await expect(
        service.suspendForProhibitedItem(
          prisma as never,
          's1',
          'Codeine syrup',
          'admin',
        ),
      ).resolves.toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            reason: 'Listed a prohibited item: "Codeine syrup"',
            automatic: true,
          }),
        }),
        prisma,
      );
    });

    it.each([
      ['already suspended', { role: UserRole.SELLER, isSuspended: true }],
      ['an admin', { role: UserRole.ADMIN, isSuspended: false }],
    ])('leaves a seller who is %s alone', async (_label, seller) => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(seller);
      await expect(
        service.suspendForProhibitedItem(prisma as never, 's1', 'X', 'admin'),
      ).resolves.toBe(false);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('unsuspend', () => {
    it('clears the suspension, audits it and tells the user in the app', async () => {
      await service.unsuspend('u1', 'admin');
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', isSuspended: true },
        data: {
          isSuspended: false,
          suspendedAt: null,
          suspendedReason: null,
          suspendedById: null,
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_UNSUSPENDED', entityId: 'u1' }),
        prisma,
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ type: 'ACCOUNT_UNSUSPENDED' }),
        { email: false },
      );
    });

    it('answers 409 when they aren’t suspended and 404 when they don’t exist', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      prisma.user.count.mockResolvedValue(1);
      expect(
        failure(await service.unsuspend('u1', 'admin').catch((e) => e)),
      ).toEqual({ status: 409, code: 'NOT_SUSPENDED' });
      prisma.user.count.mockResolvedValue(0);
      expect(
        failure(await service.unsuspend('u1', 'admin').catch((e) => e)).status,
      ).toBe(404);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
