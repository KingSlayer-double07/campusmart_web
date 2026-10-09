import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  type AdminListFilters,
  type CreateInstitutionBody,
  type UpdateInstitutionBody,
} from '../admin';

// Admin data is never persisted to localStorage (guide 9.2.4): no meta.persist here.
export const adminInstitutionsKey = ['admin', 'institutions'] as const;
const adminStationsKey = ['admin', 'stations'] as const;

export function useAdminInstitutions(filters: Omit<AdminListFilters, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: [...adminInstitutionsKey, filters],
    queryFn: ({ pageParam }) => adminApi.institutions({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminInstitutionsKey }),
      // Station rows show their institution's name and status
      queryClient.invalidateQueries({ queryKey: adminStationsKey }),
    ]);
}

export function useCreateInstitution() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (body: CreateInstitutionBody) => adminApi.createInstitution(body),
    onSuccess: invalidate,
  });
}

export function useUpdateInstitution() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateInstitutionBody }) =>
      adminApi.updateInstitution(id, body),
    onSuccess: invalidate,
  });
}
