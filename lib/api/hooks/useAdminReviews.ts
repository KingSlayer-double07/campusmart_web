import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminReviewsApi, type AdminReviewView } from '../reviews';
import { reviewsKey } from './useReviews';

const adminReviewsKey = ['admin', 'reviews'] as const;

export function useAdminReviews(view: AdminReviewView) {
  return useInfiniteQuery({
    queryKey: [...adminReviewsKey, view],
    queryFn: ({ pageParam }) => adminReviewsApi.list(view, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

// Decision R4: hiding or showing a review recounts the ratings, so buyer-side reviews refresh too
export function useSetReviewHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) =>
      reason === null ? adminReviewsApi.show(id) : adminReviewsApi.hide(id, reason),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminReviewsKey }),
        queryClient.invalidateQueries({ queryKey: reviewsKey }),
      ]),
  });
}
