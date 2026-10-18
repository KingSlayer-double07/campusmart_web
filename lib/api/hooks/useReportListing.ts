import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi, type ReportReason } from '../moderation';
import { listingsKey } from './useListings';

// Any verified user, once per listing. A prohibited-item report hides it at once (M4b), so the
// catalogue drops it; the product page itself stays until the buyer leaves.
export function useReportListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, ...body }: { listingId: string; reason: ReportReason; details?: string }) =>
      reportsApi.reportListing(listingId, body),
    onSuccess: (receipt) => {
      if (receipt.hidden) {
        void queryClient.invalidateQueries({ queryKey: [...listingsKey, 'browse'] });
      }
    },
  });
}
