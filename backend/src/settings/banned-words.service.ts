import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  findBannedWords,
  normaliseWords,
  STARTER_BANNED_WORDS,
} from '../moderation/moderation-rules';
import { PrismaService } from '../prisma/prisma.service';

const KEY = 'bannedWords';

// Decisions M4a and M4c: listings using these words wait for an admin before going live. The
// list starts from the M5 prohibited items, and admins edit it in settings.
@Injectable()
export class BannedWordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<string[]> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: KEY },
      select: { value: true },
    });
    return Array.isArray(row?.value)
      ? (row.value as unknown[]).filter(
          (w): w is string => typeof w === 'string',
        )
      : normaliseWords(STARTER_BANNED_WORDS);
  }

  async set(words: string[], actorId: string): Promise<string[]> {
    const before = await this.list();
    const after = normaliseWords(words);
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSetting.upsert({
        where: { key: KEY },
        create: { key: KEY, value: after, updatedById: actorId },
        update: { value: after, updatedById: actorId },
      });
      await this.audit.record(
        {
          actorId,
          action: 'SETTING_CHANGED',
          entityType: 'PlatformSetting',
          entityId: KEY,
          meta: {
            added: after.filter((w) => !before.includes(w)),
            removed: before.filter((w) => !after.includes(w)),
          },
        },
        tx,
      );
    });
    return after;
  }

  async findIn(...texts: (string | undefined)[]): Promise<string[]> {
    return findBannedWords(texts.filter(Boolean).join('\n'), await this.list());
  }
}
