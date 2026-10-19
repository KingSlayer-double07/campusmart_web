import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService, changedFields } from '../audit/audit.service';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toggleAction } from './toggle-action';
import { activeWhere } from './dto/active-toggle.dto';
import {
  AdminCampusPlaceDto,
  AdminCampusPlacePageDto,
  CreateCampusPlaceDto,
  ListCampusPlacesQueryDto,
  UpdateCampusPlaceDto,
} from './dto/campus-place.dto';

const placeSelect = {
  id: true,
  name: true,
  isActive: true,
  institution: { select: { id: true, name: true, isActive: true } },
  _count: { select: { orders: true } },
} satisfies Prisma.CampusPlaceSelect;

type PlaceRow = Prisma.CampusPlaceGetPayload<{ select: typeof placeSelect }>;

const toDto = ({ _count, ...row }: PlaceRow): AdminCampusPlaceDto => ({
  ...row,
  orderCount: _count.orders,
});

// Places buyers pick as the delivery destination (decision DF3)
@Injectable()
export class AdminCampusPlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListCampusPlacesQueryDto,
  ): Promise<AdminCampusPlacePageDto> {
    const q = query.q?.trim();
    const rows = await this.prisma.campusPlace.findMany({
      where: {
        ...activeWhere(query.status),
        ...(query.institutionId && { institutionId: query.institutionId }),
        ...(q && { name: { contains: q, mode: 'insensitive' } }),
      },
      orderBy: [
        { institution: { name: 'asc' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
      select: placeSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  async create(
    dto: CreateCampusPlaceDto,
    actorId: string,
  ): Promise<AdminCampusPlaceDto> {
    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
      select: { id: true, name: true },
    });
    if (!institution) {
      throw new BadRequestException({
        code: 'INVALID_REFERENCE',
        message: "That institution doesn't exist",
        details: { field: 'institutionId' },
      });
    }
    await this.assertNameFree(institution, dto.name);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.campusPlace.create({
        data: { institutionId: institution.id, name: dto.name },
        select: placeSelect,
      });
      await this.audit.record(
        {
          actorId,
          action: 'PLACE_CREATED',
          entityType: 'CampusPlace',
          entityId: created.id,
          meta: { name: created.name, institutionId: institution.id },
        },
        tx,
      );
      return toDto(created);
    });
  }

  async update(
    id: string,
    dto: UpdateCampusPlaceDto,
    actorId: string,
  ): Promise<AdminCampusPlaceDto> {
    const current = await this.prisma.campusPlace.findUnique({
      where: { id },
      select: placeSelect,
    });
    if (!current) throw new NotFoundException('Campus place not found');

    const next = { name: dto.name, isActive: dto.isActive };
    const changes = changedFields(current, next, ['name', 'isActive']);
    if (Object.keys(changes).length === 0) return toDto(current);
    if (changes.name)
      await this.assertNameFree(current.institution, next.name!, id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.campusPlace.update({
        where: { id },
        data: {
          ...(changes.name && { name: next.name }),
          ...(changes.isActive && { isActive: next.isActive }),
        },
        select: placeSelect,
      });
      await this.audit.record(
        {
          actorId,
          action: toggleAction('PLACE', changes, next.isActive),
          entityType: 'CampusPlace',
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

  private async assertNameFree(
    institution: { id: string; name: string },
    name: string,
    exceptId?: string,
  ) {
    const clash = await this.prisma.campusPlace.findFirst({
      where: {
        institutionId: institution.id,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `${institution.name} already has a place called "${name}"`,
      });
    }
  }
}
