import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { WISHLIST_LIMIT, WishlistService } from './wishlist.service';

describe('WishlistService', () => {
  let service: WishlistService;
  const prisma = {
    listing: { findMany: jest.fn() },
    wishlist: {
      count: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const user = { id: 'u1', institutionId: 'i1' } as AuthUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.wishlist.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(WishlistService);
  });

  it('saves only listings at the user’s school; anything else is 404', async () => {
    prisma.listing.findMany.mockResolvedValue([]);
    await expect(service.add(user, 'l9')).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.listing.findMany.mock.calls[0][0].where).toMatchObject({
      institutionId: 'i1',
      isDeleted: false,
    });
    await expect(
      service.add({ ...user, institutionId: null }, 'l1'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('saving twice keeps one row', async () => {
    prisma.listing.findMany.mockResolvedValue([{ id: 'l1' }]);
    prisma.wishlist.count.mockResolvedValue(3);
    await service.add(user, 'l1');
    expect(prisma.wishlist.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', listingId: 'l1' }],
      skipDuplicates: true,
    });
  });

  it('a full wishlist refuses a new favourite but not one already saved', async () => {
    prisma.listing.findMany.mockResolvedValue([{ id: 'l1' }]);
    prisma.wishlist.count
      .mockResolvedValueOnce(WISHLIST_LIMIT)
      .mockResolvedValueOnce(0);
    await expect(service.add(user, 'l1')).rejects.toMatchObject({
      status: 409,
    });
    prisma.wishlist.count
      .mockResolvedValueOnce(WISHLIST_LIMIT)
      .mockResolvedValueOnce(1);
    await expect(service.add(user, 'l1')).resolves.toBeUndefined();
  });

  it('merges the phone’s favourites it can see, up to the limit (R5)', async () => {
    prisma.listing.findMany.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }]);
    prisma.wishlist.count.mockResolvedValue(WISHLIST_LIMIT - 1);
    await service.merge(user, ['l1', 'l2', 'l1', 'far']);
    expect(prisma.listing.findMany.mock.calls[0][0].where.id).toEqual({
      in: ['l1', 'l2', 'far'],
    });
    expect(prisma.wishlist.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', listingId: 'l1' }],
      skipDuplicates: true,
    });
  });
});
