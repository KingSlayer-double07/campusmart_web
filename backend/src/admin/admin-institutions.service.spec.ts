import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminInstitutionsService } from './admin-institutions.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

describe('AdminInstitutionsService', () => {
  let service: AdminInstitutionsService;
  const prisma = {
    institution: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    sellerOrder: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };

  const row = {
    id: 'i1',
    name: 'University of Lagos',
    domains: ['unilag.edu.ng'],
    isActive: true,
    createdAt: new Date('2026-10-01'),
    _count: { pickupStations: 2, users: 40 },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminInstitutionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminInstitutionsService);
  });

  describe('list', () => {
    it('pages by cursor and flattens the counts', async () => {
      prisma.institution.findMany.mockResolvedValue([
        row,
        { ...row, id: 'i2' },
      ]);
      const page = await service.list({ limit: 1 });
      expect(page).toEqual({
        items: [
          {
            id: 'i1',
            name: row.name,
            domains: row.domains,
            isActive: true,
            createdAt: row.createdAt,
            stationCount: 2,
            userCount: 40,
          },
        ],
        nextCursor: 'i1',
      });
      expect(prisma.institution.findMany.mock.calls[0][0].take).toBe(2);
    });

    it('filters by status and searches the name or an exact domain', async () => {
      prisma.institution.findMany.mockResolvedValue([]);
      await service.list({
        limit: 20,
        status: 'INACTIVE',
        q: '@UNILAG.edu.ng',
      });
      expect(prisma.institution.findMany.mock.calls[0][0].where).toEqual({
        isActive: false,
        OR: [
          { name: { contains: '@UNILAG.edu.ng', mode: 'insensitive' } },
          { domains: { has: 'unilag.edu.ng' } },
        ],
      });
    });
  });

  describe('create', () => {
    it('creates it and writes INSTITUTION_CREATED with the admin as actor', async () => {
      prisma.institution.findFirst.mockResolvedValue(null);
      prisma.institution.create.mockResolvedValue(row);
      await service.create(
        { name: row.name, domains: ['unilag.edu.ng', 'unilag.edu.ng'] },
        'admin-1',
      );
      expect(prisma.institution.create.mock.calls[0][0].data).toEqual({
        name: row.name,
        domains: ['unilag.edu.ng'],
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-1',
          action: 'INSTITUTION_CREATED',
          entityType: 'Institution',
          entityId: 'i1',
        }),
        prisma,
      );
    });

    it('rejects a domain another institution already has with 409 DOMAIN_IN_USE', async () => {
      prisma.institution.findFirst
        .mockResolvedValueOnce(null) // name is free
        .mockResolvedValueOnce({
          id: 'other',
          name: 'LASU',
          domains: ['lasu.edu.ng'],
        });
      const error = await service
        .create({ name: 'New', domains: ['lasu.edu.ng'] }, 'admin-1')
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
      expect(codeOf(error)).toBe('DOMAIN_IN_USE');
      expect(prisma.institution.create).not.toHaveBeenCalled();
    });

    it('rejects a name that already exists, ignoring case, with 409', async () => {
      prisma.institution.findFirst.mockResolvedValueOnce({ id: 'other' });
      const error = await service
        .create({ name: 'university of lagos', domains: ['x.edu.ng'] }, 'a')
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
      expect(prisma.institution.findFirst.mock.calls[0][0].where.name).toEqual({
        equals: 'university of lagos',
        mode: 'insensitive',
      });
    });
  });

  describe('update', () => {
    it('404s for an unknown institution', async () => {
      prisma.institution.findUnique.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'X' }, 'a'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('writes nothing when nothing changed', async () => {
      prisma.institution.findUnique.mockResolvedValue(row);
      await service.update('i1', { name: row.name, domains: row.domains }, 'a');
      expect(prisma.institution.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses to switch off a school with orders in progress, and says how many', async () => {
      prisma.institution.findUnique.mockResolvedValue(row);
      prisma.sellerOrder.count.mockResolvedValue(3);
      const error = await service
        .update('i1', { isActive: false, reason: 'Term break' }, 'admin-1')
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'INSTITUTION_HAS_OPEN_ORDERS',
        message: expect.stringContaining('has 3 orders in progress'),
        details: { openOrders: 3 },
      });
      expect(prisma.institution.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('does not count orders when only renaming', async () => {
      prisma.institution.findUnique.mockResolvedValue(row);
      prisma.institution.findFirst.mockResolvedValue(null);
      prisma.institution.update.mockResolvedValue({ ...row, name: 'UNILAG' });
      await service.update('i1', { name: 'UNILAG' }, 'a');
      expect(prisma.sellerOrder.count).not.toHaveBeenCalled();
    });

    it('switching it off logs INSTITUTION_DEACTIVATED with the reason', async () => {
      prisma.institution.findUnique.mockResolvedValue(row);
      prisma.sellerOrder.count.mockResolvedValue(0);
      prisma.institution.update.mockResolvedValue({ ...row, isActive: false });
      const result = await service.update(
        'i1',
        { isActive: false, reason: 'Term break' },
        'admin-1',
      );
      expect(result.isActive).toBe(false);
      expect(prisma.institution.update.mock.calls[0][0].data).toEqual({
        isActive: false,
      });
      expect(audit.record).toHaveBeenCalledWith(
        {
          actorId: 'admin-1',
          action: 'INSTITUTION_DEACTIVATED',
          entityType: 'Institution',
          entityId: 'i1',
          meta: {
            changes: { isActive: { from: true, to: false } },
            reason: 'Term break',
          },
        },
        prisma,
      );
    });

    it('checks new domains against other institutions only', async () => {
      prisma.institution.findUnique.mockResolvedValue(row);
      prisma.institution.findFirst.mockResolvedValue(null);
      prisma.institution.update.mockResolvedValue(row);
      await service.update(
        'i1',
        { domains: ['unilag.edu.ng', 'staff.unilag.edu.ng'] },
        'a',
      );
      expect(prisma.institution.findFirst.mock.calls[0][0].where).toEqual({
        domains: { hasSome: ['unilag.edu.ng', 'staff.unilag.edu.ng'] },
        id: { not: 'i1' },
      });
      expect(audit.record.mock.calls[0][0].action).toBe('INSTITUTION_UPDATED');
    });
  });
});
