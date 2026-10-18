import { Injectable } from '@nestjs/common';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditPageDto, AuditQueryDto } from './dto/moderation.dto';

// Guide 9.1: every admin mutation and money movement, newest first
@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQueryDto): Promise<AuditPageDto> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.entityType && { entityType: query.entityType }),
        ...(query.entityId && { entityId: query.entityId }),
        ...(query.actorId && { actorId: query.actorId }),
        ...(query.action && { action: query.action }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    // AuditLog keeps a plain actor id, so a user removed later still leaves their entries
    const actors = await this.prisma.user.findMany({
      where: {
        id: {
          in: page.items.map((r) => r.actorId).filter((id) => id !== null),
        },
      },
      select: { id: true, email: true },
    });
    return {
      ...page,
      items: page.items.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actorId: row.actorId,
        actorEmail: actors.find((a) => a.id === row.actorId)?.email ?? null,
        meta: isObject(row.meta) ? row.meta : null,
        createdAt: row.createdAt,
      })),
    };
  }
}

const isObject = (value: Prisma.JsonValue): value is Prisma.JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
