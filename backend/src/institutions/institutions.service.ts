import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { domainCandidates, emailDomain, pickInstitution } from './email-domain';

const publicSelect = {
  id: true,
  name: true,
  domains: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Public (sign-up and waitlist pages): switched-off institutions are hidden
  async getAllInstitutions() {
    return this.prisma.institution.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: publicSelect,
    });
  }

  async getInstitutionById(id: string) {
    const institution = await this.prisma.institution.findFirst({
      where: { id, isActive: true },
      select: publicSelect,
    });
    if (!institution) {
      throw new NotFoundException(`Institution with ID ${id} not found`);
    }
    return institution;
  }

  // The institution whose domains contain the email's domain or a parent of it, or null.
  // Inactive institutions still match, so sign-up can say the school is switched off.
  async findForEmail(email: string) {
    const domain = emailDomain(email);
    if (!domain) return null;
    const institutions = await this.prisma.institution.findMany({
      where: { domains: { hasSome: domainCandidates(domain) } },
      select: { id: true, name: true, domains: true, isActive: true },
    });
    return pickInstitution(domain, institutions);
  }
}
