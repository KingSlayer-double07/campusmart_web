import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService, changedFields } from '../audit/audit.service';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { activeWhere, AdminListQueryDto } from './dto/active-toggle.dto';
import { openSellerOrdersWhere } from './open-orders';
import { toggleAction } from './toggle-action';
import {
  AdminInstitutionDto,
  AdminInstitutionPageDto,
  CreateInstitutionDto,
  UpdateInstitutionDto,
} from './dto/institution.dto';

const institutionSelect = {
  id: true,
  name: true,
  domains: true,
  isActive: true,
  createdAt: true,
  _count: { select: { pickupStations: true, users: true } },
} satisfies Prisma.InstitutionSelect;

type InstitutionRow = Prisma.InstitutionGetPayload<{
  select: typeof institutionSelect;
}>;

const toDto = ({ _count, ...row }: InstitutionRow): AdminInstitutionDto => ({
  ...row,
  stationCount: _count.pickupStations,
  userCount: _count.users,
});

@Injectable()
export class AdminInstitutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminListQueryDto): Promise<AdminInstitutionPageDto> {
    const q = query.q?.trim();
    const rows = await this.prisma.institution.findMany({
      where: {
        ...activeWhere(query.status),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { domains: { has: q.toLowerCase().replace(/^@/, '') } },
          ],
        }),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: institutionSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  async create(
    dto: CreateInstitutionDto,
    actorId: string,
  ): Promise<AdminInstitutionDto> {
    const domains = [...new Set(dto.domains)];
    await this.assertNameFree(dto.name);
    await this.assertDomainsFree(domains);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.institution.create({
        data: { name: dto.name, domains },
        select: institutionSelect,
      });
      await this.audit.record(
        {
          actorId,
          action: 'INSTITUTION_CREATED',
          entityType: 'Institution',
          entityId: created.id,
          meta: { name: created.name, domains: created.domains },
        },
        tx,
      );
      return toDto(created);
    });
  }

  async update(
    id: string,
    dto: UpdateInstitutionDto,
    actorId: string,
  ): Promise<AdminInstitutionDto> {
    const current = await this.prisma.institution.findUnique({
      where: { id },
      select: institutionSelect,
    });
    if (!current) throw new NotFoundException('Institution not found');

    const next = {
      name: dto.name,
      domains: dto.domains && [...new Set(dto.domains)],
      isActive: dto.isActive,
    };
    const changes = changedFields(current, next, [
      'name',
      'domains',
      'isActive',
    ]);
    if (Object.keys(changes).length === 0) return toDto(current);

    if (changes.name) await this.assertNameFree(next.name!, id);
    if (changes.domains) await this.assertDomainsFree(next.domains!, id);

    return this.prisma.$transaction(async (tx) => {
      // Switched off, its buyers and agents can't sign in, so nothing in progress could finish
      if (changes.isActive && next.isActive === false) {
        const openOrders = await tx.sellerOrder.count({
          where: openSellerOrdersWhere(id),
        });
        if (openOrders > 0) {
          throw new ConflictException({
            code: 'INSTITUTION_HAS_OPEN_ORDERS',
            message:
              `${current.name} has ${openOrders} order${openOrders === 1 ? '' : 's'} in progress. ` +
              'Switch it off once every order has been collected and its 48-hour dispute window has passed.',
            details: { openOrders },
          });
        }
      }

      const updated = await tx.institution.update({
        where: { id },
        data: {
          ...(changes.name && { name: next.name }),
          ...(changes.domains && { domains: next.domains }),
          ...(changes.isActive && { isActive: next.isActive }),
        },
        select: institutionSelect,
      });
      await this.audit.record(
        {
          actorId,
          action: toggleAction('INSTITUTION', changes, next.isActive),
          entityType: 'Institution',
          entityId: id,
          meta: {
            changes,
            ...(dto.reason && { reason: dto.reason }),
          } as Prisma.InputJsonValue,
        },
        tx,
      );
      return toDto(updated);
    });
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.institution.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `An institution called "${name}" already exists`,
      });
    }
  }

  // Sign-up maps an email to exactly one institution, so two can't share a domain
  private async assertDomainsFree(domains: string[], exceptId?: string) {
    const clash = await this.prisma.institution.findFirst({
      where: {
        domains: { hasSome: domains },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true, name: true, domains: true },
    });
    if (clash) {
      const domain = domains.find((d) => clash.domains.includes(d))!;
      throw new ConflictException({
        code: 'DOMAIN_IN_USE',
        message: `${domain} already belongs to ${clash.name}`,
        details: { domain, institutionId: clash.id },
      });
    }
  }
}
