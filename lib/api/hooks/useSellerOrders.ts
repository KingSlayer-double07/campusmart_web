import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sellerOrdersApi, type SellerOrderTab, type SellerSideOrder } from '../dispatch';

export const sellerOrdersKey = ['seller-orders'] as const;

// Guide 6.2, rebuilt for delivery: the seller's orders by tab
export function useSellerOrders(tab: SellerOrderTab) {
  return useInfiniteQuery({
    queryKey: [...sellerOrdersKey, 'list', tab],
    queryFn: ({ pageParam }) => sellerOrdersApi.list({ tab, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useSellerOrderCounts() {
  return useQuery({ queryKey: [...sellerOrdersKey, 'counts'], queryFn: () => sellerOrdersApi.counts() });
}

export function useSellerOrder(id: string | undefined) {
  return useQuery({
    queryKey: [...sellerOrdersKey, 'one', id],
    queryFn: () => sellerOrdersApi.get(id!),
    enabled: !!id,
  });
}

function useOrderAction<V>(id: string, action: (vars: V) => Promise<SellerSideOrder>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (order) => {
      queryClient.setQueryData([...sellerOrdersKey, 'one', id], order);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: [...sellerOrdersKey, 'list'] }),
        queryClient.invalidateQueries({ queryKey: [...sellerOrdersKey, 'counts'] }),
      ]);
    },
  });
}

// Decision F10: before the parcel leaves the seller
export const useCancelSellerOrder = (id: string) =>
  useOrderAction(id, (reason: string) => sellerOrdersApi.cancel(id, reason));

// Decision DL5: the buyer collecting from the seller gives their code
export const useSellerHandover = (id: string) =>
  useOrderAction(id, (code: string) => sellerOrdersApi.handOver(id, code));
