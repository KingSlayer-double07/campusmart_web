import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsApi, type SetPayoutAccountBody } from '../payments';

export const banksKey = ['payouts', 'banks'] as const;
export const payoutAccountKey = ['payouts', 'account'] as const;
export const sellerPayoutsKey = ['payouts', 'mine'] as const;

// Guide 5.4: Paystack's bank list. The API caches it for 24 hours; so does the page.
export function useBanks(enabled = true) {
  return useQuery({
    queryKey: banksKey,
    queryFn: () => paymentsApi.banks(),
    staleTime: 24 * 60 * 60 * 1000,
    enabled,
  });
}

export function usePayoutAccount() {
  return useQuery({ queryKey: payoutAccountKey, queryFn: () => paymentsApi.payoutAccount() });
}

export function useSetPayoutAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetPayoutAccountBody) => paymentsApi.setPayoutAccount(body),
    onSuccess: (account) => {
      queryClient.setQueryData(payoutAccountKey, account);
      // Payouts waiting for an account are queued now
      return queryClient.invalidateQueries({ queryKey: sellerPayoutsKey });
    },
  });
}

export function useSellerPayouts() {
  return useInfiniteQuery({
    queryKey: sellerPayoutsKey,
    queryFn: ({ pageParam }) => paymentsApi.payouts({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
