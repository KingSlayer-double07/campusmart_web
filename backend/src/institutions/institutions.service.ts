import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { domainCandidates, emailDomain, pickInstitution } from './email-domain';

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllInstitutions() {
    return this.prisma.institution.findMany({ orderBy: { name: 'asc' } });
  }

  async getInstitutionById(id: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id },
    });
    if (!institution) {
      throw new NotFoundException(`Institution with ID ${id} not found`);
    }
    return institution;
  }

  // The institution whose domains contain the email's domain or a parent of it, or null
  async findForEmail(email: string) {
    const domain = emailDomain(email);
    if (!domain) return null;
    const institutions = await this.prisma.institution.findMany({
      where: { domains: { hasSome: domainCandidates(domain) } },
      select: { id: true, name: true, domains: true },
    });
    return pickInstitution(domain, institutions);
  }

  async createInstitution(dto: CreateInstitutionDto) {
    return this.prisma.institution.create({
      data: {
        name: dto.name,
        domains: dto.domains ?? [],
      },
    });
  }
}
