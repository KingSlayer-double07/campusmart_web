import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountApi } from '../auth';

export const sessionsKey = ['sessions'] as const;

export function useSessions() {
  return useQuery({ queryKey: sessionsKey, queryFn: accountApi.sessions });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountApi.revokeSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionsKey }),
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => accountApi.revokeOtherSessions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionsKey }),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountApi.changePassword,
    // Every other session was signed out
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionsKey }),
  });
}
