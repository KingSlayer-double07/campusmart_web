import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import type { Env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import {
  DeliveryMethod,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { openDeliveryJob } from '../dispatch/job-state';
import { reserveStock } from '../orders/order-stock';
import {
  PaystackService,
  type PaystackTransaction,
} from '../paystack/paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { formatNairaPlain } from './money';
import {
  chargeProblem,
  channelsFor,
  enabledMethods,
  fulfilmentOnPayment,
  paymentReference,
} from './payment-rules';
import { PayoutsService } from './payouts.service';
import { RefundsService } from './refunds.service';

export interface StartedPayment {
  authorizationUrl: string;
  reference: string;
}

export interface PaystackEvent {
  event: string;
  data: Record<string, unknown>;
}

const dateFmt = new Intl.DateTimeFormat('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Lagos',
});

type Tx = Prisma.TransactionClient;

// Guide Phase 5: money moves only on a signature-checked webhook (or the verify fallback, which
// asks Paystack itself), never on a browser redirect
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly refunds: RefundsService,
    private readonly payouts: PayoutsService,
  ) {}

  get enabled(): boolean {
    return this.paystack.enabled;
  }

  methods(): PaymentMethod[] {
    return enabledMethods(
      this.config.get('PAYSTACK_WALLET_CHANNELS', { infer: true }),
    );
  }

  assertMethodAvailable(method: PaymentMethod): void {
    if (!this.methods().includes(method)) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_UNAVAILABLE',
        message:
          "That way of paying isn't available yet. Choose card or bank transfer.",
      });
    }
  }

  // Guide 5.1: a Paystack payment for the whole order, a new reference each attempt (P7). The
  // callback goes to the frontend page, which only polls; it never marks anything paid.
  async start(orderId: string, email: string): Promise<StartedPayment> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        totalKobo: true,
        paymentMethod: true,
        _count: { select: { payments: true } },
      },
    });
    const attempt = order._count.payments + 1;
    const reference = paymentReference(order.id, attempt);
    const started = await this.paystack.initialize({
      email,
      amountKobo: order.totalKobo,
      reference,
      callbackUrl: `${this.config.get('APP_URL', { infer: true })}/order-confirmation?orderId=${order.id}`,
      channels: channelsFor(order.paymentMethod),
      metadata: { orderId: order.id },
    });
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        attempt,
        reference,
        amountKobo: order.totalKobo,
        authorizationUrl: started.authorization_url,
      },
    });
    return { authorizationUrl: started.authorization_url, reference };
  }

  // Checkout step 8: the payment page for an order waiting for payment. A resent checkout gets the
  // same page back instead of a new attempt. If Paystack can't be reached the order still stands
  // and the buyer can try again from it (P7).
  async pageFor(
    order: { id: string; status: OrderStatus },
    email: string,
  ): Promise<StartedPayment | null> {
    if (!this.enabled || order.status !== OrderStatus.PENDING_PAYMENT)
      return null;
    const pending = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        status: PaymentStatus.PENDING,
        authorizationUrl: { not: null },
      },
      orderBy: { attempt: 'desc' },
      select: { authorizationUrl: true, reference: true },
    });
    if (pending?.authorizationUrl) {
      return {
        authorizationUrl: pending.authorizationUrl,
        reference: pending.reference,
      };
    }
    try {
      return await this.start(order.id, email);
    } catch (error) {
      this.logger.error(
        `Couldn't start a payment for order ${order.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  // Decision P7: "Try again" on the same order until it expires
  async retry(user: AuthUser, orderId: string): Promise<StartedPayment> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, buyerId: user.id },
      select: { status: true, expiresAt: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.status !== OrderStatus.PENDING_PAYMENT ||
      order.expiresAt <= new Date()
    ) {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message:
          order.status === OrderStatus.PAID
            ? 'This order is already paid'
            : 'This order is no longer waiting for payment',
      });
    }
    return this.start(orderId, user.email);
  }

  // Guide 5.3: the confirmation page asks once if the webhook hasn't arrived after 10 seconds
  async verifyForBuyer(user: AuthUser, reference: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { reference, order: { buyerId: user.id } },
      select: { orderId: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const data = await this.paystack.verify(reference);
    if (data.status === 'success') await this.chargeSucceeded(data);
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      select: { id: true, status: true },
    });
    return { orderId: order.id, status: order.status };
  }

  async handleEvent(event: PaystackEvent): Promise<void> {
    const data = event.data;
    switch (event.event) {
      case 'charge.success':
        return this.chargeSucceeded(data as unknown as PaystackTransaction);
      case 'transfer.success':
      case 'transfer.failed':
      case 'transfer.reversed':
        return this.payouts.settle(
          typeof data.reference === 'string' ? data.reference : '',
          event.event === 'transfer.success',
          typeof data.reason === 'string' ? data.reason : event.event,
        );
      case 'refund.processed':
      case 'refund.failed':
        return this.refunds.settle(
          typeof data.id === 'number' || typeof data.id === 'string'
            ? String(data.id)
            : '',
          event.event === 'refund.processed',
          typeof data.status === 'string' ? data.status : undefined,
        );
      default:
        this.logger.log(`Ignoring Paystack event ${event.event}`);
    }
  }

  // Guide 5.2 step 5: one idempotent handler for the webhook and the verify fallback
  async chargeSucceeded(data: PaystackTransaction): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { reference: String(data.reference ?? '') },
      select: {
        id: true,
        orderId: true,
        amountKobo: true,
        status: true,
      },
    });
    if (!payment) {
      this.logger.warn(
        `charge.success for unknown reference ${data.reference}`,
      );
      return;
    }
    if (payment.status === PaymentStatus.COMPLETED) return; // a replay

    // 5b: exactly what we asked for, or it doesn't count
    const problem = chargeProblem(payment.amountKobo, data);
    if (problem) {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.COMPLETED } },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: problem,
          rawEvent: data as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.record({
        actorId: null,
        action: 'PAYMENT_MISMATCH',
        entityType: 'Payment',
        entityId: payment.id,
        meta: { problem, reference: data.reference },
      });
      await this.notifications.alertAdmins({
        type: 'PAYMENT_MISMATCH',
        title: 'A payment needs checking',
        body: `Paystack reported ${data.reference} with ${problem}. The order was not marked paid.`,
        data: { paymentId: payment.id, orderId: payment.orderId },
      });
      return;
    }

    const paidAt = data.paid_at ? new Date(data.paid_at) : new Date();
    const outcome = await this.prisma.$transaction((tx) =>
      this.recordPaid(tx, payment.id, payment.orderId, data, paidAt),
    );
    if (outcome === 'replayed') return;
    if (outcome === 'already-paid' || outcome === 'stock-gone') {
      await this.refunds.refundPayment(
        payment.id,
        outcome === 'already-paid' ? 'PAID_TWICE' : 'PAID_AFTER_STOCK_GONE',
      );
      if (outcome === 'already-paid') {
        await this.notifications.alertAdmins({
          type: 'PAID_TWICE',
          title: 'An order was paid twice',
          body: `A second payment (${data.reference}) arrived for an order that was already paid. It is being refunded.`,
          data: { orderId: payment.orderId },
        });
      }
      return;
    }
    await this.announcePaid(payment.orderId);
  }

  // 5c and 5d in one transaction. The payment row is claimed first, so a replay racing this one
  // does nothing.
  private async recordPaid(
    tx: Tx,
    paymentId: string,
    orderId: string,
    data: PaystackTransaction,
    paidAt: Date,
  ): Promise<'paid' | 'replayed' | 'already-paid' | 'stock-gone'> {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: { not: PaymentStatus.COMPLETED } },
      data: {
        status: PaymentStatus.COMPLETED,
        paidAt,
        channel: data.channel ?? null,
        feesKobo: typeof data.fees === 'number' ? data.fees : null,
        rawEvent: data as unknown as Prisma.InputJsonValue,
      },
    });
    if (claimed.count !== 1) return 'replayed';

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        institutionId: true,
        payments: {
          where: { status: PaymentStatus.COMPLETED, id: { not: paymentId } },
          select: { id: true },
        },
        sellerOrders: {
          select: {
            id: true,
            deliveryMethod: true,
            items: {
              select: { listingId: true, variantId: true, quantity: true },
            },
          },
        },
      },
    });
    if (order.status === OrderStatus.PAID || order.payments.length > 0) {
      return 'already-paid';
    }
    // 5d: an order that expired (or was cancelled) before the money came gets its stock back if
    // it's still there; otherwise the whole payment is refunded
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      try {
        await reserveStock(
          tx,
          order.sellerOrders.flatMap((so) => so.items),
        );
      } catch (error) {
        if (error instanceof ConflictException) return 'stock-gone';
        throw error;
      }
    }

    const days = {
      pickupDeadlineDays: await this.settings.get('pickupDeadlineDays'),
      buyerCollectDays: this.config.get('BUYER_COLLECT_DAYS', { infer: true }),
    };
    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID, paidAt },
    });
    for (const so of order.sellerOrders) {
      await tx.sellerOrder.update({
        where: { id: so.id },
        data: {
          escrowStatus: 'HELD',
          ...fulfilmentOnPayment(so.deliveryMethod, paidAt, days),
          cancelledAt: null,
          cancelReason: null,
        },
      });
    }
    // Phase 6 (DF8): the delivery job opens to riders with the payment
    await openDeliveryJob(tx, {
      id: orderId,
      institutionId: order.institutionId,
    });
    await this.audit.record(
      {
        actorId: null,
        action: 'ORDER_PAID',
        entityType: 'Order',
        entityId: orderId,
        meta: { reference: data.reference, amountKobo: data.amount },
      },
      tx,
    );
    return 'paid';
  }

  // 5e: each seller hears about their order, the buyer about the payment
  private async announcePaid(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        buyerId: true,
        totalKobo: true,
        institutionId: true,
        deliveryJob: { select: { id: true } },
        sellerOrders: {
          select: {
            sellerId: true,
            code: true,
            deliveryMethod: true,
            pickupDeadline: true,
            dropOffDeadline: true,
          },
        },
      },
    });
    for (const so of order.sellerOrders) {
      const by = so.pickupDeadline ?? so.dropOffDeadline;
      const when = by ? dateFmt.format(by) : 'soon';
      const body =
        so.deliveryMethod === DeliveryMethod.SELLER_PICKUP
          ? `The buyer will collect it from you by ${when}. Ask for their code when they come.`
          : so.deliveryMethod === DeliveryMethod.DISPATCH
            ? `A CampusMart rider will collect it from you by ${when}. You'll see when they're coming once one accepts.`
            : `Drop it at the pickup station by ${when}.`;
      await this.notifications.notify(so.sellerId, {
        type: 'NEW_ORDER',
        title: `New order ${so.code}`,
        body,
        link: '/sellers/orders',
      });
    }
    // Decision DX2: every active rider at the campus sees the new job; the first to accept takes it
    if (order.deliveryJob) {
      const riders = await this.prisma.user.findMany({
        where: {
          role: UserRole.DISPATCH,
          isActive: true,
          institutionId: order.institutionId,
          password: { not: null },
        },
        select: { id: true },
      });
      await this.notifications.notify(
        riders.map((r) => r.id),
        {
          type: 'NEW_JOB',
          title: 'New delivery job',
          body: 'A new order is ready for a rider. Open it to see where it goes.',
          link: `/dispatch/jobs/${order.deliveryJob.id}`,
        },
      );
    }
    await this.notifications.notify(order.buyerId, {
      type: 'ORDER_PAID',
      title: 'Payment received',
      body: `We've received ${formatNairaPlain(order.totalKobo)}. We'll keep you posted as each store gets your order to you.`,
      link: `/orders/${order.id}`,
    });
  }
}
