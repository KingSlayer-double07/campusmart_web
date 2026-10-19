import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryJobsService } from './delivery-jobs.service';
import { HandoverService } from './handover.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

describe('DeliveryJobsService.accept', () => {
  let service: DeliveryJobsService;
  const prisma = {
    deliveryJob: { findFirst: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const rider = {
    id: 'r2',
    role: 'DISPATCH',
    institutionId: 'i1',
  } as AuthUser;
  const hour = 60 * 60 * 1000;
  const window = (sellerOrderId: string) => ({
    sellerOrderId,
    from: new Date(Date.now() + hour),
    to: new Date(Date.now() + 3 * hour),
  });
  // The job row as read first, with its stores as read a moment later
  const jobAsRead = (storeStatus: string) => ({
    id: 'j1',
    status: 'OPEN',
    riderId: null,
    institutionId: 'i1',
    order: {
      sellerOrders: [
        {
          id: 'so1',
          fulfillmentStatus: storeStatus,
          pickupDeadline: new Date(Date.now() + 72 * hour),
        },
      ],
    },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryJobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: HandoverService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(DeliveryJobsService);
  });

  it('a rider who loses the race between the two reads gets 409 JOB_TAKEN, not a window error', async () => {
    // Another rider's accept committed after the job row was read: its store is theirs now
    prisma.deliveryJob.findFirst.mockResolvedValue(jobAsRead('RIDER_ASSIGNED'));
    prisma.deliveryJob.findUnique.mockResolvedValue({ status: 'ASSIGNED' });
    const error = await service
      .accept(rider, 'j1', { windows: [window('so1')] })
      .catch((e: unknown) => e);
    expect((error as HttpException).getStatus()).toBe(409);
    expect(codeOf(error)).toBe('JOB_TAKEN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('windows that don’t match an open job’s stores are still 400 WINDOW_REQUIRED', async () => {
    prisma.deliveryJob.findFirst.mockResolvedValue(jobAsRead('AWAITING_RIDER'));
    prisma.deliveryJob.findUnique.mockResolvedValue({ status: 'OPEN' });
    const error = await service
      .accept(rider, 'j1', { windows: [window('so9')] })
      .catch((e: unknown) => e);
    expect((error as HttpException).getStatus()).toBe(400);
    expect(codeOf(error)).toBe('WINDOW_REQUIRED');
  });
});
