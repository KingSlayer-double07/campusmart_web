import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../payments';
import { buyerOrdersKey } from './useBuyerOrders';

export const paymentConfigKey = ['payments', 'config'] as const;

// Whether Paystack is on and which methods checkout offers (decision P5). Changes only on deploy.
export function usePaymentConfig() {
  return useQuery({
    queryKey: paymentConfigKey,
    queryFn: () => paymentsApi.config(),
    staleTime: 10 * 60 * 1000,
  });
}

// Guide 5.3: asks Paystack directly when the webhook hasn't marked the order paid yet
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => paymentsApi.verify(reference),
    onSuccess: (result) => queryClient.invalidateQueries({ queryKey: [...buyerOrdersKey, result.orderId] }),
  });
}

// Decision P7: "Pay now" on an order still waiting for payment
export function usePayOrder() {
  return useMutation({ mutationFn: (orderId: string) => paymentsApi.pay(orderId) });
}
