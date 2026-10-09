import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { sellersApi } from '../listings';
import { meKey } from './useMe';

export const sellerVerificationKey = ['seller-verification'] as const;

// Whether an admin has verified this seller, plus the latest request and its note (guide 9.2.5)
export function useMyVerification(enabled = true) {
  return useQuery({ queryKey: sellerVerificationKey, queryFn: sellersApi.verification, enabled });
}

export function useSubmitVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentUrl: string) => sellersApi.submitVerification(documentUrl),
    onSuccess: (verification) => {
      queryClient.setQueryData(sellerVerificationKey, verification);
      // The signed-in user carries verificationStatus too
      return queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

// Publishing needs an admin-verified seller. Until the API answers, the signed-in user's stored
// status decides, so a verified seller doesn't see the draft-only form flash.
export function useCanPublish() {
  const stored = useAuthStore((s) => s.user?.verificationStatus);
  const { data } = useMyVerification();
  return (data?.status ?? stored) === 'VERIFIED';
}
