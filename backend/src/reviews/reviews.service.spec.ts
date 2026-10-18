import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from './reviews.service';

const statusOf = (error: unknown) => (error as HttpException).getStatus();
const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

describe('ReviewsService', () => {
  let service: ReviewsService;
  const tx = {
    review: { create: jest.fn(), aggregate: jest.fn(), update: jest.fn() },
    listing: { update: jest.fn() },
    sellerProfile: { updateMany: jest.fn() },
  };
  const prisma = {
    sellerOrder: { findFirst: jest.fn() },
    review: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  const buyer = { id: 'b1', institutionId: 'i1' } as AuthUser;
  const delivered = {
    id: 'so1',
    sellerId: 's1',
    fulfillmentStatus: 'DELIVERED',
    items: [{ listingId: 'l1' }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.review.create.mockResolvedValue({ id: 'r1' });
    tx.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.333333 },
      _count: { _all: 3 },
    });
    prisma.review.findUniqueOrThrow.mockResolvedValue({
      id: 'r1',
      rating: 5,
      comment: null,
      createdAt: new Date(),
      listingId: 'l1',
      revieweeId: 's1',
      hiddenAt: null,
      hiddenReason: null,
      reviewer: { username: null, firstName: 'Tobi' },
      listing: { title: 'Desk lamp' },
      reviewee: {
        username: null,
        firstName: null,
        sellerProfile: { storeName: 'Chidi Gadgets' },
      },
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ReviewsService);
  });

  it('only the buyer’s own order: anyone else gets 404', async () => {
    prisma.sellerOrder.findFirst.mockResolvedValue(null);
    await expect(
      service.create(buyer, 'so1', { listingId: 'l1', rating: 5 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.sellerOrder.findFirst.mock.calls[0][0].where).toEqual({
      id: 'so1',
      order: { buyerId: 'b1' },
    });
  });

  it('not received yet is 403 REVIEW_NOT_OPEN; an item not in it is 400', async () => {
    prisma.sellerOrder.findFirst.mockResolvedValue({
      ...delivered,
      fulfillmentStatus: 'WITH_RIDER',
    });
    const early = await service
      .create(buyer, 'so1', { listingId: 'l1', rating: 5 })
      .catch((e: unknown) => e);
    expect([statusOf(early), codeOf(early)]).toEqual([403, 'REVIEW_NOT_OPEN']);

    prisma.sellerOrder.findFirst.mockResolvedValue(delivered);
    const other = await service
      .create(buyer, 'so1', { listingId: 'l9', rating: 5 })
      .catch((e: unknown) => e);
    expect([statusOf(other), codeOf(other)]).toEqual([400, 'NOT_IN_ORDER']);
    expect(tx.review.create).not.toHaveBeenCalled();
  });

  it('saves the review and recounts the listing’s and seller’s ratings in one transaction', async () => {
    prisma.sellerOrder.findFirst.mockResolvedValue(delivered);
    const review = await service.create(buyer, 'so1', {
      listingId: 'l1',
      rating: 5,
      comment: '',
    });
    expect(tx.review.create.mock.calls[0][0].data).toMatchObject({
      rating: 5,
      comment: null,
      reviewerId: 'b1',
      revieweeId: 's1',
    });
    expect(tx.listing.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { ratingAvg: 4.33, ratingCount: 3 },
    });
    expect(tx.sellerProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 's1' },
      data: { ratingAvg: 4.33, ratingCount: 3 },
    });
    // Hidden reviews don't count (R4)
    expect(tx.review.aggregate.mock.calls[0][0].where).toMatchObject({
      hiddenAt: null,
    });
    expect(review).toMatchObject({
      reviewerDisplayName: 'Tobi',
      listingTitle: 'Desk lamp',
    });
  });

  it('a second review of the same item is 409 ALREADY_REVIEWED', async () => {
    prisma.sellerOrder.findFirst.mockResolvedValue(delivered);
    tx.review.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const error = await service
      .create(buyer, 'so1', { listingId: 'l1', rating: 3 })
      .catch((e: unknown) => e);
    expect([statusOf(error), codeOf(error)]).toEqual([409, 'ALREADY_REVIEWED']);
  });

  it('hiding twice is 409; hiding is audited with the reason', async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: 'r1',
      listingId: 'l1',
      revieweeId: 's1',
      hiddenAt: new Date(),
    });
    const again = await service
      .hide('r1', 'Abusive', 'a1')
      .catch((e: unknown) => e);
    expect(codeOf(again)).toBe('ALREADY_HIDDEN');

    prisma.review.findUnique.mockResolvedValue({
      id: 'r1',
      listingId: 'l1',
      revieweeId: 's1',
      hiddenAt: null,
    });
    await service.hide('r1', 'Abusive', 'a1');
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'REVIEW_HIDDEN',
      meta: { reason: 'Abusive' },
    });
    expect(tx.listing.update).toHaveBeenCalled();
  });
});
