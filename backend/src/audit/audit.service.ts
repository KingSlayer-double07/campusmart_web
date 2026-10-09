import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  actorId: string | null; // null = system job
  action: string; // 'INSTITUTION_CREATED', 'ESCROW_RELEASED', ...
  entityType: string;
  entityId: string;
  meta?: Prisma.InputJsonValue;
}

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

// The fields whose value differs between two versions of a record, as { field: { from, to } }.
// Arrays and JSON are compared by value.
export function changedFields<T extends object>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
): FieldChanges {
  const changes: FieldChanges = {};
  for (const field of fields) {
    if (!(field in after) || after[field] === undefined) continue;
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return changes;
}

// Every admin mutation and every money movement writes one row (guide 5.5, 6.1, 9.1).
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, db: Db = this.prisma) {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        meta: entry.meta,
      },
    });
  }
}
