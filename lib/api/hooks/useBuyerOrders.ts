import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buyerOrdersApi, type Order } from '../checkout';
import { cartKey } from './useCart';

export const pickupStationsKey = ['pickup-stations'] as const;
export const buyerOrdersKey = ['orders'] as const;

// Active stations at the buyer's school (guide 4.3.3). They change rarely.
export function usePickupStations() {
  return useQuery({
    queryKey: pickupStationsKey,
    queryFn: () => buyerOrdersApi.pickupStations(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof buyerOrdersApi.checkout>[0]) => buyerOrdersApi.checkout(body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: cartKey }),
        queryClient.invalidateQueries({ queryKey: buyerOrdersKey }),
        // Stock moved
        queryClient.invalidateQueries({ queryKey: ['listings'] }),
      ]),
  });
}

export function useBuyerOrders() {
  return useInfiniteQuery({
    queryKey: buyerOrdersKey,
    queryFn: ({ pageParam }) => buyerOrdersApi.list({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

// One order. `poll` refetches every 3 seconds while it's set (the confirmation page waits for PAID).
export function useOrder(id: string | undefined, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: [...buyerOrdersKey, id],
    queryFn: () => buyerOrdersApi.get(id!),
    enabled: !!id,
    refetchInterval: options.poll ? 3000 : false,
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => buyerOrdersApi.cancel(id),
    onSuccess: (order: Order) => {
      queryClient.setQueryData([...buyerOrdersKey, order.id], order);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: buyerOrdersKey }),
        queryClient.invalidateQueries({ queryKey: ['listings'] }),
      ]);
    },
  });
}
