import type { Prisma } from '../generated/prisma/client';
import { FulfillmentStatus } from '../generated/prisma/enums';

type Tx = Prisma.TransactionClient;

// Execution plan, Phase 8: reviews open once the buyer has the item, delivered or collected
export const REVIEWABLE: FulfillmentStatus[] = [
  FulfillmentStatus.DELIVERED,
  FulfillmentStatus.COLLECTED,
];

export const COMMENT_MAX = 500;

// An average to two decimals, 0 with no reviews
export const roundRating = (avg: number | null) =>
  avg === null ? 0 : Math.round(avg * 100) / 100;

// Guide 8.4: the listing's and the seller's ratings, from the reviews that show (hidden ones
// don't count: R4). Recounted rather than nudged, so hiding and showing stay exact.
export async function recountRatings(
  tx: Tx,
  listingId: string,
  sellerId: string,
): Promise<void> {
  const [listing, seller] = await Promise.all([
    tx.review.aggregate({
      where: { listingId, hiddenAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    tx.review.aggregate({
      where: { revieweeId: sellerId, hiddenAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);
  await tx.listing.update({
    where: { id: listingId },
    data: {
      ratingAvg: roundRating(listing._avg.rating),
      ratingCount: listing._count._all,
    },
  });
  await tx.sellerProfile.updateMany({
    where: { userId: sellerId },
    data: {
      ratingAvg: roundRating(seller._avg.rating),
      ratingCount: seller._count._all,
    },
  });
}
