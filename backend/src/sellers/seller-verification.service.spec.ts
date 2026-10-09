import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth-user';
import { UserRole, VerificationStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { assertCanPublish } from './seller-verification';
import { SellerVerificationService } from './seller-verification.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

const seller = { id: 's1', role: UserRole.SELLER } as AuthUser;
const idPhoto = (userId = 's1', type = 'authenticated') =>
  `https://res.cloudinary.com/campusmart/image/${type}/s--Ab12Cd34--/v1/campusmart/verification/${userId}/card.jpg`;

describe('SellerVerificationService', () => {
  let service: SellerVerificationService;
  const prisma = {
    user: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    verificationRequest: { create: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const cloudinary = {
    requireSettings: jest.fn(() => ({ cloudName: 'campusmart' })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        SellerVerificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = moduleRef.get(SellerVerificationService);
  });

  it('accepts only a private upload in your own verification folder', async () => {
    for (const documentUrl of [
      idPhoto('s1', 'upload'),
      idPhoto('someone-else'),
      'https://res.cloudinary.com/other/image/authenticated/v1/campusmart/verification/s1/card.jpg',
    ]) {
      const error = await service
        .submit(seller, { documentUrl })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('INVALID_DOCUMENT');
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('opens a request and marks the seller PENDING in one transaction', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      verificationStatus: VerificationStatus.PENDING,
    });
    prisma.verificationRequest.findFirst.mockResolvedValue({ id: 'r1' });

    const result = await service.submit(seller, { documentUrl: idPhoto() });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 's1',
        verificationStatus: {
          in: [VerificationStatus.UNVERIFIED, VerificationStatus.REJECTED],
        },
      },
      data: { verificationStatus: VerificationStatus.PENDING },
    });
    expect(prisma.verificationRequest.create).toHaveBeenCalledWith({
      data: { userId: 's1', documentUrl: idPhoto() },
    });
    expect(result).toEqual({
      status: VerificationStatus.PENDING,
      latestRequest: { id: 'r1' },
    });
  });

  it.each([
    [VerificationStatus.PENDING, 'VERIFICATION_PENDING'],
    [VerificationStatus.VERIFIED, 'ALREADY_VERIFIED'],
  ])('refuses a new request while %s', async (status, code) => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      verificationStatus: status,
    });
    const error = await service
      .submit(seller, { documentUrl: idPhoto() })
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe(code);
    expect(prisma.verificationRequest.create).not.toHaveBeenCalled();
  });

  it('only a VERIFIED seller can publish', () => {
    expect(() =>
      assertCanPublish({ verificationStatus: VerificationStatus.VERIFIED }),
    ).not.toThrow();
    for (const verificationStatus of [
      VerificationStatus.UNVERIFIED,
      VerificationStatus.PENDING,
      VerificationStatus.REJECTED,
    ]) {
      let error: unknown;
      try {
        assertCanPublish({ verificationStatus });
      } catch (e) {
        error = e;
      }
      expect(codeOf(error)).toBe('SELLER_NOT_VERIFIED');
    }
  });
});
