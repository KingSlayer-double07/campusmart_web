import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth-user';
import {
  ListingCategory,
  ListingStatus,
  ProductCondition,
  UserRole,
  VerificationStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CartService, toCartDto } from './cart.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;
const detailsOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { details?: unknown }).details;

const buyer = {
  id: 'buyer',
  role: UserRole.BUYER,
  institutionId: 'school-a',
} as AuthUser;

const listingRow = (
  id: string,
  sellerId: string,
  overrides: Partial<{ status: ListingStatus; [key: string]: unknown }> = {},
) => ({
  id,
  title: `Item ${id}`,
  priceKobo: 100_000,
  stock: 5,
  status: ListingStatus.ACTIVE,
  category: ListingCategory.TECH,
  condition: ProductCondition.NEW,
  ratingAvg: 0,
  ratingCount: 0,
  createdAt: new Date('2026-10-01'),
  sellerId,
  isDeleted: false,
  institutionId: 'school-a',
  images: [{ url: `https://img/${id}.jpg` }],
  variants: [] as {
    id: string;
    label: string;
    priceKobo: number | null;
    stock: number;
    isActive: boolean;
  }[],
  seller: {
    id: sellerId,
    username: null,
    firstName: null,
    verificationStatus: VerificationStatus.VERIFIED,
    sellerProfile: {
      storeName: `Store ${sellerId}`,
      logoUrl: null,
      ratingAvg: 0,
      ratingCount: 0,
      isOnline: false,
    },
  },
  ...overrides,
});

