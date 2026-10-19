import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  type CreatePickupStationBody,
  type StationFilters,
  type UpdatePickupStationBody,
} from '../admin';
import { adminInstitutionsKey } from './useAdminInstitutions';

export const adminStationsKey = ['admin', 'stations'] as const;

export function useAdminStations(filters: Omit<StationFilters, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: [...adminStationsKey, filters],
    queryFn: ({ pageParam }) => adminApi.stations({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useInvalidateStations() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminStationsKey }),
      // Institution rows count their stations
      queryClient.invalidateQueries({ queryKey: adminInstitutionsKey }),
    ]);
}

export function useCreateStation() {
  const invalidate = useInvalidateStations();
  return useMutation({
    mutationFn: (body: CreatePickupStationBody) => adminApi.createStation(body),
    onSuccess: invalidate,
  });
}

export function useUpdateStation() {
  const invalidate = useInvalidateStations();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePickupStationBody }) =>
      adminApi.updateStation(id, body),
    onSuccess: invalidate,
  });
}
