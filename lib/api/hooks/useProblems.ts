import { useMutation, useQueryClient } from '@tanstack/react-query';
import { problemsApi, type ReportProblemBody } from '../dispatch';
import { buyerOrdersKey } from './useBuyerOrders';

// Decision C8: report a problem with one store's order
export function useReportProblem(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sellerOrderId, body }: { sellerOrderId: string; body: ReportProblemBody }) =>
      problemsApi.report(orderId, sellerOrderId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...buyerOrdersKey, orderId] }),
  });
}
