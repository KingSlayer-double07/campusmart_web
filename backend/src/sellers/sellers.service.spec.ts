import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { SellersService } from './sellers.service';

describe('SellersService', () => {
  let service: SellersService;
  const prisma = { sellerProfile: { upsert: jest.fn() } };
  const cloudinary = { requireSettings: jest.fn() };
  const profile = {
    storeName: 'Ada Wears',
    bio: null,
    logoUrl: null,
    isOnline: false,
    ratingAvg: 0,
    ratingCount: 0,
    payoutBankName: null,
    payoutAccountLast4: null,
    payoutAccountName: null,
    paystackRecipientCode: 'RCP_secret',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    cloudinary.requireSettings.mockReturnValue({ cloudName: 'campusmart' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        SellersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = moduleRef.get(SellersService);
  });

  it('creates an empty profile when there is none, and never returns the recipient code', async () => {
    prisma.sellerProfile.upsert.mockResolvedValue(profile);
    const result = await service.me('u1');
    expect(prisma.sellerProfile.upsert.mock.calls[0][0]).toMatchObject({
      where: { userId: 'u1' },
      update: {},
      create: { userId: 'u1' },
    });
    expect(result.hasPayoutAccount).toBe(true);
    expect(JSON.stringify(result)).not.toContain('RCP_secret');
  });

  it('accepts a logo from your own avatar folder only', async () => {
    prisma.sellerProfile.upsert.mockResolvedValue(profile);
    await service.update('u1', {
      logoUrl:
        'https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/avatars/u1/logo.png',
    });
    const error = await service
      .update('u1', {
        logoUrl:
          'https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/avatars/u2/logo.png',
      })
      .catch((e: unknown) => e);
    expect((error as HttpException).getStatus()).toBe(400);
  });

  it('toggles isOnline', async () => {
    prisma.sellerProfile.upsert.mockResolvedValue({
      ...profile,
      isOnline: true,
    });
    await service.update('u1', { isOnline: true });
    expect(prisma.sellerProfile.upsert.mock.calls[0][0].update).toMatchObject({
      isOnline: true,
    });
  });
});
