import type { Prisma } from '../generated/prisma/client';
import {
  EscrowStatus,
  FulfillmentStatus,
  OrderStatus,
} from '../generated/prisma/enums';

// Seller orders at an institution that still need its people (Collins, 2026-10-09): an unpaid
// checkout that hasn't expired, a paid order waiting for drop-off, at the station or disputed, and a
// collected order whose 48-hour dispute window is still open (escrow held).
export function openSellerOrdersWhere(
  institutionId: string,
  now = new Date(),
): Prisma.SellerOrderWhereInput {
  return {
    order: { institutionId },
    OR: [
      {
        order: { status: OrderStatus.PENDING_PAYMENT, expiresAt: { gt: now } },
        fulfillmentStatus: FulfillmentStatus.PENDING,
      },
      {
        order: { status: OrderStatus.PAID },
        fulfillmentStatus: {
          in: [
            FulfillmentStatus.AWAITING_DROPOFF,
            FulfillmentStatus.DROPPED_OFF,
            FulfillmentStatus.DISPUTED,
          ],
        },
      },
      {
        order: { status: OrderStatus.PAID },
        fulfillmentStatus: FulfillmentStatus.COLLECTED,
        escrowStatus: EscrowStatus.HELD,
      },
    ],
  };
}
