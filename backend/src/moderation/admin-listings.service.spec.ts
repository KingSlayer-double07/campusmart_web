import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { ListingStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminListingsService } from './admin-listings.service';
import { SuspensionService } from './suspension.service';

const failure = (error: unknown) => ({
  status: (error as HttpException).getStatus(),
  code: ((error as HttpException).getResponse() as { code?: string }).code,
});

const current = (overrides: object = {}) => ({
  title: 'Replica watch',
  stock: 3,
  status: ListingStatus.FLAGGED,
  sellerId: 's1',
  wentLiveAt: null as Date | null,
  isFlagged: false,
  heldAt: new Date('2026-10-18T09:00:00Z') as Date | null,
  seller: { isSuspended: false },
  ...overrides,
});

const row = {
  id: 'l1',
  title: 'Replica watch',
  description: 'Gold colour',
  priceKobo: 900_000,
  stock: 3,
  status: ListingStatus.ACTIVE,
  isFlagged: false,
  heldAt: null,
  heldWords: [],
  wentLiveAt: new Date(),
  moderationReason: null,
  sellerId: 's1',
  createdAt: new Date(),
  images: [{ url: 'https://res.cloudinary.com/x/1.jpg' }],
  seller: {
    username: null,
    firstName: 'Chidi',
    isSuspended: false,
    sellerProfile: { storeName: 'Chidi Gadgets' },
  },
};

