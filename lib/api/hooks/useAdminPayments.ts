import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminPaymentsApi, type PayoutStatus, type UpdateSettingsBody } from '../payments';

export const adminPayoutsKey = ['admin', 'payouts'] as const;
export const adminSettingsKey = ['admin', 'settings'] as const;

export function useAdminPayouts(filters: { status?: PayoutStatus } = {}) {
  return useInfiniteQuery({
    queryKey: [...adminPayoutsKey, filters],
    queryFn: ({ pageParam }) => adminPaymentsApi.payouts({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useRetryPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminPaymentsApi.retryPayout(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminPayoutsKey }),
  });
}

export function useAdminSettings() {
  return useQuery({ queryKey: adminSettingsKey, queryFn: () => adminPaymentsApi.settings() });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsBody) => adminPaymentsApi.updateSettings(body),
    onSuccess: (settings) => queryClient.setQueryData(adminSettingsKey, settings),
  });
}
