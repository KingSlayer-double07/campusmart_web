import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  type CampusPlaceFilters,
  type CreateCampusPlaceBody,
  type UpdateCampusPlaceBody,
} from '../admin';
import { adminInstitutionsKey } from './useAdminInstitutions';

export const adminCampusPlacesKey = ['admin', 'campus-places'] as const;

export function useAdminCampusPlaces(filters: Omit<CampusPlaceFilters, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: [...adminCampusPlacesKey, filters],
    queryFn: ({ pageParam }) => adminApi.campusPlaces({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useInvalidatePlaces() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminCampusPlacesKey }),
      // Institution rows count their places
      queryClient.invalidateQueries({ queryKey: adminInstitutionsKey }),
    ]);
}

export function useCreateCampusPlace() {
  const invalidate = useInvalidatePlaces();
  return useMutation({
    mutationFn: (body: CreateCampusPlaceBody) => adminApi.createCampusPlace(body),
    onSuccess: invalidate,
  });
}

export function useUpdateCampusPlace() {
  const invalidate = useInvalidatePlaces();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCampusPlaceBody }) => adminApi.updateCampusPlace(id, body),
    onSuccess: invalidate,
  });
}
