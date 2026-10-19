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
import { OpeningHoursDto, sortByWeekday } from './dto/opening-hours.dto';
import {
  AdminPickupStationDto,
  AdminPickupStationPageDto,
  CreatePickupStationDto,
  ListPickupStationsQueryDto,
  UpdatePickupStationDto,
} from './dto/pickup-station.dto';

const stationSelect = {
  id: true,
  institutionId: true,
  name: true,
  address: true,
  contactName: true,
  contactPhone: true,
  openingHours: true,
  isActive: true,
  institution: { select: { id: true, name: true, isActive: true } },
  _count: { select: { agents: true } },
} satisfies Prisma.PickupStationSelect;

type StationRow = Prisma.PickupStationGetPayload<{
  select: typeof stationSelect;
}>;

const toDto = ({
  _count,
  institutionId: _institutionId,
  ...row
}: StationRow): AdminPickupStationDto => ({
  ...row,
  openingHours: row.openingHours as unknown as OpeningHoursDto[],
  agentCount: _count.agents,
});

const EDITABLE = [
  'name',
  'address',
  'contactName',
  'contactPhone',
  'openingHours',
  'isActive',
] as const;

@Injectable()
export class AdminPickupStationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListPickupStationsQueryDto,
  ): Promise<AdminPickupStationPageDto> {
    const q = query.q?.trim();
    const rows = await this.prisma.pickupStation.findMany({
      where: {
        ...activeWhere(query.status),
        ...(query.institutionId && { institutionId: query.institutionId }),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [
        { institution: { name: 'asc' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
      select: stationSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  async create(
    dto: CreatePickupStationDto,
    actorId: string,
  ): Promise<AdminPickupStationDto> {
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
      const created = await tx.pickupStation.create({
        data: {
          institutionId: institution.id,
          name: dto.name,
          address: dto.address,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          openingHours: sortByWeekday(dto.openingHours).map(plainHours),
        },
        select: stationSelect,
      });
      await this.audit.record(
        {
          actorId,
          action: 'STATION_CREATED',
          entityType: 'PickupStation',
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
    dto: UpdatePickupStationDto,
    actorId: string,
  ): Promise<AdminPickupStationDto> {
    const current = await this.prisma.pickupStation.findUnique({
      where: { id },
      select: stationSelect,
    });
    if (!current) throw new NotFoundException('Pickup station not found');

    const next = {
      name: dto.name,
      address: dto.address,
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      openingHours:
        dto.openingHours && sortByWeekday(dto.openingHours).map(plainHours),
      isActive: dto.isActive,
    };
    const changes = changedFields(current, next, EDITABLE);
    if (Object.keys(changes).length === 0) return toDto(current);

    if (changes.name)
      await this.assertNameFree(current.institution, next.name!, id);

    const data: Prisma.PickupStationUpdateInput = {};
    for (const field of EDITABLE) {
      if (changes[field]) Object.assign(data, { [field]: next[field] });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pickupStation.update({
        where: { id },
        data,
        select: stationSelect,
      });
      await this.audit.record(
        {
          actorId,
          action: toggleAction('STATION', changes, next.isActive),
          entityType: 'PickupStation',
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
    const clash = await this.prisma.pickupStation.findFirst({
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
        message: `${institution.name} already has a station called "${name}"`,
      });
    }
  }
}

// Stored as plain JSON objects in a fixed key order
const plainHours = ({ day, open, close }: OpeningHoursDto) => ({
  day,
  open,
  close,
});
