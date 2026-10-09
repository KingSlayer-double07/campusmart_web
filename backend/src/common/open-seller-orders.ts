import type { Prisma } from '../generated/prisma/client';
import {
  EscrowStatus,
  FulfillmentStatus,
  OrderStatus,
} from '../generated/prisma/enums';

// A seller order that isn't finished yet (decided 2026-10-09): an unpaid checkout that hasn't
// expired, a paid order waiting for drop-off, at the station or disputed, and a collected order
// whose 48-hour dispute window is still open (escrow held).
export function openSellerOrderWhere(
  now = new Date(),
): Prisma.SellerOrderWhereInput {
  return {
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

// Open seller orders at one institution (switching it off is refused while there are any)
export const openSellerOrdersAt = (
  institutionId: string,
): Prisma.SellerOrderWhereInput => ({
  AND: [{ order: { institutionId } }, openSellerOrderWhere()],
});

// Open seller orders that include one listing (it can't be deleted while there are any, guide 3.1)
export const openSellerOrdersWithListing = (
  listingId: string,
): Prisma.SellerOrderWhereInput => ({
  AND: [{ items: { some: { listingId } } }, openSellerOrderWhere()],
});
