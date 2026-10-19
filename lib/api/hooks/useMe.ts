import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { authApi } from '../auth';

export const meKey = ['me'] as const;

// The signed-in user from GET /auth/me. Starts from the persisted user for an instant first paint;
// disabled while nobody is signed in on this device.
export function useMe() {
  const storedUser = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: meKey,
    queryFn: authApi.me,
    enabled: !!storedUser,
    placeholderData: storedUser ?? undefined,
    staleTime: 5 * 60 * 1000,
  });
}
