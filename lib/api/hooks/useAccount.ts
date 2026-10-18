import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { accountApi } from '../account';
import type { User } from '../auth';
import { meKey } from './useMe';

// Public and rarely changing: the schools a buyer can pick (switched-off ones are hidden)
export function useSchools() {
  return useQuery({ queryKey: ['institutions'], queryFn: accountApi.institutions, staleTime: 10 * 60 * 1000 });
}

// The account changed: keep the stored user and GET /auth/me in step, and drop everything that was
// for the old school or role (listings, cart, stores)
function useAccountMutation<V>(mutationFn: (vars: V) => Promise<User>) {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn,
    onSuccess: async (user) => {
      setUser(user);
      queryClient.setQueryData(meKey, user);
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}

// Decisions T1 and G1: pick a school after signing up, or change it (the cart empties)
export function useSetSchool() {
  return useAccountMutation((institutionId: string) => accountApi.setInstitution(institutionId));
}

// Decision G2
export function useSendSchoolEmailCode() {
  return useMutation({ mutationFn: (email: string) => accountApi.sendSchoolEmailCode(email) });
}

export function useVerifySchoolEmail() {
  return useAccountMutation((code: string) => accountApi.verifySchoolEmail(code));
}

export function useBecomeSeller() {
  return useAccountMutation(() => accountApi.becomeSeller());
}
