import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  EscrowStatus,
  Fault,
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
} from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { releaseStock } from '../orders/order-stock';
import { PaystackService } from '../paystack/paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatNairaPlain } from './money';
import { PICKED_UP_STATUSES, refundAmounts } from './payment-rules';

export interface RefundInput {
  reason: string; // 'SELLER_CANCELLED', 'MISSED_PICKUP_DEADLINE', 'DISPUTE_REFUND', ...
  fault: Fault;
  actorId?: string | null; // null = a system job
}

// Guide 5.6: one way money goes back to a buyer. Used by seller cancellations and missed deadlines
// (Phase 6), disputes resolved for the buyer (Phase 6) and payments that arrive too late here.
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // Refunds one seller order of a paid order; the others are untouched. Its stock goes back on
  // sale, escrow becomes REFUNDED and the seller order CANCELLED.
  async refundSellerOrder(sellerOrderId: string, input: RefundInput) {
    const so = await this.prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      select: {
        id: true,
        code: true,
        sellerId: true,
        subtotalKobo: true,
        escrowStatus: true,
        order: {
          select: {
            id: true,
            buyerId: true,
            status: true,
            subtotalKobo: true,
            deliveryFeeKobo: true,
            payments: {
              where: { status: PaymentStatus.COMPLETED },
              select: { id: true, reference: true, feesKobo: true },
              take: 1,
            },
            sellerOrders: {
              select: {
                id: true,
                escrowStatus: true,
                fulfillmentStatus: true,
                collectedAt: true,
                pickedUpAt: true,
              },
            },
          },
        },
      },
    });
    if (!so) throw new NotFoundException('Seller order not found');
    const payment = so.order.payments[0];
    if (
      so.order.status !== OrderStatus.PAID ||
      !payment ||
      so.escrowStatus !== EscrowStatus.HELD
    ) {
      throw new ConflictException({
        code: 'NOT_REFUNDABLE',
        message: 'Only a paid order whose money is still held can be refunded',
      });
    }

    // Decisions DF9 and DF9a: the delivery fee comes back only with the last refund of the order,
    // and only when nothing was ever picked up
    const others = so.order.sellerOrders.filter((s) => s.id !== so.id);
    const nothingPickedUp = so.order.sellerOrders.every(
      (s) =>
        !s.pickedUpAt &&
        !s.collectedAt &&
        !PICKED_UP_STATUSES.includes(s.fulfillmentStatus),
    );
    const lastToGo = others.every(
      (s) => s.escrowStatus === EscrowStatus.REFUNDED,
    );
    const amounts = refundAmounts({
      itemsKobo: so.subtotalKobo,
      orderSubtotalKobo: so.order.subtotalKobo,
      paystackFeesKobo: payment.feesKobo ?? 0,
      fault: input.fault,
      deliveryFeeKobo:
        nothingPickedUp && lastToGo ? so.order.deliveryFeeKobo : 0,
    });

    const now = new Date();
    const refund = await this.prisma.$transaction(async (tx) => {
      // Only one caller can move the money out of HELD
      const claimed = await tx.sellerOrder.updateMany({
        where: { id: so.id, escrowStatus: EscrowStatus.HELD },
        data: {
          escrowStatus: EscrowStatus.REFUNDED,
          fulfillmentStatus: FulfillmentStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: input.reason,
          fault: input.fault,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          code: 'NOT_REFUNDABLE',
          message: 'This order has already been refunded or paid out',
        });
      }
      const items = await tx.orderItem.findMany({
        where: { sellerOrderId: so.id },
        select: { listingId: true, variantId: true, quantity: true },
      });
      await releaseStock(tx, items);
      const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          sellerOrderId: so.id,
          ...amounts,
          fault: input.fault,
          reason: input.reason,
          actorId: input.actorId ?? null,
          status:
            amounts.amountKobo === 0
              ? RefundStatus.PROCESSED
              : RefundStatus.PENDING,
        },
      });
      await this.audit.record(
        {
          actorId: input.actorId ?? null,
          action: 'REFUND_CREATED',
          entityType: 'SellerOrder',
          entityId: so.id,
          meta: {
            refundId: created.id,
            ...amounts,
            fault: input.fault,
            reason: input.reason,
          },
        },
        tx,
      );
      return created;
    });

    const sent = await this.send(refund, payment.reference);
    await this.notifications.notify(so.order.buyerId, {
      type: 'ORDER_REFUNDED',
      title: `Refund for order ${so.code}`,
      body: `${formatNairaPlain(amounts.amountKobo)} is on its way back to you. Banks usually take a few working days.`,
      link: `/orders/${so.order.id}`,
    });
    await this.notifications.notify(so.sellerId, {
      type: 'ORDER_CANCELLED',
      title: `Order ${so.code} was cancelled`,
      body: 'The buyer has been refunded and the items are back on sale.',
    });
    return sent;
  }

  // Refunds a whole payment on its own: a second payment for an order that was already paid, or
  // one that arrived after the order expired and its stock was gone. Nobody's fault (P6).
  async refundPayment(paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: {
        id: true,
        reference: true,
        amountKobo: true,
        order: { select: { id: true, buyerId: true } },
      },
    });
    const refund = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });
      const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amountKobo: payment.amountKobo,
          itemsKobo: payment.amountKobo,
          fault: Fault.NONE,
          reason,
        },
      });
      await this.audit.record(
        {
          actorId: null,
          action: 'REFUND_CREATED',
          entityType: 'Payment',
          entityId: payment.id,
          meta: {
            refundId: created.id,
            amountKobo: payment.amountKobo,
            reason,
          },
        },
        tx,
      );
      return created;
    });
    const sent = await this.send(refund, payment.reference);
    await this.notifications.notify(payment.order.buyerId, {
      type: 'PAYMENT_REFUNDED',
      title: 'Your payment is being refunded',
      body:
        reason === 'PAID_AFTER_STOCK_GONE'
          ? `Your payment arrived after the order had expired and the items sold out, so ${formatNairaPlain(payment.amountKobo)} is on its way back to you.`
          : `We received more than one payment for this order, so ${formatNairaPlain(payment.amountKobo)} is on its way back to you.`,
      link: `/orders/${payment.order.id}`,
    });
    return sent;
  }

  // refund.processed / refund.failed (guide 5.2 step 6)
  async settle(paystackRefundId: string, processed: boolean, note?: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { paystackRefundId },
      select: { id: true, status: true, amountKobo: true },
    });
    if (!refund || refund.status === RefundStatus.PROCESSED) return;
    await this.prisma.refund.update({
      where: { id: refund.id },
      data: processed
        ? { status: RefundStatus.PROCESSED }
        : {
            status: RefundStatus.FAILED,
            failureReason: note ?? 'Refund failed',
          },
    });
    await this.audit.record({
      actorId: null,
      action: processed ? 'REFUND_PROCESSED' : 'REFUND_FAILED',
      entityType: 'Refund',
      entityId: refund.id,
      ...(note && { meta: { note } }),
    });
    if (!processed) {
      await this.notifications.alertAdmins({
        type: 'REFUND_FAILED',
        title: 'A refund failed',
        body: `Paystack couldn't refund ${formatNairaPlain(refund.amountKobo)} (${note ?? 'no reason given'}). The buyer is still owed it.`,
        data: { refundId: refund.id },
      });
    }
  }

  // Asks Paystack for the refund. If that fails the refund stays recorded as FAILED and the admins
  // are told, so nobody's money goes missing quietly.
  private async send(
    refund: { id: string; amountKobo: number; status: RefundStatus },
    reference: string,
  ) {
    if (refund.status === RefundStatus.PROCESSED) return refund;
    try {
      const res = await this.paystack.refund({
        transaction: reference,
        amountKobo: refund.amountKobo,
      });
      return await this.prisma.refund.update({
        where: { id: refund.id },
        data: { paystackRefundId: String(res.id) },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Refund ${refund.id} wasn't accepted by Paystack: ${reason}`,
      );
      await this.notifications.alertAdmins({
        type: 'REFUND_FAILED',
        title: 'A refund needs attention',
        body: `Paystack didn't accept a refund of ${formatNairaPlain(refund.amountKobo)}: ${reason}`,
        data: { refundId: refund.id },
      });
      return this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: RefundStatus.FAILED, failureReason: reason },
      });
    }
  }
}
