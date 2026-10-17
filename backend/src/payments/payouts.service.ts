import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import {
  DisputeStatus,
  EscrowStatus,
  FulfillmentStatus,
  PayoutStatus,
} from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PaystackService } from '../paystack/paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatNairaPlain } from './money';
import { payoutReference } from './payment-rules';

const BATCH = 50;
// Decision P9: payouts wait this long after a payout account is set or changed
export const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

// Guide 5.5: escrow is released 48 hours after handover (D11) when there's no open dispute, and
// paid out by Paystack Transfer, one transfer per seller order (P4) of the items less the platform
// fee (P1). The platform absorbs the transfer fee (P3); delivery fees stay with the platform (DX3).
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/15 * * * *', { name: 'release-escrow' })
  async run(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    try {
      const released = await this.releaseDue();
      const sent = await this.sendPending();
      if (released || sent)
        this.logger.log(
          `Released ${released} seller order(s), sent ${sent} payout(s)`,
        );
    } catch (error) {
      this.logger.error(
        `Escrow release failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Step 1 and 2: collected, held, past releaseAt, no open dispute -> RELEASED plus a Payout
  async releaseDue(now = new Date()): Promise<number> {
    let released = 0;
    for (;;) {
      const due = await this.prisma.sellerOrder.findMany({
        where: {
          fulfillmentStatus: FulfillmentStatus.COLLECTED,
          escrowStatus: EscrowStatus.HELD,
          releaseAt: { lte: now },
          OR: [
            { dispute: { is: null } },
            { dispute: { status: { not: DisputeStatus.OPEN } } },
          ],
        },
        orderBy: { releaseAt: 'asc' },
        select: { id: true },
        take: BATCH,
      });
      for (const { id } of due) {
        if (await this.release(id)) released += 1;
      }
      if (due.length < BATCH) return released;
    }
  }

  // Also used when an admin resolves a dispute for the seller (Phase 6): releases at once
  async release(sellerOrderId: string, actorId: string | null = null) {
    return this.prisma.$transaction(async (tx) => {
      const so = await tx.sellerOrder.findUniqueOrThrow({
        where: { id: sellerOrderId },
        select: {
          id: true,
          code: true,
          sellerId: true,
          sellerPayoutKobo: true,
          seller: {
            select: {
              sellerProfile: { select: { paystackRecipientCode: true } },
            },
          },
        },
      });
      const claimed = await tx.sellerOrder.updateMany({
        where: { id: so.id, escrowStatus: EscrowStatus.HELD },
        data: { escrowStatus: EscrowStatus.RELEASED },
      });
      if (claimed.count !== 1) return false;
      const payout = await tx.payout.create({
        data: {
          sellerOrderId: so.id,
          sellerId: so.sellerId,
          amountKobo: so.sellerPayoutKobo,
          reference: payoutReference(so.id, 1),
          status: so.seller.sellerProfile?.paystackRecipientCode
            ? PayoutStatus.PENDING
            : PayoutStatus.AWAITING_ACCOUNT,
        },
      });
      await this.audit.record(
        {
          actorId,
          action: 'ESCROW_RELEASED',
          entityType: 'SellerOrder',
          entityId: so.id,
          meta: {
            payoutId: payout.id,
            amountKobo: payout.amountKobo,
            status: payout.status,
          },
        },
        tx,
      );
      return true;
    });
  }

  // Step 3: one transfer per pending payout, unless the seller's account changed in the last 24
  // hours (P9). Outside the release transaction, so a slow Paystack never holds database locks.
  async sendPending(now = new Date()): Promise<number> {
    const due = await this.prisma.payout.findMany({
      where: { status: PayoutStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      select: { id: true, sellerId: true },
      take: BATCH,
    });
    let sent = 0;
    for (const { id, sellerId } of due) {
      const profile = await this.prisma.sellerProfile.findUnique({
        where: { userId: sellerId },
        select: { paystackRecipientCode: true, payoutAccountChangedAt: true },
      });
      if (!profile?.paystackRecipientCode) {
        await this.prisma.payout.update({
          where: { id },
          data: { status: PayoutStatus.AWAITING_ACCOUNT },
        });
        continue;
      }
      if (
        profile.payoutAccountChangedAt &&
        now.getTime() - profile.payoutAccountChangedAt.getTime() <
          PAYOUT_HOLD_MS
      ) {
        continue;
      }
      if (await this.transfer(id, profile.paystackRecipientCode)) sent += 1;
    }
    return sent;
  }

  private async transfer(
    payoutId: string,
    recipient: string,
  ): Promise<boolean> {
    // Claimed first, so two runs can't send the same payout twice
    const claimed = await this.prisma.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.PENDING },
      data: { status: PayoutStatus.PROCESSING },
    });
    if (claimed.count !== 1) return false;
    const payout = await this.prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      select: {
        id: true,
        amountKobo: true,
        reference: true,
        sellerOrder: { select: { code: true } },
      },
    });
    try {
      const res = await this.paystack.transfer({
        amountKobo: payout.amountKobo,
        recipient,
        reference: payout.reference,
        reason: `CampusMart order ${payout.sellerOrder.code}`,
      });
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { transferCode: res.transfer_code },
      });
      await this.audit.record({
        actorId: null,
        action: 'PAYOUT_SENT',
        entityType: 'Payout',
        entityId: payout.id,
        meta: { reference: payout.reference, transferCode: res.transfer_code },
      });
      return true;
    } catch (error) {
      await this.fail(
        payout.id,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  // Step 4: transfer.success / transfer.failed / transfer.reversed
  async settle(reference: string, success: boolean, reason: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { reference },
      select: { id: true, status: true, sellerId: true, amountKobo: true },
    });
    if (!payout || payout.status === PayoutStatus.PAID) return;
    if (!success) return this.fail(payout.id, reason);
    await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: PayoutStatus.PAID,
        paidAt: new Date(),
        failureReason: null,
      },
    });
    await this.audit.record({
      actorId: null,
      action: 'PAYOUT_PAID',
      entityType: 'Payout',
      entityId: payout.id,
    });
    await this.notifications.notify(payout.sellerId, {
      type: 'PAYOUT_PAID',
      title: 'Payout sent',
      body: `${formatNairaPlain(payout.amountKobo)} is on its way to your bank account.`,
      link: '/sellers/earnings',
    });
  }

  private async fail(payoutId: string, reason: string) {
    const payout = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.FAILED, failureReason: reason },
      select: { id: true, sellerId: true, amountKobo: true },
    });
    await this.audit.record({
      actorId: null,
      action: 'PAYOUT_FAILED',
      entityType: 'Payout',
      entityId: payout.id,
      meta: { reason },
    });
    await this.notifications.alertAdmins({
      type: 'PAYOUT_FAILED',
      title: 'A payout failed',
      body: `${formatNairaPlain(payout.amountKobo)} couldn't be sent: ${reason}. Retry it from Payouts.`,
      link: '/admin/payouts',
      data: { payoutId: payout.id },
    });
  }

  // Guide 9.1 Payouts: an admin retries a failed payout with a fresh reference
  async retry(payoutId: string, actorId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true, attempt: true, sellerOrderId: true },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.FAILED) {
      throw new ConflictException({
        code: 'PAYOUT_NOT_RETRYABLE',
        message: 'Only a failed payout can be retried',
      });
    }
    const attempt = payout.attempt + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.PENDING,
          attempt,
          reference: payoutReference(payout.sellerOrderId, attempt),
          transferCode: null,
          failureReason: null,
        },
      });
      await this.audit.record(
        {
          actorId,
          action: 'PAYOUT_RETRIED',
          entityType: 'Payout',
          entityId: payout.id,
          meta: { attempt },
        },
        tx,
      );
    });
    await this.sendPending();
    return this.prisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
  }

  // Step 5: a seller who has just added an account gets their waiting payouts queued; they go out
  // once the 24-hour hold has passed
  async queueAwaitingAccount(sellerId: string) {
    await this.prisma.payout.updateMany({
      where: { sellerId, status: PayoutStatus.AWAITING_ACCOUNT },
      data: { status: PayoutStatus.PENDING },
    });
  }
}
