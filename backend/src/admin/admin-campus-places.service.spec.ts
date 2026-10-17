import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCampusPlacesService } from './admin-campus-places.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

describe('AdminCampusPlacesService', () => {
  let service: AdminCampusPlacesService;
  const prisma = {
    institution: { findUnique: jest.fn() },
    campusPlace: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const row = {
    id: 'p1',
    name: 'Moremi Hall',
    isActive: true,
    institution: { id: 'i1', name: 'University of Lagos', isActive: true },
    _count: { orders: 2 },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminCampusPlacesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminCampusPlacesService);
  });

  it('adds a place to an institution and records who did it', async () => {
    prisma.institution.findUnique.mockResolvedValue({
      id: 'i1',
      name: 'University of Lagos',
    });
    prisma.campusPlace.findFirst.mockResolvedValue(null);
    prisma.campusPlace.create.mockResolvedValue(row);
    const created = await service.create(
      { institutionId: 'i1', name: 'Moremi Hall' },
      'admin-1',
    );
    expect(created).toEqual({
      id: 'p1',
      name: 'Moremi Hall',
      isActive: true,
      institution: row.institution,
      orderCount: 2,
    });
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      actorId: 'admin-1',
      action: 'PLACE_CREATED',
      entityType: 'CampusPlace',
      entityId: 'p1',
    });
  });

  it('refuses an unknown institution or a name the school already has', async () => {
    prisma.institution.findUnique.mockResolvedValue(null);
    expect(
      codeOf(
        await service
          .create({ institutionId: 'nope', name: 'Moremi Hall' }, 'admin-1')
          .catch((e: unknown) => e),
      ),
    ).toBe('INVALID_REFERENCE');

    prisma.institution.findUnique.mockResolvedValue({
      id: 'i1',
      name: 'University of Lagos',
    });
    prisma.campusPlace.findFirst.mockResolvedValue({ id: 'p0' });
    expect(
      codeOf(
        await service
          .create({ institutionId: 'i1', name: 'moremi hall' }, 'admin-1')
          .catch((e: unknown) => e),
      ),
    ).toBe('CONFLICT');
    expect(prisma.campusPlace.findFirst.mock.calls[0][0].where).toMatchObject({
      institutionId: 'i1',
      name: { equals: 'moremi hall', mode: 'insensitive' },
    });
    expect(prisma.campusPlace.create).not.toHaveBeenCalled();
  });

  it('switching a place off is logged with its reason; no change writes nothing', async () => {
    prisma.campusPlace.findUnique.mockResolvedValue(row);
    prisma.campusPlace.update.mockResolvedValue({ ...row, isActive: false });
    await service.update(
      'p1',
      { isActive: false, reason: 'Hall closed for repairs' },
      'admin-1',
    );
    expect(prisma.campusPlace.update.mock.calls[0][0].data).toEqual({
      isActive: false,
    });
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'PLACE_DEACTIVATED',
      meta: { reason: 'Hall closed for repairs' },
    });

    jest.clearAllMocks();
    prisma.campusPlace.findUnique.mockResolvedValue(row);
    await service.update('p1', { name: 'Moremi Hall' }, 'admin-1');
    expect(prisma.campusPlace.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
