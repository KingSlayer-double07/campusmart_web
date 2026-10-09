import { HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth-user';
import { Prisma } from '../generated/prisma/client';
import {
  ListingStatus,
  OrderStatus,
  PaymentMethod,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';
import * as stock from './order-stock';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

const buyer = {
  id: 'buyer',
  role: UserRole.BUYER,
  institutionId: 'school-a',
} as AuthUser;
const dto = {
  pickupStationId: 'station-1',
  paymentMethod: PaymentMethod.CARD,
  idempotencyKey: '7d3f5b2e-1c4a-4f6e-9b8d-2a1c3e5f7a9b',
};

const line = (id: string, sellerId: string, overrides: object = {}) => ({
  id: `cart-${id}`,
  listingId: id,
  variantId: null as string | null,
  quantity: 1,
  listing: {
    id,
    title: `Item ${id}`,
    priceKobo: 100_000,
    stock: 5,
    status: ListingStatus.ACTIVE,
    isDeleted: false,
    institutionId: 'school-a',
    sellerId,
    images: [{ url: `https://img/${id}.jpg` }],
    variants: [] as object[],
    ...overrides,
  },
});

describe('CheckoutService', () => {
  let service: CheckoutService;
  const tx = {
    pickupStation: { findFirst: jest.fn() },
    cartItem: { findMany: jest.fn(), deleteMany: jest.fn() },
    order: { create: jest.fn() },
  };
  const prisma = {
    institution: { findUnique: jest.fn() },
    order: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const reserve = jest.spyOn(stock, 'reserveStock');
  const settings: Record<string, unknown> = {
    PLATFORM_FEE_BPS: 0,
    ORDER_PAYMENT_TTL_MINUTES: 30,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    settings.PLATFORM_FEE_BPS = 0;
    reserve.mockResolvedValue(undefined);
    prisma.institution.findUnique.mockResolvedValue({ isActive: true });
    prisma.order.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    tx.pickupStation.findFirst.mockResolvedValue({ id: 'station-1' });
    tx.order.create.mockResolvedValue({ id: 'order-1', totalKobo: 0 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => settings[key] },
        },
      ],
    }).compile();
    service = moduleRef.get(CheckoutService);
  });

  it('returns the existing order for a key it has seen, without touching the cart', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-0',
      buyerId: 'buyer',
      totalKobo: 450_000,
    });
    await expect(service.checkout(buyer, dto)).resolves.toEqual({
      orderId: 'order-0',
      totalKobo: 450_000,
      authorizationUrl: null,
      reference: null,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses someone else's key", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-0',
      buyerId: 'other',
      totalKobo: 1,
    });
    expect(
      codeOf(await service.checkout(buyer, dto).catch((e: unknown) => e)),
    ).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('needs a station at your school and a cart with something in it', async () => {
    tx.pickupStation.findFirst.mockResolvedValue(null);
    await expect(service.checkout(buyer, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.pickupStation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'station-1',
      institutionId: 'school-a',
      isActive: true,
    });

    tx.pickupStation.findFirst.mockResolvedValue({ id: 'station-1' });
    tx.cartItem.findMany.mockResolvedValue([]);
    expect(
      codeOf(await service.checkout(buyer, dto).catch((e: unknown) => e)),
    ).toBe('CART_EMPTY');
    expect(reserve).not.toHaveBeenCalled();
  });

  it('checks every line before reserving anything', async () => {
    tx.cartItem.findMany.mockResolvedValue([
      line('a', 's1'),
      line('b', 's1', { status: ListingStatus.ARCHIVED }),
    ]);
    expect(
      codeOf(await service.checkout(buyer, dto).catch((e: unknown) => e)),
    ).toBe('ITEM_UNAVAILABLE');
    tx.cartItem.findMany.mockResolvedValue([line('a', 's1', { stock: 0 })]);
    expect(
      codeOf(await service.checkout(buyer, dto).catch((e: unknown) => e)),
    ).toBe('OUT_OF_STOCK');
    expect(reserve).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('creates one seller order per seller with database prices, the fee split and snapshots, then empties the cart', async () => {
    settings.PLATFORM_FEE_BPS = 1000; // 10%
    tx.cartItem.findMany.mockResolvedValue([
      { ...line('a', 's1'), quantity: 2 },
      line('b', 's2', { priceKobo: 250_000 }),
      {
        ...line('c', 's1', {
          variants: [
            {
              id: 'v1',
              label: 'L',
              priceKobo: 150_000,
              stock: 1,
              isActive: true,
            },
          ],
        }),
        variantId: 'v1',
      },
    ]);
    const before = Date.now();
    await service.checkout(buyer, dto);

    expect(reserve).toHaveBeenCalledWith(tx, [
      { listingId: 'a', variantId: null, quantity: 2 },
      { listingId: 'b', variantId: null, quantity: 1 },
      { listingId: 'c', variantId: 'v1', quantity: 1 },
    ]);
    const { data } = tx.order.create.mock.calls[0][0];
    expect(data).toMatchObject({
      buyerId: 'buyer',
      institutionId: 'school-a',
      pickupStationId: 'station-1',
      status: OrderStatus.PENDING_PAYMENT,
      paymentMethod: PaymentMethod.CARD,
      subtotalKobo: 600_000,
      totalKobo: 600_000,
      idempotencyKey: dto.idempotencyKey,
    });
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 30 * 60_000,
    );
    const [s1, s2] = data.sellerOrders.create;
    expect(s1).toMatchObject({
      sellerId: 's1',
      subtotalKobo: 350_000,
      platformFeeKobo: 35_000,
      sellerPayoutKobo: 315_000,
    });
    expect(s2).toMatchObject({
      sellerId: 's2',
      subtotalKobo: 250_000,
      platformFeeKobo: 25_000,
      sellerPayoutKobo: 225_000,
    });
    expect(s1.code).not.toBe(s2.code);
    expect(s1.items.create).toEqual([
      {
        listingId: 'a',
        variantId: null,
        titleSnapshot: 'Item a',
        variantLabel: null,
        imageUrl: 'https://img/a.jpg',
        unitPriceKobo: 100_000,
        quantity: 2,
      },
      {
        listingId: 'c',
        variantId: 'v1',
        titleSnapshot: 'Item c',
        variantLabel: 'L',
        imageUrl: 'https://img/c.jpg',
        unitPriceKobo: 150_000,
        quantity: 1,
      },
    ]);
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'buyer' },
    });
  });

  it('retries with fresh codes when a seller-order code already exists', async () => {
    tx.cartItem.findMany.mockResolvedValue([line('a', 's1')]);
    const clash = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    tx.order.create
      .mockRejectedValueOnce(clash)
      .mockResolvedValueOnce({ id: 'order-1', totalKobo: 100_000 });
    await expect(service.checkout(buyer, dto)).resolves.toMatchObject({
      orderId: 'order-1',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('returns the winning order when a request with the same key got there first', async () => {
    tx.cartItem.findMany.mockResolvedValue([]); // the winner already emptied the cart
    prisma.order.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'order-9',
      buyerId: 'buyer',
      totalKobo: 100_000,
    });
    await expect(service.checkout(buyer, dto)).resolves.toMatchObject({
      orderId: 'order-9',
    });
  });
});
