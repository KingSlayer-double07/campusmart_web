import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type DecideVerificationBody, type ReviewQueue } from '../admin';

// Admin data is never persisted to localStorage (guide 9.2.4): no meta.persist here.
export const adminVerificationsKey = ['admin', 'verifications'] as const;

export function useAdminVerifications(status: ReviewQueue = 'PENDING', limit?: number) {
  return useInfiniteQuery({
    queryKey: [...adminVerificationsKey, status, limit],
    queryFn: ({ pageParam }) => adminApi.verificationRequests({ status, limit, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useDecideVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DecideVerificationBody }) =>
      adminApi.decideVerification(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminVerificationsKey }),
  });
}
