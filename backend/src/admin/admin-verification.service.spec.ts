import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { VerificationStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { AdminVerificationService } from './admin-verification.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

const row = (overrides: object = {}) => ({
  id: 'r1',
  status: VerificationStatus.PENDING,
  documentUrl:
    'https://res.cloudinary.com/campusmart/image/authenticated/s--Ab12Cd34--/v1/campusmart/verification/s1/card.jpg',
  createdAt: new Date('2026-10-09T10:00:00Z'),
  reviewedAt: null,
  reviewNote: null,
  user: {
    id: 's1',
    firstName: 'Amaka',
    lastName: 'Obi',
    email: 'amaka@unilag.edu.ng',
    sellerProfile: { storeName: 'Amaka Styles' },
    institution: { name: 'University of Lagos' },
  },
  ...overrides,
});

describe('AdminVerificationService', () => {
  let service: AdminVerificationService;
  const prisma = {
    verificationRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const cloudinary = {
    settings: { cloudName: 'campusmart' } as { cloudName: string } | null,
    privateImageUrl: jest.fn(() => 'https://api.cloudinary.com/signed'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    cloudinary.settings = { cloudName: 'campusmart' };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminVerificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = moduleRef.get(AdminVerificationService);
  });

  describe('list', () => {
    it('serves the pending queue oldest first, with a signed photo link instead of the URL', async () => {
      prisma.verificationRequest.findMany.mockResolvedValue([
        row(),
        row({ id: 'r2' }),
      ]);
      const page = await service.list({ status: 'PENDING', limit: 1 });

      const args = prisma.verificationRequest.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ status: 'PENDING' });
      expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
      expect(cloudinary.privateImageUrl).toHaveBeenCalledWith(
        'campusmart/verification/s1/card',
        'jpg',
      );
      expect(page).toEqual({
        items: [
          {
            id: 'r1',
            status: VerificationStatus.PENDING,
            createdAt: row().createdAt,
            reviewedAt: null,
            reviewNote: null,
            documentViewUrl: 'https://api.cloudinary.com/signed',
            seller: {
              id: 's1',
              firstName: 'Amaka',
              lastName: 'Obi',
              email: 'amaka@unilag.edu.ng',
              storeName: 'Amaka Styles',
              institutionName: 'University of Lagos',
            },
          },
        ],
        nextCursor: 'r1',
      });
    });

    it('shows decided requests latest first', async () => {
      prisma.verificationRequest.findMany.mockResolvedValue([]);
      await service.list({ status: 'REJECTED', limit: 20 });
      expect(
        prisma.verificationRequest.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ reviewedAt: 'desc' }, { id: 'desc' }]);
    });

    it("never links a document outside the seller's private folder, or without Cloudinary", async () => {
      prisma.verificationRequest.findMany.mockResolvedValue([
        row({ documentUrl: 'https://example.com/id.jpg' }),
        row({
          id: 'r2',
          documentUrl:
            'https://res.cloudinary.com/campusmart/image/authenticated/v1/campusmart/verification/other/card.jpg',
        }),
        row({
          id: 'r3',
          documentUrl:
            'https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/verification/s1/card.jpg',
        }),
      ]);
      const page = await service.list({ status: 'PENDING', limit: 20 });
      expect(page.items.map((i) => i.documentViewUrl)).toEqual([
        null,
        null,
        null,
      ]);

      cloudinary.settings = null;
      prisma.verificationRequest.findMany.mockResolvedValue([row()]);
      const without = await service.list({ status: 'PENDING', limit: 20 });
      expect(without.items[0].documentViewUrl).toBeNull();
      expect(cloudinary.privateImageUrl).not.toHaveBeenCalled();
    });
  });

  describe('decide', () => {
    it('404s for an unknown request', async () => {
      prisma.verificationRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.decide('nope', { decision: 'VERIFIED' }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a request someone already decided', async () => {
      prisma.verificationRequest.findUnique.mockResolvedValue({ userId: 's1' });
      prisma.verificationRequest.updateMany.mockResolvedValue({ count: 0 });
      const error = await service
        .decide('r1', { decision: 'VERIFIED' }, 'admin-1')
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('VERIFICATION_ALREADY_DECIDED');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects with the note, updates the seller and audits it', async () => {
      prisma.verificationRequest.findUnique.mockResolvedValue({ userId: 's1' });
      prisma.verificationRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.verificationRequest.findUniqueOrThrow.mockResolvedValue(
        row({ status: VerificationStatus.REJECTED, reviewNote: 'Blurry' }),
      );

      const result = await service.decide(
        'r1',
        { decision: 'REJECTED', note: 'Blurry' },
        'admin-1',
      );

      const update = prisma.verificationRequest.updateMany.mock.calls[0][0];
      expect(update.where).toEqual({
        id: 'r1',
        status: VerificationStatus.PENDING,
      });
      expect(update.data).toMatchObject({
        status: VerificationStatus.REJECTED,
        reviewNote: 'Blurry',
        reviewedById: 'admin-1',
      });
      expect(update.data.reviewedAt).toBeInstanceOf(Date);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { verificationStatus: VerificationStatus.REJECTED },
      });
      expect(audit.record).toHaveBeenCalledWith(
        {
          actorId: 'admin-1',
          action: 'SELLER_VERIFICATION_REJECTED',
          entityType: 'VerificationRequest',
          entityId: 'r1',
          meta: { userId: 's1', note: 'Blurry' },
        },
        prisma,
      );
      expect(result.status).toBe(VerificationStatus.REJECTED);
    });

    it('approves without a note', async () => {
      prisma.verificationRequest.findUnique.mockResolvedValue({ userId: 's1' });
      prisma.verificationRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.verificationRequest.findUniqueOrThrow.mockResolvedValue(
        row({ status: VerificationStatus.VERIFIED }),
      );
      await service.decide('r1', { decision: 'VERIFIED' }, 'admin-1');
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        verificationStatus: VerificationStatus.VERIFIED,
      });
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'SELLER_VERIFIED',
        meta: { userId: 's1', note: null },
      });
    });
  });
});
