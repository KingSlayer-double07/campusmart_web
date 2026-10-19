import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { ListingStatus } from '../generated/prisma/enums';
import { recalculateListingStock } from '../listings/listing-stock';

type Tx = Prisma.TransactionClient;

export interface StockLine {
  listingId: string;
  variantId: string | null;
  quantity: number;
}

// Rows are locked in one order, so two checkouts touching the same items can't deadlock
const byRow = (a: StockLine, b: StockLine) =>
  `${a.listingId}:${a.variantId ?? ''}`.localeCompare(
    `${b.listingId}:${b.variantId ?? ''}`,
  );

// Guide 4.2 step 3: a conditional decrement per line, so two buyers can't take the last unit.
// Then step 4: each touched listing's stock and SOLDOUT status are recalculated.
export async function reserveStock(tx: Tx, lines: StockLine[]): Promise<void> {
  for (const line of [...lines].sort(byRow)) {
    const res = line.variantId
      ? await tx.listingVariant.updateMany({
          where: {
            id: line.variantId,
            stock: { gte: line.quantity },
            isActive: true,
            listing: {
              id: line.listingId,
              status: ListingStatus.ACTIVE,
              isDeleted: false,
            },
          },
          data: { stock: { decrement: line.quantity } },
        })
      : await tx.listing.updateMany({
          where: {
            id: line.listingId,
            stock: { gte: line.quantity },
            status: ListingStatus.ACTIVE,
            isDeleted: false,
          },
          data: { stock: { decrement: line.quantity } },
        });
    if (res.count !== 1) {
      throw new ConflictException({
        code: 'OUT_OF_STOCK',
        message: 'Someone else just bought the last of an item in your cart',
        details: { listingId: line.listingId, variantId: line.variantId },
      });
    }
  }
  await recalculate(tx, lines);
}

// Puts reserved units back when an unpaid order is cancelled or expires. An option the seller has
// since removed can't take its units back; the rest can.
export async function releaseStock(tx: Tx, lines: StockLine[]): Promise<void> {
  for (const line of [...lines].sort(byRow)) {
    if (line.variantId) {
      await tx.listingVariant.updateMany({
        where: { id: line.variantId },
        data: { stock: { increment: line.quantity } },
      });
    } else {
      await tx.listing.update({
        where: { id: line.listingId },
        data: { stock: { increment: line.quantity } },
      });
    }
  }
  await recalculate(tx, lines);
}

async function recalculate(tx: Tx, lines: StockLine[]) {
  for (const listingId of new Set(lines.map((l) => l.listingId))) {
    await recalculateListingStock(tx, listingId);
  }
}
