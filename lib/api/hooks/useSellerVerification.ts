import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { sellersApi } from '../listings';
import { meKey } from './useMe';
import { useSellerProfile } from './useSellerProfile';

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

// Whether an admin has verified this seller. Until the API answers, the signed-in user's stored
// status decides, so a verified seller doesn't see the draft-only form flash.
export function useIsVerified() {
  const stored = useAuthStore((s) => s.user?.verificationStatus);
  const { data } = useMyVerification();
  return (data?.status ?? stored) === 'VERIFIED';
}

// Publishing needs a verified seller who has said where riders collect from (decision SA1). The
// details count as there until the profile loads, for the same reason.
export function useCanPublish() {
  const verified = useIsVerified();
  const { data: profile } = useSellerProfile();
  return verified && (profile?.deliveryDetailsComplete ?? true);
}
