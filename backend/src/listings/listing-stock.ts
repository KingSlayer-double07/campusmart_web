import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { nextStatus, stockFromVariants } from './listing-rules';

type Db = PrismaService | Prisma.TransactionClient;

// Recalculates a listing's stock and SOLDOUT/ACTIVE status after any stock change (guide 3.1
// rule 3). Listing writes call it, and checkout (Phase 4) calls it inside its transaction.
export async function recalculateListingStock(db: Db, listingId: string) {
  const listing = await db.listing.findUniqueOrThrow({
    where: { id: listingId },
    select: {
      stock: true,
      status: true,
      variants: { select: { stock: true, isActive: true } },
    },
  });
  const stock = listing.variants.length
    ? stockFromVariants(listing.variants)
    : listing.stock;
  const status = nextStatus(listing.status, stock);
  if (stock !== listing.stock || status !== listing.status) {
    await db.listing.update({
      where: { id: listingId },
      data: { stock, status },
    });
  }
  return { stock, status };
}
