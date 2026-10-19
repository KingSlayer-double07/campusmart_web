import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { ListingStatus, UserRole } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { AdminUsersService } from './admin-users.service';
import { SuspensionService } from './suspension.service';

const failure = (error: unknown) => ({
  status: (error as HttpException).getStatus(),
  code: ((error as HttpException).getResponse() as { code?: string }).code,
});

const userRow = {
  id: 'u1',
  email: 'tobi@unilag.edu.ng',
  firstName: 'Tobi',
  lastName: null,
  role: UserRole.BUYER,
  verificationStatus: 'UNVERIFIED',
  emailVerifiedAt: new Date(),
  isActive: true,
  isSuspended: false,
  suspendedAt: null,
  suspendedReason: null,
  createdAt: new Date(),
  institution: { name: 'University of Lagos' },
};

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  const prisma = {
    user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    sellerProfile: { upsert: jest.fn() },
    listing: { updateMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const sessions = { revokeAll: jest.fn() };
  const notifications = { notify: jest.fn() };
  const suspension = { suspend: jest.fn(), unsuspend: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    prisma.$queryRaw.mockResolvedValue([{ id: 'admin' }]);
    prisma.listing.updateMany.mockResolvedValue({ count: 2 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SessionsService, useValue: sessions },
        { provide: NotificationsService, useValue: notifications },
        { provide: SuspensionService, useValue: suspension },
      ],
    }).compile();
    service = moduleRef.get(AdminUsersService);
  });

  // The first lookup is the target's current role; the second is the reply
  const target = (role: UserRole, institutionId: string | null = 'i1') => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ role, institutionId })
      .mockResolvedValueOnce({ ...userRow, role });
  };

  it('searches email and names, newest first, and names each user', async () => {
    prisma.user.findMany.mockResolvedValue([userRow]);
    const page = await service.list({ q: 'tobi', suspended: true, limit: 20 });
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      isSuspended: true,
      OR: [
        { email: { contains: 'tobi', mode: 'insensitive' } },
        { firstName: { contains: 'tobi', mode: 'insensitive' } },
        { lastName: { contains: 'tobi', mode: 'insensitive' } },
      ],
    });
    expect(page.items[0]).toMatchObject({
      name: 'Tobi',
      institutionName: 'University of Lagos',
      emailVerified: true,
    });
    expect(page.items[0]).not.toHaveProperty('password');
  });

  it('makes a buyer an admin (M1): signed out, audited and told', async () => {
    target(UserRole.BUYER);
    await service.setRole('u1', { role: UserRole.ADMIN }, 'admin');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: UserRole.ADMIN },
    });
    expect(sessions.revokeAll).toHaveBeenCalledWith('u1', prisma);
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin',
        action: 'ROLE_CHANGED',
        meta: { from: UserRole.BUYER, to: UserRole.ADMIN, archivedListings: 0 },
      }),
      prisma,
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: 'ROLE_CHANGED' }),
      { email: false },
    );
  });

  it('opens a store for a new seller, and archives the listings of one who stops', async () => {
    target(UserRole.BUYER);
    await service.setRole('u1', { role: UserRole.SELLER }, 'admin');
    expect(prisma.sellerProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1' },
      update: {},
    });

    jest.clearAllMocks();
    target(UserRole.SELLER);
    await service.setRole('u1', { role: UserRole.BUYER }, 'admin');
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: {
        sellerId: 'u1',
        isDeleted: false,
        status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
      },
      data: { status: ListingStatus.ARCHIVED },
    });
  });

  it('does nothing when the role is unchanged', async () => {
    target(UserRole.SELLER);
    await service.setRole('u1', { role: UserRole.SELLER }, 'admin');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it.each([
    ['your own role', 'admin', UserRole.BUYER, 'CANNOT_CHANGE_ROLE'],
    ['a rider', 'u1', UserRole.DISPATCH, 'CANNOT_CHANGE_ROLE'],
    ['a pickup agent', 'u1', UserRole.PICKUP_AGENT, 'CANNOT_CHANGE_ROLE'],
  ])('refuses to change %s', async (_label, id, current, code) => {
    target(current);
    const error = await service
      .setRole(id, { role: UserRole.BUYER }, 'admin')
      .catch((e: unknown) => e);
    expect(failure(error)).toEqual({ status: 400, code });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('needs a school to make someone a seller', async () => {
    target(UserRole.BUYER, null);
    const error = await service
      .setRole('u1', { role: UserRole.SELLER }, 'admin')
      .catch((e: unknown) => e);
    expect(failure(error)).toEqual({ status: 400, code: 'NO_INSTITUTION' });
  });

  it('refuses an admin who lost the role meanwhile, so two admins can’t remove each other', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'u1' }]);
    target(UserRole.ADMIN);
    const error = await service
      .setRole('u1', { role: UserRole.BUYER }, 'admin')
      .catch((e: unknown) => e);
    expect(failure(error).status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
