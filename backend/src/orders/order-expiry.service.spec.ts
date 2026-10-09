import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import * as lifecycle from './order-lifecycle';
import { OrderExpiryService } from './order-expiry.service';

describe('OrderExpiryService', () => {
  let service: OrderExpiryService;
  let env = 'development';
  const prisma = { order: { findMany: jest.fn() }, $transaction: jest.fn() };
  const close = jest.spyOn(lifecycle, 'closeUnpaidOrder');

  beforeEach(async () => {
    jest.clearAllMocks();
    env = 'development';
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn('tx'),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderExpiryService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => env } },
      ],
    }).compile();
    service = moduleRef.get(OrderExpiryService);
  });

  it('expires each unpaid order past expiresAt, counting only the ones it closed', async () => {
    const now = new Date('2026-10-09T12:00:00Z');
    prisma.order.findMany.mockResolvedValueOnce([{ id: 'o1' }, { id: 'o2' }]);
    close.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // o2 was paid meanwhile

    await expect(service.expireDue(now)).resolves.toBe(1);
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
      AND: [lifecycle.unpaidOrderWhere(), { expiresAt: { lt: now } }],
    });
    expect(close).toHaveBeenCalledWith(
      'tx',
      { id: 'o1', expiresAt: { lt: now } },
      OrderStatus.EXPIRED,
      now,
    );
  });

  it('works through more than one batch', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => ({ id: `o${i}` })),
      )
      .mockResolvedValueOnce([{ id: 'last' }]);
    close.mockResolvedValue(true);
    await expect(service.expireDue()).resolves.toBe(101);
    expect(prisma.order.findMany).toHaveBeenCalledTimes(2);
  });

  it('does nothing on its timer under test, and never throws from the timer', async () => {
    env = 'test';
    await service.run();
    expect(prisma.order.findMany).not.toHaveBeenCalled();

    env = 'production';
    prisma.order.findMany.mockRejectedValue(new Error('database down'));
    await expect(service.run()).resolves.toBeUndefined();
  });
});
