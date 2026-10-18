import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewsApi, type CreateReviewBody } from '../reviews';
import { buyerOrdersKey } from './useBuyerOrders';
import { listingsKey } from './useListings';

export const reviewsKey = ['reviews'] as const;

const pageParams = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined,
};

export function useListingReviews(listingId: string | undefined) {
  return useInfiniteQuery({
    queryKey: [...reviewsKey, 'listing', listingId],
    queryFn: ({ pageParam }) => reviewsApi.forListing(listingId!, pageParam),
    enabled: !!listingId,
    ...pageParams,
  });
}

export function useStoreReviews(sellerId: string | undefined) {
  return useInfiniteQuery({
    queryKey: [...reviewsKey, 'store', sellerId],
    queryFn: ({ pageParam }) => reviewsApi.forStore(sellerId!, pageParam),
    enabled: !!sellerId,
    ...pageParams,
  });
}

// Guide 8.4: rate an item you received. The order, the listing's rating and its reviews refresh.
export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sellerOrderId, body }: { sellerOrderId: string; body: CreateReviewBody }) => reviewsApi.create(sellerOrderId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: buyerOrdersKey }),
        queryClient.invalidateQueries({ queryKey: reviewsKey }),
        queryClient.invalidateQueries({ queryKey: listingsKey }),
      ]),
  });
}
