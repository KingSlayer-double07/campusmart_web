import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { CursorQueryDto, cursorArgs, toPage } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PaystackService,
  type PaystackBank,
} from '../paystack/paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BankDto,
  PayoutAccountDto,
  PayoutPageDto,
  SetPayoutAccountDto,
} from './dto/payments.dto';
import { PAYOUT_HOLD_MS, PayoutsService } from './payouts.service';

const BANKS_TTL_MS = 24 * 60 * 60 * 1000;

// Guide 5.4: where a seller's payouts go. Paystack checks the name on the account and holds the
// recipient; CampusMart keeps the bank, the last 4 digits and the name, never the full number.
@Injectable()
export class PayoutAccountsService {
  private banksCache?: { at: number; banks: PaystackBank[] };

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly payouts: PayoutsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // Cached for 24 hours (guide 5.4)
  async banks(): Promise<BankDto[]> {
    if (!this.banksCache || Date.now() - this.banksCache.at > BANKS_TTL_MS) {
      const banks = await this.paystack.banks();
      this.banksCache = {
        at: Date.now(),
        banks: banks.map((b) => ({ name: b.name, code: b.code })),
      };
    }
    return this.banksCache.banks;
  }

  async setAccount(
    user: AuthUser,
    dto: SetPayoutAccountDto,
  ): Promise<PayoutAccountDto> {
    const bank = (await this.banks()).find((b) => b.code === dto.bankCode);
    if (!bank) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Choose your bank from the list',
      });
    }
    const resolved = await this.paystack.resolveAccount(
      dto.accountNumber,
      dto.bankCode,
    );
    const recipient = await this.paystack.createRecipient({
      name: resolved.account_name,
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
    });
    const now = new Date();
    const profile = await this.prisma.$transaction(async (tx) => {
      const before = await tx.sellerProfile.findUnique({
        where: { userId: user.id },
        select: { payoutBankName: true, payoutAccountLast4: true },
      });
      const saved = await tx.sellerProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          payoutBankName: bank.name,
          payoutBankCode: bank.code,
          payoutAccountLast4: dto.accountNumber.slice(-4),
          payoutAccountName: resolved.account_name,
          paystackRecipientCode: recipient.recipient_code,
          payoutAccountChangedAt: now,
        },
        update: {
          payoutBankName: bank.name,
          payoutBankCode: bank.code,
          payoutAccountLast4: dto.accountNumber.slice(-4),
          payoutAccountName: resolved.account_name,
          paystackRecipientCode: recipient.recipient_code,
          payoutAccountChangedAt: now,
        },
        select: payoutAccountSelect,
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'PAYOUT_ACCOUNT_SET',
          entityType: 'SellerProfile',
          entityId: user.id,
          meta: {
            from: before?.payoutAccountLast4
              ? `${before.payoutBankName} ••${before.payoutAccountLast4}`
              : null,
            to: `${bank.name} ••${dto.accountNumber.slice(-4)}`,
          },
        },
        tx,
      );
      return saved;
    });
    await this.payouts.queueAwaitingAccount(user.id);
    // Decision P9: say so, in the app and by email, so a hijacked account is noticed
    await this.notifications.notify(user.id, {
      type: 'PAYOUT_ACCOUNT_CHANGED',
      title: 'Your payout account was changed',
      body: `Payouts now go to ${bank.name} ••${dto.accountNumber.slice(-4)} (${resolved.account_name}). They start again in 24 hours. If this wasn't you, change your password and contact support now.`,
      link: '/sellers/payouts',
    });
    return toAccountDto(profile);
  }

  async account(userId: string): Promise<PayoutAccountDto> {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: payoutAccountSelect,
    });
    return toAccountDto(profile);
  }

  async list(userId: string, query: CursorQueryDto): Promise<PayoutPageDto> {
    const rows = await this.prisma.payout.findMany({
      where: { sellerId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        amountKobo: true,
        status: true,
        failureReason: true,
        createdAt: true,
        paidAt: true,
        sellerOrder: { select: { code: true } },
      },
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return {
      ...page,
      items: page.items.map(({ sellerOrder, ...p }) => ({
        ...p,
        sellerOrderCode: sellerOrder.code,
      })),
    };
  }
}

const payoutAccountSelect = {
  payoutBankName: true,
  payoutAccountLast4: true,
  payoutAccountName: true,
  paystackRecipientCode: true,
  payoutAccountChangedAt: true,
} as const;

function toAccountDto(
  profile: {
    payoutBankName: string | null;
    payoutAccountLast4: string | null;
    payoutAccountName: string | null;
    paystackRecipientCode: string | null;
    payoutAccountChangedAt: Date | null;
  } | null,
): PayoutAccountDto {
  if (!profile?.paystackRecipientCode) {
    return {
      bankName: null,
      accountLast4: null,
      accountName: null,
      holdUntil: null,
    };
  }
  const holdUntil = profile.payoutAccountChangedAt
    ? new Date(profile.payoutAccountChangedAt.getTime() + PAYOUT_HOLD_MS)
    : null;
  return {
    bankName: profile.payoutBankName,
    accountLast4: profile.payoutAccountLast4,
    accountName: profile.payoutAccountName,
    holdUntil: holdUntil && holdUntil > new Date() ? holdUntil : null,
  };
}
