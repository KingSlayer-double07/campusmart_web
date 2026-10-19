import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, changedFields } from './audit.service';

describe('AuditService', () => {
  const prisma = { auditLog: { create: jest.fn() } };
  let service: AuditService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('writes who, what and which record', async () => {
    await service.record({
      actorId: 'admin-1',
      action: 'INSTITUTION_CREATED',
      entityType: 'Institution',
      entityId: 'i1',
      meta: { name: 'X' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'INSTITUTION_CREATED',
        entityType: 'Institution',
        entityId: 'i1',
        meta: { name: 'X' },
      },
    });
  });

  it('writes through a transaction client when given one', async () => {
    const tx = { auditLog: { create: jest.fn() } };
    await service.record(
      { actorId: null, action: 'A', entityType: 'T', entityId: 'e' },
      tx as never,
    );
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('changedFields', () => {
  const before = { name: 'A', domains: ['a.edu'], isActive: true };

  it('lists only the fields whose value changed', () => {
    expect(
      changedFields(before, { name: 'A', domains: ['b.edu'] }, [
        'name',
        'domains',
        'isActive',
      ]),
    ).toEqual({ domains: { from: ['a.edu'], to: ['b.edu'] } });
  });

  it('ignores fields that were not sent', () => {
    expect(changedFields(before, {}, ['name', 'domains', 'isActive'])).toEqual(
      {},
    );
  });
});