describe('AdminListingsService', () => {
  let service: AdminListingsService;
  const prisma = {
    listing: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    supportReport: { updateMany: jest.fn(), findMany: jest.fn() },
    moderationAction: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const notifications = { notify: jest.fn() };
  const suspension = { suspendForProhibitedItem: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    prisma.listing.update.mockImplementation(
      ({ data }: { data: { status?: ListingStatus } }) => ({
        status: data.status ?? ListingStatus.ACTIVE,
      }),
    );
    prisma.listing.findUniqueOrThrow.mockResolvedValue(row);
    prisma.supportReport.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminListingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
        { provide: SuspensionService, useValue: suspension },
      ],
    }).compile();
    service = moduleRef.get(AdminListingsService);
  });

  const updateData = () =>
    (prisma.listing.update.mock.calls[0][0] as { data: object }).data;

  it('lists the review queue oldest first, with report counts and reasons', async () => {
    prisma.listing.findMany.mockResolvedValue([row]);
    prisma.supportReport.findMany.mockResolvedValue([
      { listingId: 'l1', reason: 'SCAM' },
      { listingId: 'l1', reason: 'SCAM' },
      { listingId: 'l1', reason: 'MISLEADING' },
    ]);
    const page = await service.list({ view: 'REVIEW', limit: 20 });
    const args = prisma.listing.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      isDeleted: false,
      OR: [{ isFlagged: true }, { heldAt: { not: null } }],
    });
    expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(page.items[0]).toMatchObject({
      openReports: 3,
      reportReasons: ['SCAM', 'MISLEADING'],
      storeName: 'Chidi Gadgets',
      imageUrl: 'https://res.cloudinary.com/x/1.jpg',
      wentLive: true,
    });
  });

  it('shows rejected listings in HIDDEN', async () => {
    prisma.listing.findMany.mockResolvedValue([]);
    await service.list({ view: 'HIDDEN', limit: 20 });
    expect(prisma.listing.findMany.mock.calls[0][0].where).toEqual({
      isDeleted: false,
      status: ListingStatus.FLAGGED,
      isFlagged: false,
      heldAt: null,
    });
  });

  describe('APPROVE', () => {
    it('puts a held listing live by its stock, clears the hold and closes reports', async () => {
      prisma.listing.findFirst.mockResolvedValue(current({ stock: 0 }));
      await service.moderate('l1', { type: 'APPROVE' }, 'admin');
      expect(updateData()).toEqual({
        status: ListingStatus.SOLDOUT,
        isFlagged: false,
        heldAt: null,
        heldWords: [],
        moderationReason: null,
        wentLiveAt: expect.any(Date),
      });
      expect(prisma.supportReport.updateMany).toHaveBeenCalledWith({
        where: { listingId: 'l1', type: 'LISTING', status: 'OPEN' },
        data: expect.objectContaining({
          status: 'CLOSED',
          resolvedById: 'admin',
          resolutionNote: 'Approved',
        }),
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ type: 'LISTING_APPROVED' }),
        { email: false },
      );
    });

    it('keeps the first time it went live, and a visible listing’s status', async () => {
      const wentLiveAt = new Date('2026-10-01T09:00:00Z');
      prisma.listing.findFirst.mockResolvedValue(
        current({ status: ListingStatus.ACTIVE, isFlagged: true, wentLiveAt }),
      );
      await service.moderate('l1', { type: 'APPROVE' }, 'admin');
      expect(updateData()).toEqual(
        expect.objectContaining({ status: ListingStatus.ACTIVE }),
      );
      expect(updateData()).not.toHaveProperty('wentLiveAt');
      // Nothing changed for buyers, so the seller isn't told
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('refuses a hidden listing of a suspended seller', async () => {
      prisma.listing.findFirst.mockResolvedValue(
        current({ seller: { isSuspended: true } }),
      );
      const error = await service
        .moderate('l1', { type: 'APPROVE' }, 'admin')
        .catch((e: unknown) => e);
      expect(failure(error)).toEqual({ status: 409, code: 'SELLER_SUSPENDED' });
      expect(prisma.listing.update).not.toHaveBeenCalled();
    });
  });

  describe('REJECT', () => {
    it('needs a reason', async () => {
      const error = await service
        .moderate('l1', { type: 'REJECT' }, 'admin')
        .catch((e: unknown) => e);
      expect(failure(error).status).toBe(400);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('hides it with the reason and note, and tells the seller', async () => {
      prisma.listing.findFirst.mockResolvedValue(current());
      await service.moderate(
        'l1',
        { type: 'REJECT', reason: 'COUNTERFEIT', note: 'Fake logo' },
        'admin',
      );
      expect(updateData()).toEqual({
        status: ListingStatus.FLAGGED,
        isFlagged: false,
        heldAt: null,
        heldWords: [],
        moderationReason: 'Counterfeit: Fake logo',
      });
      expect(prisma.moderationAction.create).toHaveBeenCalledWith({
        data: {
          type: 'REJECT',
          reason: 'Counterfeit: Fake logo',
          listingId: 'l1',
          moderatorId: 'admin',
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LISTING_MODERATED',
          meta: expect.objectContaining({
            type: 'REJECT',
            reason: 'COUNTERFEIT',
            from: ListingStatus.FLAGGED,
            to: ListingStatus.FLAGGED,
          }),
        }),
        prisma,
      );
      expect(suspension.suspendForProhibitedItem).not.toHaveBeenCalled();
      expect(notifications.notify).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          type: 'LISTING_REJECTED',
          body: expect.stringContaining('Counterfeit: Fake logo'),
        }),
        { email: false },
      );
    });

    it('suspends the seller of a prohibited item buyers saw (M4d), and the seller learns why at sign-in', async () => {
      prisma.listing.findFirst.mockResolvedValue(
        current({ status: ListingStatus.ACTIVE, wentLiveAt: new Date() }),
      );
      suspension.suspendForProhibitedItem.mockResolvedValue(true);
      await service.moderate(
        'l1',
        { type: 'REJECT', reason: 'PROHIBITED_ITEM' },
        'admin',
      );
      expect(suspension.suspendForProhibitedItem).toHaveBeenCalledWith(
        prisma,
        's1',
        'Replica watch',
        'admin',
      );
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('doesn’t suspend for a listing the banned-word check held before it went live (M4f)', async () => {
      prisma.listing.findFirst.mockResolvedValue(current({ wentLiveAt: null }));
      await service.moderate(
        'l1',
        { type: 'REJECT', reason: 'PROHIBITED_ITEM' },
        'admin',
      );
      expect(suspension.suspendForProhibitedItem).not.toHaveBeenCalled();
    });
  });

  describe('FLAG and UNFLAG', () => {
    it('flags a visible listing without closing its reports', async () => {
      prisma.listing.findFirst.mockResolvedValue(
        current({ status: ListingStatus.ACTIVE, heldAt: null }),
      );
      await service.moderate('l1', { type: 'FLAG' }, 'admin');
      expect(updateData()).toEqual({ isFlagged: true });
      expect(prisma.supportReport.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ['FLAG' as const, { isFlagged: true, status: ListingStatus.ACTIVE }],
      ['UNFLAG' as const, { isFlagged: false, status: ListingStatus.ACTIVE }],
      ['UNFLAG' as const, { isFlagged: true, status: ListingStatus.FLAGGED }],
    ])('refuses %s when it doesn’t apply (%o)', async (type, state) => {
      prisma.listing.findFirst.mockResolvedValue(current(state));
      const error = await service
        .moderate('l1', { type }, 'admin')
        .catch((e: unknown) => e);
      expect(failure(error)).toEqual({
        status: 409,
        code: 'MODERATION_NOT_APPLICABLE',
      });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('answers 404 for a deleted or unknown listing', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    const error = await service
      .moderate('l1', { type: 'FLAG' }, 'admin')
      .catch((e: unknown) => e);
    expect(failure(error).status).toBe(404);
  });
});
