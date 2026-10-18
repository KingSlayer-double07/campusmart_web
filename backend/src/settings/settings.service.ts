import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

// Decision R1a: numbers an admin can change without a deploy. Each starts from its environment
// variable until an admin saves a value; Phase 9 adds the report threshold. Trust weights apply
// at the next nightly recalculation (R1b).
export const SETTINGS = {
  platformFeeBps: {
    env: 'PLATFORM_FEE_BPS',
    min: 0,
    max: 5000,
    label:
      'Platform fee (basis points; 100 = 1%), taken from the seller payout',
  },
  pickupDeadlineDays: {
    env: 'DROP_OFF_DEADLINE_DAYS',
    min: 1,
    max: 14,
    label: 'Days after payment for the rider to collect from the seller',
  },
  lowStockThreshold: {
    env: 'LOW_STOCK_THRESHOLD',
    min: 0,
    max: 100,
    label: 'Sellers are alerted when an item has this many left or fewer',
  },
  trustWeightRating: {
    env: 'TRUST_WEIGHT_RATING',
    min: 0,
    max: 100,
    label: 'Trust score: points for a 5-star average rating',
  },
  trustWeightCompleted: {
    env: 'TRUST_WEIGHT_COMPLETED',
    min: 0,
    max: 100,
    label:
      'Trust score: points when all of the last 50 orders were handed over',
  },
  trustWeightVerified: {
    env: 'TRUST_WEIGHT_VERIFIED',
    min: 0,
    max: 100,
    label: 'Trust score: points for a verified seller',
  },
  trustPenaltySellerFault: {
    env: 'TRUST_PENALTY_SELLER_FAULT',
    min: 0,
    max: 100,
    label:
      'Trust score: points taken off per cancellation or refund that was the seller’s fault in 90 days',
  },
} as const satisfies Record<
  string,
  { env: keyof Env; min: number; max: number; label: string }
>;

export type SettingKey = keyof typeof SETTINGS;
export type Settings = Record<SettingKey, number>;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
  ) {}

  async get(key: SettingKey): Promise<number> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    return typeof row?.value === 'number' ? row.value : this.fromEnv(key);
  }

  async all(): Promise<Settings> {
    const rows = await this.prisma.platformSetting.findMany({
      select: { key: true, value: true },
    });
    const saved = new Map(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(
      (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
        const value = saved.get(key);
        return [key, typeof value === 'number' ? value : this.fromEnv(key)];
      }),
    ) as Settings;
  }

  // Saves the given values; every change goes in the audit log with the admin and old value
  async update(values: Partial<Settings>, actorId: string): Promise<Settings> {
    const current = await this.all();
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(values) as [
        SettingKey,
        number | undefined,
      ][]) {
        if (value === undefined || value === current[key]) continue;
        await tx.platformSetting.upsert({
          where: { key },
          create: { key, value, updatedById: actorId },
          update: { value, updatedById: actorId },
        });
        await this.audit.record(
          {
            actorId,
            action: 'SETTING_CHANGED',
            entityType: 'PlatformSetting',
            entityId: key,
            meta: { from: current[key], to: value },
          },
          tx,
        );
      }
    });
    return this.all();
  }

  private fromEnv(key: SettingKey): number {
    return this.config.get(SETTINGS[key].env, { infer: true });
  }
}
