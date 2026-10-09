import type { Prisma } from '../generated/prisma/client';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
} from '../generated/prisma/enums';
import { releaseStock } from './order-stock';

type Tx = Prisma.TransactionClient;

// An unpaid order nobody has paid for yet. A completed payment always wins (guide 4.2: a late
// webhook beats the expiry job), so such an order is never closed here.
export const unpaidOrderWhere = (): Prisma.OrderWhereInput => ({
  status: OrderStatus.PENDING_PAYMENT,
  OR: [
    { payment: { is: null } },
    { payment: { status: { not: PaymentStatus.COMPLETED } } },
  ],
});

// Closes an unpaid order as CANCELLED (the buyer) or EXPIRED (the job): the status flip is
// conditional, so only one caller wins; the winner cancels the seller orders and returns the
// reserved stock. Returns false when the order had already moved on.
export async function closeUnpaidOrder(
  tx: Tx,
  where: Prisma.OrderWhereInput & { id: string },
  status: typeof OrderStatus.CANCELLED | typeof OrderStatus.EXPIRED,
  now: Date,
): Promise<boolean> {
  const claimed = await tx.order.updateMany({
    where: { AND: [where, unpaidOrderWhere()] },
    data: { status },
  });
  if (claimed.count !== 1) return false;

  await tx.sellerOrder.updateMany({
    where: { orderId: where.id },
    data: {
      fulfillmentStatus: FulfillmentStatus.CANCELLED,
      cancelledAt: now,
      cancelReason:
        status === OrderStatus.EXPIRED ? 'PAYMENT_EXPIRED' : 'BUYER_CANCELLED',
    },
  });
  const items = await tx.orderItem.findMany({
    where: { sellerOrder: { orderId: where.id } },
    select: { listingId: true, variantId: true, quantity: true },
  });
  await releaseStock(tx, items);
  return true;
}
