import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listingsApi,
  type CreateListingBody,
  type ListingFilters,
  type OwnerListingStatus,
  type UpdateListingBody,
} from '../listings';
import type { components } from '../schema';
import { useBrowseSchool } from './useBrowseSchool';

export const listingsKey = ['listings'] as const;
export const sellerListingsKey = ['seller-listings'] as const;

// The catalogue a buyer browses. Persisted (meta.persist) so the PWA shows it offline (1.6.10).
// Guests browse too, at the school they picked (useBrowseSchool); the school is in each key.
export function useListings(filters: ListingFilters = {}) {
  const { institutionId, ready } = useBrowseSchool();
  return useInfiniteQuery({
    queryKey: [...listingsKey, 'browse', filters, institutionId ?? 'mine'],
    queryFn: ({ pageParam }) => listingsApi.browse({ ...filters, cursor: pageParam, institutionId }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: ready,
    meta: { persist: true },
  });
}

export function useListing(id: string | undefined) {
  const { institutionId, ready } = useBrowseSchool();
  return useQuery({
    queryKey: [...listingsKey, 'detail', id, institutionId ?? 'mine'],
    queryFn: () => listingsApi.get(id!, institutionId),
    enabled: !!id && ready,
  });
}

export function useRelatedListings(id: string | undefined) {
  const { institutionId, ready } = useBrowseSchool();
  return useQuery({
    queryKey: [...listingsKey, 'related', id, institutionId ?? 'mine'],
    queryFn: () => listingsApi.related(id!, institutionId),
    enabled: !!id && ready,
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
    mutationFn: ({ id, status, confirmNotProhibited }: { id: string; status: OwnerListingStatus; confirmNotProhibited?: boolean }) =>
      listingsApi.setStatus(id, status, confirmNotProhibited),
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
