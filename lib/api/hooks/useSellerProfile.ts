import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sellersApi, type SellerProfile, type UpdateSellerProfileBody } from '../listings';

export const sellerProfileKey = ['seller-profile'] as const;

export function useSellerProfile(enabled = true) {
  return useQuery({ queryKey: sellerProfileKey, queryFn: sellersApi.me, enabled });
}

export function useUpdateSellerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSellerProfileBody) => sellersApi.update(body),
    onMutate: async (body) => {
      // The online switch flips straight away; it rolls back if the API refuses
      await queryClient.cancelQueries({ queryKey: sellerProfileKey });
      const previous = queryClient.getQueryData<SellerProfile>(sellerProfileKey);
      if (previous) queryClient.setQueryData(sellerProfileKey, { ...previous, ...body });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(sellerProfileKey, context.previous);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(sellerProfileKey, profile);
      // Store names show on listings
      return queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}
