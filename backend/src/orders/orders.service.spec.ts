import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth-user';
import { OrderStatus, UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import * as lifecycle from './order-lifecycle';
import { OrdersService } from './orders.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

const buyer = {
  id: 'buyer',
  role: UserRole.BUYER,
  institutionId: 'school-a',
} as AuthUser;

describe('OrdersService', () => {
  let service: OrdersService;
  const prisma = {
    institution: { findUnique: jest.fn() },
    pickupStation: { findMany: jest.fn() },
    order: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const close = jest.spyOn(lifecycle, 'closeUnpaidOrder');

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn('tx'),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it("reads only the buyer's own orders", async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(service.detail(buyer, 'o1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({
      id: 'o1',
      buyerId: 'buyer',
    });

    prisma.order.findMany.mockResolvedValue([]);
    await service.list(buyer, { limit: 20 });
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
      buyerId: 'buyer',
    });
  });

  it('cancels through the shared close step, scoped to the buyer', async () => {
    close.mockResolvedValue(true);
    prisma.order.findFirst.mockResolvedValue(null);
    await service.cancel(buyer, 'o1').catch(() => undefined);
    expect(close).toHaveBeenCalledWith(
      'tx',
      { id: 'o1', buyerId: 'buyer' },
      OrderStatus.CANCELLED,
      expect.any(Date),
    );
  });

  it('says why an order cannot be cancelled, or 404 when it is not yours', async () => {
    close.mockResolvedValue(false);
    prisma.order.findFirst.mockResolvedValueOnce(null);
    await expect(service.cancel(buyer, 'o1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.order.findFirst.mockResolvedValueOnce({
      status: OrderStatus.EXPIRED,
    });
    const expired = await service.cancel(buyer, 'o1').catch((e: unknown) => e);
    expect(codeOf(expired)).toBe('ORDER_NOT_CANCELLABLE');
    expect((expired as HttpException).message).toMatch(/waiting for payment/);

    // Still PENDING_PAYMENT but the close step refused: a payment completed
    prisma.order.findFirst.mockResolvedValueOnce({
      status: OrderStatus.PENDING_PAYMENT,
    });
    const paid = await service.cancel(buyer, 'o1').catch((e: unknown) => e);
    expect((paid as HttpException).message).toMatch(/has been paid/);
  });

  it("lists active stations at the buyer's school only", async () => {
    prisma.institution.findUnique.mockResolvedValue({ isActive: true });
    prisma.pickupStation.findMany.mockResolvedValue([]);
    await service.pickupStations(buyer);
    expect(prisma.pickupStation.findMany.mock.calls[0][0].where).toEqual({
      institutionId: 'school-a',
      isActive: true,
    });
  });
});
