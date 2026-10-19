import { ConflictException, HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PayoutsService } from '../payments/payouts.service';
import { RefundsService } from '../payments/refunds.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { ProblemsService } from './problems.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

describe('ProblemsService', () => {
  let service: ProblemsService;
  const prisma = {
    sellerOrder: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    dispute: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    problemReport: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const refunds = { refundSellerOrder: jest.fn() };
  const notifications = { notify: jest.fn(), alertAdmins: jest.fn() };
  const buyer = { id: 'b1', role: 'BUYER' } as AuthUser;
  const sellerOrder = (overrides: object = {}) => ({
    id: 'so1',
    code: 'CM-7F3K2Q',
    sellerId: 's1',
    fulfillmentStatus: 'AWAITING_RIDER',
    escrowStatus: 'HELD',
    releaseAt: null,
    order: { status: 'PAID' },
    dispute: null,
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProblemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: notifications },
        { provide: RefundsService, useValue: refunds },
        { provide: PayoutsService, useValue: { release: jest.fn() } },
        {
          provide: CloudinaryService,
          useValue: { requireSettings: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(ProblemsService);
  });

  it('before handover takes the early reasons only, and alerts the admins (C8)', async () => {
    prisma.sellerOrder.findFirst.mockResolvedValue(sellerOrder());
    const wrong = await service
      .report(buyer, 'o1', 'so1', { reason: 'DAMAGED' })
      .catch((e: unknown) => e);
    expect(codeOf(wrong)).toBe('VALIDATION_FAILED');

    prisma.problemReport.create.mockResolvedValue({ id: 'p1' });
    await expect(
      service.report(buyer, 'o1', 'so1', { reason: 'LOST' }),
    ).resolves.toEqual({
      kind: 'PROBLEM',
      id: 'p1',
    });
    expect(notifications.alertAdmins).toHaveBeenCalled();
    expect(prisma.dispute.create).not.toHaveBeenCalled();
  });

  it('after the 48 hours, a dispute is refused', async () => {
    prisma.sellerOrder.findFirst.mockResolvedValue(
      sellerOrder({
        fulfillmentStatus: 'DELIVERED',
        releaseAt: new Date(Date.now() - 1000),
      }),
    );
    const error = await service
      .report(buyer, 'o1', 'so1', { reason: 'DAMAGED' })
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('DISPUTE_WINDOW_CLOSED');
  });

  it('reopens the dispute when the refund itself is refused', async () => {
    prisma.dispute.findUnique.mockResolvedValue({
      id: 'd1',
      status: 'OPEN',
      sellerOrder: {
        id: 'so1',
        code: 'CM-7F3K2Q',
        orderId: 'o1',
        sellerId: 's1',
        deliveryMethod: 'DISPATCH',
        order: { buyerId: 'b1' },
      },
    });
    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    refunds.refundSellerOrder.mockRejectedValue(
      new ConflictException({ code: 'NOT_REFUNDABLE' }),
    );
    const error = await service
      .resolve(
        'd1',
        { outcome: 'REFUND', fault: 'SELLER', note: 'Missing item' },
        'a1',
      )
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('NOT_REFUNDABLE');
    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'OPEN' }),
      }),
    );
  });
});
