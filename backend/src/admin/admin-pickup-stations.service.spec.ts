import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPickupStationsService } from './admin-pickup-stations.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

describe('AdminPickupStationsService', () => {
  let service: AdminPickupStationsService;
  const prisma = {
    institution: { findUnique: jest.fn() },
    pickupStation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };

  const hours = [
    { day: 'TUE' as const, open: '09:00', close: '17:00' },
    { day: 'MON' as const, open: '09:00', close: '17:00' },
  ];
  const dto = {
    institutionId: 'i1',
    name: 'Main Gate',
    address: 'Main Gate, University Road',
    contactName: 'Bola Ade',
    contactPhone: '+2348012345678',
    openingHours: hours,
  };
  const row = {
    id: 's1',
    institutionId: 'i1',
    name: 'Main Gate',
    address: dto.address,
    contactName: dto.contactName,
    contactPhone: dto.contactPhone,
    openingHours: [hours[1], hours[0]],
    isActive: true,
    institution: { id: 'i1', name: 'University of Lagos', isActive: true },
    _count: { agents: 1 },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPickupStationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminPickupStationsService);
  });

  it('creates a station with its hours sorted Monday first, and audits it', async () => {
    prisma.institution.findUnique.mockResolvedValue({
      id: 'i1',
      name: 'UNILAG',
    });
    prisma.pickupStation.findFirst.mockResolvedValue(null);
    prisma.pickupStation.create.mockResolvedValue(row);

    const result = await service.create(dto, 'admin-1');

    const { data } = prisma.pickupStation.create.mock.calls[0][0];
    expect(data.openingHours.map((h: { day: string }) => h.day)).toEqual([
      'MON',
      'TUE',
    ]);
    expect(result).toMatchObject({ id: 's1', agentCount: 1 });
    expect(result).not.toHaveProperty('institutionId');
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      actorId: 'admin-1',
      action: 'STATION_CREATED',
      entityType: 'PickupStation',
      entityId: 's1',
    });
  });

  it('rejects an unknown institution with 400 INVALID_REFERENCE', async () => {
    prisma.institution.findUnique.mockResolvedValue(null);
    const error = await service.create(dto, 'a').catch((e: unknown) => e);
    expect((error as HttpException).getStatus()).toBe(400);
    expect(codeOf(error)).toBe('INVALID_REFERENCE');
  });

  it('rejects a second station with the same name at one institution', async () => {
    prisma.institution.findUnique.mockResolvedValue({
      id: 'i1',
      name: 'UNILAG',
    });
    prisma.pickupStation.findFirst.mockResolvedValue({ id: 'other' });
    const error = await service.create(dto, 'a').catch((e: unknown) => e);
    expect((error as HttpException).getStatus()).toBe(409);
    expect(prisma.pickupStation.create).not.toHaveBeenCalled();
  });

  it('updates only what changed and records the before and after', async () => {
    prisma.pickupStation.findUnique.mockResolvedValue(row);
    prisma.pickupStation.update.mockResolvedValue({
      ...row,
      contactPhone: '+2348099999999',
    });
    await service.update(
      's1',
      { contactPhone: '+2348099999999', openingHours: hours },
      'admin-1',
    );
    expect(prisma.pickupStation.update.mock.calls[0][0].data).toEqual({
      contactPhone: '+2348099999999',
    });
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'STATION_UPDATED',
      meta: {
        changes: {
          contactPhone: { from: dto.contactPhone, to: '+2348099999999' },
        },
      },
    });
  });

  it('switching a station off logs STATION_DEACTIVATED with the reason', async () => {
    prisma.pickupStation.findUnique.mockResolvedValue(row);
    prisma.pickupStation.update.mockResolvedValue({ ...row, isActive: false });
    await service.update('s1', { isActive: false, reason: 'Moved' }, 'admin-1');
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'STATION_DEACTIVATED',
      meta: { reason: 'Moved' },
    });
  });
});
