import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listingsApi,
  type CreateListingBody,
  type ListingFilters,
  type OwnerListingStatus,
  type UpdateListingBody,
} from '../listings';
import type { components } from '../schema';

export const listingsKey = ['listings'] as const;
export const sellerListingsKey = ['seller-listings'] as const;

// The catalogue a buyer browses. Persisted (meta.persist) so the PWA shows it offline (1.6.10).
export function useListings(filters: ListingFilters = {}) {
  return useInfiniteQuery({
    queryKey: [...listingsKey, 'browse', filters],
    queryFn: ({ pageParam }) => listingsApi.browse({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    meta: { persist: true },
  });
}

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: [...listingsKey, 'detail', id],
    queryFn: () => listingsApi.get(id!),
    enabled: !!id,
  });
}

export function useRelatedListings(id: string | undefined) {
  return useQuery({
    queryKey: [...listingsKey, 'related', id],
    queryFn: () => listingsApi.related(id!),
    enabled: !!id,
  });
}

// A seller's own listings, every status (guide 3.2.7 tabs)
export function useSellerListings(status?: components['schemas']['ListingStatus']) {
  return useInfiniteQuery({
    queryKey: [...sellerListingsKey, status ?? 'ALL'],
    queryFn: ({ pageParam }) => listingsApi.mine({ status, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useInvalidateListings() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: listingsKey }),
      queryClient.invalidateQueries({ queryKey: sellerListingsKey }),
    ]);
}

export function useCreateListing() {
  const invalidate = useInvalidateListings();
  return useMutation({
    mutationFn: (body: CreateListingBody) => listingsApi.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateListing() {
  const invalidate = useInvalidateListings();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateListingBody }) => listingsApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useSetListingStatus() {
  const invalidate = useInvalidateListings();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OwnerListingStatus }) => listingsApi.setStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useDeleteListing() {
  const invalidate = useInvalidateListings();
  return useMutation({
    mutationFn: (id: string) => listingsApi.remove(id),
    onSuccess: invalidate,
  });
}
