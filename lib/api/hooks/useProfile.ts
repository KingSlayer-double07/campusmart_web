import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { accountApi, type UpdateProfileBody } from '../auth';
import { meKey } from './useMe';

// Guide 10: username, names and phone; the stored user follows
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: (body: UpdateProfileBody) => accountApi.updateProfile(body),
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(meKey, user);
    },
  });
}
