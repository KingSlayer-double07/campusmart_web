import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth-user';
import {
  ListingStatus,
  UserRole,
  VerificationStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { ListingsService } from './listings.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

const seller = {
  id: 'seller-1',
  role: UserRole.SELLER,
  institutionId: 'school-a',
  verificationStatus: VerificationStatus.VERIFIED,
} as AuthUser;

const image = (n: number, owner = seller.id) => ({
  url: `https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/listings/${owner}/p${n}.jpg`,
  publicId: `campusmart/listings/${owner}/p${n}`,
});

const fullRow = {
  id: 'l1',
  title: 'Cargo pants',
  priceKobo: 1_450_000,
  stock: 3,
  status: ListingStatus.ACTIVE,
  category: 'FASHION',
  condition: 'NEW',
  ratingAvg: 0,
  ratingCount: 0,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  description: 'Comfy',
  sellerId: seller.id,
  images: [
    { id: 'i1', url: image(1).url, publicId: image(1).publicId, position: 0 },
  ],
  variants: [
    { id: 'v1', label: 'L', priceKobo: null, stock: 1, isActive: true },
    { id: 'v2', label: 'S', priceKobo: 1_500_000, stock: 2, isActive: true },
    { id: 'v3', label: 'XL', priceKobo: null, stock: 0, isActive: false },
  ],
  seller: {
    id: seller.id,
    username: null,
    firstName: 'Ada',
    verificationStatus: 'UNVERIFIED',
    sellerProfile: {
      storeName: 'Ada Wears',
      logoUrl: null,
      ratingAvg: 0,
      ratingCount: 0,
      isOnline: true,
    },
  },
};

describe('ListingsService', () => {
  let service: ListingsService;
  const prisma = {
    listing: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    listingImage: { deleteMany: jest.fn(), createMany: jest.fn() },
    listingVariant: {
      deleteMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    sellerOrder: { count: jest.fn() },
    orderItem: { findMany: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  };
  const cloudinary = {
    requireSettings: jest.fn(),
    destroy: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    prisma.$executeRaw.mockReturnValue(Promise.resolve(1));
    cloudinary.requireSettings.mockReturnValue({
      cloudName: 'campusmart',
      apiKey: 'k',
      apiSecret: 's',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ListingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = moduleRef.get(ListingsService);
  });

  const createDto = {
    title: 'Cargo pants',
    description: 'Comfy',
    priceKobo: 1_450_000,
    category: 'FASHION' as const,
    condition: 'NEW' as const,
    images: [image(1), image(2), image(3)],
    status: 'ACTIVE' as const,
  };

  describe('create', () => {
    it("copies the seller's institution and adds up the options' stock", async () => {
      prisma.listing.create.mockResolvedValue(fullRow);
      await service.create(seller, {
        ...createDto,
        stock: 99, // ignored when variants are sent
        variants: [
          { label: 'S', stock: 2 },
          { label: 'M', stock: 3, priceKobo: 1_500_000 },
        ],
      });
      const { data } = prisma.listing.create.mock.calls[0][0];
      expect(data).toMatchObject({
        sellerId: 'seller-1',
        institutionId: 'school-a',
        stock: 5,
        status: ListingStatus.ACTIVE,
      });
      expect(
        data.images.create.map((i: { position: number }) => i.position),
      ).toEqual([0, 1, 2]);
      expect(data.variants.create[0]).toEqual({
        label: 'S',
        priceKobo: null,
        stock: 2,
      });
    });

    it('saves an ACTIVE listing with no stock as SOLDOUT', async () => {
      prisma.listing.create.mockResolvedValue(fullRow);
      await service.create(seller, { ...createDto, stock: 0 });
      expect(prisma.listing.create.mock.calls[0][0].data.status).toBe(
        ListingStatus.SOLDOUT,
      );
    });

    it('lets an unverified seller save a draft but not publish', async () => {
      for (const verificationStatus of [
        VerificationStatus.UNVERIFIED,
        VerificationStatus.PENDING,
        VerificationStatus.REJECTED,
      ]) {
        const unverified = { ...seller, verificationStatus } as AuthUser;
        const error = await service
          .create(unverified, { ...createDto, stock: 1 })
          .catch((e: unknown) => e);
        expect(codeOf(error)).toBe('SELLER_NOT_VERIFIED');
      }
      expect(prisma.listing.create).not.toHaveBeenCalled();

      prisma.listing.create.mockResolvedValue(fullRow);
      await service.create(
        {
          ...seller,
          verificationStatus: VerificationStatus.PENDING,
        } as AuthUser,
        { ...createDto, stock: 1, status: 'DRAFT' },
      );
      expect(prisma.listing.create.mock.calls[0][0].data.status).toBe(
        ListingStatus.DRAFT,
      );
    });

    it('rejects a photo from another Cloudinary account with 400 INVALID_IMAGE', async () => {
      const foreign = {
        url: 'https://res.cloudinary.com/someone-else/image/upload/v1/campusmart/listings/seller-1/x.jpg',
        publicId: 'campusmart/listings/seller-1/x',
      };
      const error = await service
        .create(seller, { ...createDto, stock: 1, images: [foreign] })
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(400);
      expect(codeOf(error)).toBe('INVALID_IMAGE');
      expect(prisma.listing.create).not.toHaveBeenCalled();
    });

    it("rejects a photo from another seller's folder", async () => {
      const error = await service
        .create(seller, {
          ...createDto,
          stock: 1,
          images: [image(1, 'seller-2')],
        })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('INVALID_IMAGE');
    });

    it('needs stock when there are no options, and different option names', async () => {
      await expect(service.create(seller, createDto)).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        service.create(seller, {
          ...createDto,
          variants: [
            { label: 'M', stock: 1 },
            { label: 'm', stock: 1 },
          ],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('reads', () => {
    it('shows an account with no institution nothing, without querying', async () => {
      const admin = {
        ...seller,
        role: UserRole.ADMIN,
        institutionId: null,
      } as AuthUser;
      await expect(
        service.browse(admin, { limit: 20, sort: 'newest' }),
      ).resolves.toEqual({
        items: [],
        nextCursor: null,
      });
      expect(prisma.listing.findMany).not.toHaveBeenCalled();
      await expect(service.findOne(admin, 'l1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('browses only active, undeleted listings at your institution', async () => {
      prisma.listing.findMany.mockResolvedValue([]);
      await service.browse({ ...seller, id: 'buyer' } as AuthUser, {
        limit: 20,
        sort: 'newest',
        q: 'pants',
        category: 'FASHION',
      });
      expect(prisma.listing.findMany.mock.calls[0][0].where).toMatchObject({
        institutionId: 'school-a',
        isDeleted: false,
        status: ListingStatus.ACTIVE,
        category: 'FASHION',
        OR: [
          { title: { contains: 'pants', mode: 'insensitive' } },
          { description: { contains: 'pants', mode: 'insensitive' } },
        ],
      });
    });

    it('records a view for buyers, not for the seller, and hides inactive options from buyers', async () => {
      prisma.listing.findFirst.mockResolvedValue(fullRow);
      const asBuyer = await service.findOne(
        { ...seller, id: 'buyer' } as AuthUser,
        'l1',
      );
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(asBuyer.variants.map((v) => v.label)).toEqual(['S', 'L']);
      expect(asBuyer.isOwner).toBe(false);
      expect(asBuyer.seller.displayName).toBe('Ada Wears');
      expect(asBuyer).toMatchObject({
        minPriceKobo: 1_450_000,
        maxPriceKobo: 1_500_000,
      });

      const asOwner = await service.findOne(seller, 'l1');
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(asOwner.variants).toHaveLength(3);
    });
  });

  describe('owner routes', () => {
    it('404s (not 403) for a listing you do not own', async () => {
      prisma.listing.findFirst.mockResolvedValue(null);
      await expect(
        service.update({ ...seller, id: 'seller-2' } as AuthUser, 'l1', {
          title: 'Mine now',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.listing.findFirst.mock.calls[0][0].where).toEqual({
        id: 'l1',
        sellerId: 'seller-2',
        isDeleted: false,
      });
    });

    it('cannot change the status of a listing under review', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        status: ListingStatus.FLAGGED,
        stock: 3,
      });
      const error = await service
        .setStatus(seller, 'l1', 'ACTIVE')
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('LISTING_UNDER_REVIEW');
    });

    it('an unverified seller cannot publish, but can archive', async () => {
      const unverified = {
        ...seller,
        verificationStatus: VerificationStatus.UNVERIFIED,
      } as AuthUser;
      prisma.listing.findFirst.mockResolvedValue({
        status: ListingStatus.DRAFT,
        stock: 3,
      });
      const error = await service
        .setStatus(unverified, 'l1', 'ACTIVE')
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('SELLER_NOT_VERIFIED');
      expect(prisma.listing.update).not.toHaveBeenCalled();

      prisma.listing.findUniqueOrThrow.mockResolvedValue(fullRow);
      await service.setStatus(unverified, 'l1', 'ARCHIVED');
      expect(prisma.listing.update.mock.calls[0][0].data).toEqual({
        status: ListingStatus.ARCHIVED,
      });
    });

    it('publishing with no stock gives SOLDOUT', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        status: ListingStatus.DRAFT,
        stock: 0,
      });
      prisma.listing.findUniqueOrThrow.mockResolvedValue(fullRow);
      await service.setStatus(seller, 'l1', 'ACTIVE');
      expect(prisma.listing.update.mock.calls[0][0].data).toEqual({
        status: ListingStatus.SOLDOUT,
      });
    });

    it('refuses to delete a listing in an unfinished order, with the count', async () => {
      prisma.listing.findFirst.mockResolvedValue({ id: 'l1' });
      prisma.sellerOrder.count.mockResolvedValue(2);
      const error = await service.remove(seller, 'l1').catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'LISTING_HAS_OPEN_ORDERS',
        details: { openOrders: 2 },
      });
      expect(prisma.listing.update).not.toHaveBeenCalled();
    });

    it('soft-deletes otherwise', async () => {
      prisma.listing.findFirst.mockResolvedValue({ id: 'l1' });
      prisma.sellerOrder.count.mockResolvedValue(0);
      await service.remove(seller, 'l1');
      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { isDeleted: true },
      });
    });

    it('replacing photos deletes the old ones from Cloudinary, except ones an order shows', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        images: [image(1), image(2)],
        variants: [],
      });
      prisma.listing.findUniqueOrThrow
        .mockResolvedValueOnce({
          stock: 3,
          status: ListingStatus.ACTIVE,
          variants: [],
        })
        .mockResolvedValueOnce(fullRow);
      prisma.orderItem.findMany.mockResolvedValue([{ imageUrl: image(2).url }]);

      await service.update(seller, 'l1', { images: [image(3)] });
      await new Promise((resolve) => setImmediate(resolve));

      expect(prisma.listingImage.createMany).toHaveBeenCalledWith({
        data: [{ ...image(3), position: 0, listingId: 'l1' }],
      });
      expect(cloudinary.destroy).toHaveBeenCalledWith([image(1).publicId]);
    });

    it('keeps an option that is still sent (matched by name) and removes the rest', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        images: [],
        variants: [
          { id: 'v1', label: 'S' },
          { id: 'v2', label: 'M' },
        ],
      });
      prisma.listing.findUniqueOrThrow
        .mockResolvedValueOnce({
          stock: 3,
          status: ListingStatus.ACTIVE,
          variants: [],
        })
        .mockResolvedValueOnce(fullRow);
      await service.update(seller, 'l1', {
        variants: [
          { label: 'S', stock: 5 },
          { label: 'L', stock: 1 },
        ],
      });
      expect(prisma.listingVariant.deleteMany).toHaveBeenCalledWith({
        where: { listingId: 'l1', label: { notIn: ['S', 'L'] } },
      });
      expect(prisma.listingVariant.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { label: 'S', priceKobo: null, stock: 5, isActive: true },
      });
      expect(prisma.listingVariant.create).toHaveBeenCalledWith({
        data: { label: 'L', priceKobo: null, stock: 1, listingId: 'l1' },
      });
    });
  });
});
