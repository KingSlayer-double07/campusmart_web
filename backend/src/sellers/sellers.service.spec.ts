import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { SellersService } from './sellers.service';

describe('SellersService', () => {
  let service: SellersService;
  const prisma = {
    sellerProfile: { upsert: jest.fn(), findUnique: jest.fn() },
  };
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
    pickupArea: null,
    pickupAddress: null,
    contactPhone: null,
    allowsPickup: false,
  };
  const codeOf = (error: unknown) =>
    ((error as HttpException).getResponse() as { code?: string }).code;

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

  it('saves the delivery details and says when they are complete (decision SA1)', async () => {
    const details = {
      pickupArea: 'Moremi Hall',
      pickupAddress: 'Room 12, Block B',
      contactPhone: '+234 801 234 5678',
    };
    prisma.sellerProfile.upsert.mockResolvedValue({ ...profile, ...details });
    const result = await service.update('u1', details);
    expect(prisma.sellerProfile.upsert.mock.calls[0][0].update).toMatchObject(
      details,
    );
    expect(result.deliveryDetailsComplete).toBe(true);

    prisma.sellerProfile.upsert.mockResolvedValue(profile);
    expect((await service.me('u1')).deliveryDetailsComplete).toBe(false);
  });

  it('allows pickup only once the area, address and phone are known (decision DL1)', async () => {
    prisma.sellerProfile.findUnique.mockResolvedValue({
      pickupArea: 'Moremi Hall',
      pickupAddress: null,
      contactPhone: '+234 801 234 5678',
      allowsPickup: false,
    });
    const error = await service
      .update('u1', { allowsPickup: true })
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('PICKUP_DETAILS_REQUIRED');
    expect(prisma.sellerProfile.upsert).not.toHaveBeenCalled();

    // The missing address in the same request is enough
    prisma.sellerProfile.upsert.mockResolvedValue(profile);
    await service.update('u1', {
      allowsPickup: true,
      pickupAddress: 'Room 12, Block B',
    });
    expect(prisma.sellerProfile.upsert).toHaveBeenCalled();
  });
});
