import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminDispatchApi,
  type DeliveryView,
  type Fault,
  type InviteRiderBody,
  type ResolveDisputeBody,
} from '../dispatch';

export const adminRidersKey = ['admin', 'riders'] as const;
export const adminDeliveriesKey = ['admin', 'deliveries'] as const;
export const adminLockedKey = ['admin', 'locked-handovers'] as const;
export const adminDisputesKey = ['admin', 'disputes'] as const;
export const adminProblemsKey = ['admin', 'problems'] as const;

const pages = { initialPageParam: undefined as string | undefined };

export function useAdminRiders(filters: { q?: string; status?: string; institutionId?: string } = {}, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...adminRidersKey, filters],
    queryFn: ({ pageParam }) => adminDispatchApi.riders({ ...filters, cursor: pageParam }),
    ...pages,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

function useInvalidating<V, R>(fn: (v: V) => Promise<R>, keys: readonly (readonly string[])[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

export const useInviteRider = () => useInvalidating((body: InviteRiderBody) => adminDispatchApi.inviteRider(body), [adminRidersKey]);
export const useResendInvite = () => useInvalidating((id: string) => adminDispatchApi.resendInvite(id), [adminRidersKey]);
export const useSetRiderActive = () =>
  useInvalidating(
    (v: { id: string; isActive: boolean; reason: string }) => adminDispatchApi.setRiderActive(v.id, v.isActive, v.reason),
    [adminRidersKey],
  );

export function useAdminDeliveries(view: DeliveryView) {
  return useInfiniteQuery({
    queryKey: [...adminDeliveriesKey, view],
    queryFn: ({ pageParam }) => adminDispatchApi.deliveries({ view, cursor: pageParam }),
    ...pages,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useLockedHandovers(enabled = true) {
  return useInfiniteQuery({
    queryKey: adminLockedKey,
    queryFn: ({ pageParam }) => adminDispatchApi.locked(pageParam),
    ...pages,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export const useAssignRider = () =>
  useInvalidating(
    (v: { jobId: string; riderId: string; reason?: string }) => adminDispatchApi.assign(v.jobId, v.riderId, v.reason),
    [adminDeliveriesKey, adminRidersKey],
  );
export const useUnlockHandover = () =>
  useInvalidating((v: { sellerOrderId: string; reason: string }) => adminDispatchApi.unlock(v.sellerOrderId, v.reason), [
    adminLockedKey,
    adminDeliveriesKey,
  ]);
export const useAdminRefund = () =>
  useInvalidating(
    (v: { sellerOrderId: string; fault: Fault; reason: string }) => adminDispatchApi.refund(v.sellerOrderId, v.fault, v.reason),
    [adminDeliveriesKey, adminProblemsKey],
  );

export function useAdminDisputes(status: 'OPEN' | 'RESOLVED') {
  return useInfiniteQuery({
    queryKey: [...adminDisputesKey, status],
    queryFn: ({ pageParam }) => adminDispatchApi.disputes({ status, cursor: pageParam }),
    ...pages,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useAdminDispute(id: string | undefined) {
  return useQuery({
    queryKey: [...adminDisputesKey, 'one', id],
    queryFn: () => adminDispatchApi.dispute(id!),
    enabled: !!id,
  });
}

export function useResolveDispute(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ResolveDisputeBody) => adminDispatchApi.resolve(id, body),
    onSuccess: (dispute) => {
      queryClient.setQueryData([...adminDisputesKey, 'one', id], dispute);
      return queryClient.invalidateQueries({ queryKey: adminDisputesKey });
    },
  });
}

export function useAdminProblems(status: 'OPEN' | 'CLOSED', enabled = true) {
  return useInfiniteQuery({
    queryKey: [...adminProblemsKey, status],
    queryFn: ({ pageParam }) => adminDispatchApi.problems({ status, cursor: pageParam }),
    ...pages,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export const useCloseProblem = () =>
  useInvalidating((v: { id: string; note: string }) => adminDispatchApi.closeProblem(v.id, v.note), [adminProblemsKey]);
