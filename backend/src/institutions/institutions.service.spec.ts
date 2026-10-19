import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionsService } from './institutions.service';

describe('InstitutionsService', () => {
  let service: InstitutionsService;
  const prisma = {
    institution: { findFirst: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        InstitutionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(InstitutionsService);
  });

  it('throws NotFoundException instead of returning null', async () => {
    prisma.institution.findFirst.mockResolvedValue(null);
    await expect(service.getInstitutionById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the institution when it exists', async () => {
    prisma.institution.findFirst.mockResolvedValue({ id: 'i1', name: 'X' });
    await expect(service.getInstitutionById('i1')).resolves.toEqual({
      id: 'i1',
      name: 'X',
    });
  });

  it('hides switched-off institutions from the public list and lookup', async () => {
    prisma.institution.findMany.mockResolvedValue([]);
    prisma.institution.findFirst.mockResolvedValue(null);
    await service.getAllInstitutions();
    await service.getInstitutionById('i1').catch(() => undefined);
    expect(prisma.institution.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
    });
    expect(prisma.institution.findFirst.mock.calls[0][0].where).toEqual({
      id: 'i1',
      isActive: true,
    });
  });

  it('still matches an inactive institution from an email, so sign-up can explain', async () => {
    prisma.institution.findMany.mockResolvedValue([
      { id: 'i1', name: 'X', domains: ['x.edu.ng'], isActive: false },
    ]);
    await expect(service.findForEmail('a@x.edu.ng')).resolves.toMatchObject({
      id: 'i1',
      isActive: false,
    });
    expect(
      prisma.institution.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty('isActive');
  });
});
