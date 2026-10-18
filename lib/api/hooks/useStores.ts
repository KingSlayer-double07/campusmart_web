import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { storesApi } from '../stores';

export const storesKey = ['stores'] as const;

// Guide 8.2: the home page row
export function useFeaturedStores() {
  return useQuery({
    queryKey: [...storesKey, 'featured'],
    queryFn: () => storesApi.list({ featured: true, limit: 10 }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStores() {
  return useInfiniteQuery({
    queryKey: [...storesKey, 'all'],
    queryFn: ({ pageParam }) => storesApi.list({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useStore(sellerId: string | undefined) {
  return useQuery({
    queryKey: [...storesKey, sellerId],
    queryFn: () => storesApi.detail(sellerId!),
    enabled: !!sellerId,
  });
}

export function useStoreListings(sellerId: string | undefined) {
  return useInfiniteQuery({
    queryKey: [...storesKey, sellerId, 'listings'],
    queryFn: ({ pageParam }) => storesApi.listings(sellerId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!sellerId,
  });
}
