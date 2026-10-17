import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { riderApi, type ArrivalWindow, type DeliveryJob, type JobScope, type RiderProblemReason } from '../dispatch';

export const riderJobsKey = ['dispatch', 'jobs'] as const;

// The rider's lists: open jobs at their campus, theirs in progress, theirs finished
export function useRiderJobs(scope: JobScope) {
  return useInfiniteQuery({
    queryKey: [...riderJobsKey, 'list', scope],
    queryFn: ({ pageParam }) => riderApi.jobs({ scope, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Open jobs go quickly (DX2): keep the list fresh while it's on screen
    refetchInterval: scope === 'OPEN' ? 30_000 : false,
  });
}

export function useRiderJob(id: string | undefined) {
  return useQuery({
    queryKey: [...riderJobsKey, 'one', id],
    queryFn: () => riderApi.job(id!),
    enabled: !!id,
  });
}

// Every job action returns the job as it now stands
function useJobAction<V>(id: string, action: (vars: V) => Promise<DeliveryJob>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (job) => {
      queryClient.setQueryData([...riderJobsKey, 'one', id], job);
      return queryClient.invalidateQueries({ queryKey: [...riderJobsKey, 'list'] });
    },
  });
}

export const useAcceptJob = (id: string) =>
  useJobAction(id, (windows: ArrivalWindow[]) => riderApi.accept(id, windows));

export const useUpdateWindow = (id: string) =>
  useJobAction(id, (v: { sellerOrderId: string; from: string; to: string }) =>
    riderApi.updateWindow(id, v.sellerOrderId, { from: v.from, to: v.to }),
  );

export const usePickup = (id: string) => useJobAction(id, (code: string) => riderApi.pickup(id, code));

export const useNotReady = (id: string) =>
  useJobAction(id, (v: { sellerOrderId: string; note?: string }) => riderApi.notReady(id, v.sellerOrderId, v.note));

export const useRiderHandover = (id: string) =>
  useJobAction(id, (v: { sellerOrderId: string; code: string }) => riderApi.handOver(id, v.sellerOrderId, v.code));

export const useDropJob = (id: string) => useJobAction(id, () => riderApi.drop(id));

export function useRiderReport(id: string) {
  return useMutation({
    mutationFn: (body: { reason: RiderProblemReason; details?: string }) => riderApi.report(id, body),
  });
}