describe('CartService', () => {
  let service: CartService;
  const prisma = {
    institution: { findUnique: jest.fn() },
    listing: { findUnique: jest.fn(), findMany: jest.fn() },
    cartItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.institution.findUnique.mockResolvedValue({ isActive: true });
    prisma.cartItem.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [CartService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CartService);
  });

  describe('access', () => {
    it('needs a school, and one that is switched on', async () => {
      const none = await service
        .get({ ...buyer, institutionId: null } as AuthUser)
        .catch((e: unknown) => e);
      expect(codeOf(none)).toBe('NO_INSTITUTION');

      prisma.institution.findUnique.mockResolvedValue({ isActive: false });
      const off = await service.get(buyer).catch((e: unknown) => e);
      expect(codeOf(off)).toBe('INSTITUTION_INACTIVE');
    });
  });

  describe('setItem', () => {
    const set = (dto: object) =>
      service
        .setItem(buyer, { listingId: 'l1', quantity: 1, ...dto })
        .catch((e: unknown) => e);

    it('404s a listing that is gone, not live or at another school', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      expect(await set({})).toBeInstanceOf(NotFoundException);
      for (const overrides of [
        { status: ListingStatus.SOLDOUT, stock: 0 },
        { status: ListingStatus.DRAFT },
        { institutionId: 'school-b' },
        { isDeleted: true },
      ]) {
        prisma.listing.findUnique.mockResolvedValue(
          listingRow('l1', 's1', overrides),
        );
        expect(await set({})).toBeInstanceOf(NotFoundException);
      }
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('needs an option when the listing has them, and refuses your own listing', async () => {
      prisma.listing.findUnique.mockResolvedValue(
        listingRow('l1', 's1', {
          variants: [
            { id: 'v1', label: 'M', priceKobo: null, stock: 2, isActive: true },
          ],
        }),
      );
      expect(codeOf(await set({}))).toBe('VARIANT_REQUIRED');

      prisma.listing.findUnique.mockResolvedValue(listingRow('l1', 'buyer'));
      expect(codeOf(await set({}))).toBe('OWN_LISTING');
    });

    it('refuses more than is in stock, saying how many are left', async () => {
      prisma.listing.findUnique.mockResolvedValue(
        listingRow('l1', 's1', { stock: 2 }),
      );
      const error = await set({ quantity: 3 });
      expect(codeOf(error)).toBe('OUT_OF_STOCK');
      expect(detailsOf(error)).toEqual({ available: 2 });
    });

    it('refuses a 51st line but lets you change one already there', async () => {
      prisma.listing.findUnique.mockResolvedValue(listingRow('l1', 's1'));
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.count.mockResolvedValue(50);
      expect(codeOf(await set({}))).toBe('CART_FULL');

      prisma.cartItem.findUnique.mockResolvedValue({ id: 'c1' });
      await set({ quantity: 2 });
      expect(prisma.cartItem.upsert).toHaveBeenCalled();
    });

    it("sets the quantity and notes today's price", async () => {
      prisma.listing.findUnique.mockResolvedValue(
        listingRow('l1', 's1', {
          variants: [
            {
              id: 'v1',
              label: 'L',
              priceKobo: 150_000,
              stock: 3,
              isActive: true,
            },
          ],
        }),
      );
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.count.mockResolvedValue(0);
      await service.setItem(buyer, {
        listingId: 'l1',
        variantId: 'v1',
        quantity: 2,
      });
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: {
          userId_listingId_variantKey: {
            userId: 'buyer',
            listingId: 'l1',
            variantKey: 'v1',
          },
        },
        create: {
          userId: 'buyer',
          listingId: 'l1',
          variantId: 'v1',
          variantKey: 'v1',
          quantity: 2,
          unitPriceKobo: 150_000,
        },
        update: { quantity: 2, unitPriceKobo: 150_000 },
      });
    });

    it('0 removes the line without checking the listing', async () => {
      await service.setItem(buyer, { listingId: 'l1', quantity: 0 });
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'buyer', listingId: 'l1', variantKey: '' },
      });
      expect(prisma.listing.findUnique).not.toHaveBeenCalled();
    });
  });

  it('removing a line that is not yours is 404', async () => {
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.removeItem(buyer, 'c9')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'c9', userId: 'buyer' },
    });
  });

  describe('merge', () => {
    it('keeps the larger quantity, caps it at stock and skips what cannot be bought', async () => {
      prisma.listing.findMany.mockResolvedValue([
        listingRow('l1', 's1', { stock: 3 }),
        listingRow('l2', 's1'),
        listingRow('l3', 's1', { status: ListingStatus.ARCHIVED }),
        listingRow('l4', 'buyer'),
      ]);
      prisma.cartItem.findMany
        .mockResolvedValueOnce([
          { id: 'c1', listingId: 'l1', variantKey: '', quantity: 1 },
          { id: 'c2', listingId: 'l2', variantKey: '', quantity: 4 },
        ])
        .mockResolvedValue([]);
      prisma.cartItem.create.mockImplementation(({ data }) => ({
        id: 'new',
        ...data,
      }));

      await service.merge(buyer, {
        items: [
          { listingId: 'l1', quantity: 9 }, // larger, capped at 3
          { listingId: 'l2', quantity: 2 }, // smaller: keeps 4
          { listingId: 'l3', quantity: 1 }, // archived: skipped
          { listingId: 'l4', quantity: 1 }, // own listing: skipped
          { listingId: 'missing', quantity: 1 },
        ],
      });

      expect(prisma.cartItem.update).toHaveBeenCalledTimes(1);
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { quantity: 3, unitPriceKobo: 100_000 },
      });
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });
  });

  describe('toCartDto', () => {
    it('groups by seller in the order first added, with subtotals of what can be bought', () => {
      const lines = [
        {
          id: 'c1',
          listingId: 'a',
          variantId: null,
          quantity: 2,
          unitPriceKobo: 100_000,
          listing: listingRow('a', 's1'),
        },
        {
          id: 'c2',
          listingId: 'b',
          variantId: null,
          quantity: 1,
          unitPriceKobo: 100_000,
          listing: listingRow('b', 's2', { priceKobo: 250_000 }),
        },
        {
          id: 'c3',
          listingId: 'c',
          variantId: null,
          quantity: 1,
          unitPriceKobo: 100_000,
          listing: listingRow('c', 's1', { isDeleted: true }),
        },
      ];
      const cart = toCartDto(lines, { id: 'buyer', institutionId: 'school-a' });
      expect(
        cart.groups.map((g) => [
          g.seller.storeName,
          g.subtotalKobo,
          g.items.length,
        ]),
      ).toEqual([
        ['Store s1', 200_000, 2],
        ['Store s2', 250_000, 1],
      ]);
      expect(cart.subtotalKobo).toBe(450_000);
      expect(cart.itemCount).toBe(4);
      expect(cart.groups[0].items[1]).toMatchObject({
        available: false,
        maxQuantity: 0,
      });
      expect(cart.issues.map((i) => [i.itemId, i.type])).toEqual([
        ['c2', 'PRICE_CHANGED'],
        ['c3', 'UNAVAILABLE'],
      ]);
    });
  });
});
