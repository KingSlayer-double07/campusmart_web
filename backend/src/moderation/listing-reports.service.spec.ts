import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth-user';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { ListingStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListingReportsService } from './listing-reports.service';

const failure = (error: unknown) => ({
  status: (error as HttpException).getStatus(),
  code: ((error as HttpException).getResponse() as { code?: string }).code,
});

const buyer = { id: 'b1', institutionId: 'i1' } as AuthUser;

describe('ListingReportsService', () => {
  let service: ListingReportsService;
  const prisma = {
    listing: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    supportReport: {
      create: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const notifications = { notify: jest.fn(), alertAdmins: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    prisma.listing.findFirst.mockResolvedValue({
      title: 'Desk lamp',
      sellerId: 's1',
    });
    prisma.supportReport.create.mockResolvedValue({ id: 'r1' });
    prisma.listing.updateMany.mockResolvedValue({ count: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ListingReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(ListingReportsService);
  });

  it('only finds live listings at the reporter’s school', async () => {
    prisma.supportReport.count.mockResolvedValue(1);
    await service.report(buyer, 'l1', { reason: 'SCAM' });
    expect(prisma.listing.findFirst.mock.calls[0][0].where).toEqual({
      id: 'l1',
      institutionId: 'i1',
      isDeleted: false,
      status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
    });
    expect(prisma.supportReport.create).toHaveBeenCalledWith({
      data: {
        userId: 'b1',
        type: 'LISTING',
        reason: 'SCAM',
        message: 'Looks like a scam',
        listingId: 'l1',
      },
      select: { id: true },
    });
  });

  it('refuses a seller reporting their own listing', async () => {
    const error = await service
      .report({ ...buyer, id: 's1' }, 'l1', { reason: 'SCAM' })
      .catch((e: unknown) => e);
    expect(failure(error)).toEqual({ status: 400, code: 'OWN_LISTING' });
  });

  it('answers a second report from the same user with 409 ALREADY_REPORTED', async () => {
    prisma.supportReport.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const error = await service
      .report(buyer, 'l1', { reason: 'SCAM' })
      .catch((e: unknown) => e);
    expect(failure(error)).toEqual({ status: 409, code: 'ALREADY_REPORTED' });
  });

  it.each([1, 4])(
    'leaves the listing alone at %i open reports',
    async (count) => {
      prisma.supportReport.count.mockResolvedValue(count);
      await expect(
        service.report(buyer, 'l1', { reason: 'MISLEADING' }),
      ).resolves.toEqual({ id: 'r1', hidden: false });
      expect(prisma.listing.updateMany).not.toHaveBeenCalled();
      expect(notifications.alertAdmins).not.toHaveBeenCalled();
    },
  );

  it('flags it for review at the fifth report and tells admins once (M4)', async () => {
    prisma.supportReport.count.mockResolvedValue(5);
    await service.report(buyer, 'l1', { reason: 'MISLEADING' });
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', isFlagged: false },
      data: { isFlagged: true },
    });
    expect(notifications.alertAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LISTING_FLAGGED' }),
    );

    // A sixth report finds it already flagged
    notifications.alertAdmins.mockClear();
    prisma.supportReport.count.mockResolvedValue(6);
    prisma.listing.updateMany.mockResolvedValue({ count: 0 });
    await service.report(buyer, 'l1', { reason: 'MISLEADING' });
    expect(notifications.alertAdmins).not.toHaveBeenCalled();
  });

  it('hides it at once for a prohibited-item report, audited, with admins and the seller told (M4b)', async () => {
    prisma.supportReport.count.mockResolvedValue(1);
    await expect(
      service.report(buyer, 'l1', { reason: 'PROHIBITED_ITEM' }),
    ).resolves.toEqual({ id: 'r1', hidden: true });
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'l1',
        status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
      },
      data: {
        isFlagged: true,
        status: ListingStatus.FLAGGED,
        moderationReason: expect.stringContaining('prohibited item'),
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'b1',
        action: 'LISTING_HIDDEN_BY_REPORT',
        entityId: 'l1',
      }),
      prisma,
    );
    expect(notifications.alertAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LISTING_HIDDEN' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ type: 'LISTING_HIDDEN' }),
      { email: false },
    );
  });

  describe('admin reports', () => {
    const report = {
      id: 'r1',
      userId: 'b1',
      type: 'LISTING',
      reason: 'SCAM',
      message: 'Looks like a scam',
      screenshotUrl: null,
      listingId: 'l1',
      status: 'OPEN',
      resolutionNote: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'b1', email: 'tobi@unilag.edu.ng' },
      ]);
      prisma.listing.findMany.mockResolvedValue([
        { id: 'l1', title: 'Desk lamp' },
      ]);
    });

    it('lists open reports oldest first with who reported what, never the reporter id', async () => {
      prisma.supportReport.findMany.mockResolvedValue([report]);
      const page = await service.list({
        status: 'OPEN',
        type: 'LISTING',
        limit: 20,
      });
      const args = prisma.supportReport.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ status: 'OPEN', type: 'LISTING' });
      expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
      expect(page.items[0]).toEqual({
        id: 'r1',
        type: 'LISTING',
        reason: 'SCAM',
        message: 'Looks like a scam',
        screenshotUrl: null,
        listingId: 'l1',
        listingTitle: 'Desk lamp',
        reporterEmail: 'tobi@unilag.edu.ng',
        status: 'OPEN',
        resolutionNote: null,
        createdAt: report.createdAt,
      });
    });

    it('closes an open report with the note and audits it', async () => {
      prisma.supportReport.updateMany.mockResolvedValue({ count: 1 });
      prisma.supportReport.findUniqueOrThrow.mockResolvedValue(report);
      await service.update(
        'r1',
        { status: 'CLOSED', note: 'Seller warned' },
        'admin',
      );
      expect(prisma.supportReport.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'OPEN' },
        data: expect.objectContaining({
          status: 'CLOSED',
          resolvedById: 'admin',
          resolutionNote: 'Seller warned',
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REPORT_CLOSED',
          meta: { note: 'Seller warned' },
        }),
        prisma,
      );
    });

    it('answers 409 for a report already closed and 404 for an unknown one', async () => {
      prisma.supportReport.updateMany.mockResolvedValue({ count: 0 });
      prisma.supportReport.count.mockResolvedValue(1);
      const error = await service
        .update('r1', { status: 'CLOSED', note: 'Again' }, 'admin')
        .catch((e: unknown) => e);
      expect(failure(error).status).toBe(409);
      prisma.supportReport.count.mockResolvedValue(0);
      const missing = await service
        .update('r1', { status: 'OPEN' }, 'admin')
        .catch((e: unknown) => e);
      expect(failure(missing).status).toBe(404);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
