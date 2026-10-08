import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionsService } from './institutions.service';

describe('InstitutionsService', () => {
  let service: InstitutionsService;
  const prisma = { institution: { findUnique: jest.fn() } };

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
    prisma.institution.findUnique.mockResolvedValue(null);
    await expect(service.getInstitutionById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the institution when it exists', async () => {
    prisma.institution.findUnique.mockResolvedValue({ id: 'i1', name: 'X' });
    await expect(service.getInstitutionById('i1')).resolves.toEqual({
      id: 'i1',
      name: 'X',
    });
  });
});
