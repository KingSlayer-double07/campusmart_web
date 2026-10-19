import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { notificationsApi, type NotificationPrefs } from '../notifications';

const notificationsKey = ['notifications'] as const;
const unreadKey = ['notifications', 'unread'] as const;
const prefsKey = ['notification-prefs'] as const;

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: [...notificationsKey, 'list'],
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

// Guide 10: the bell polls every 60 seconds and when the app comes back into view
export function useUnreadCount() {
  const signedIn = useAuthStore((s) => !!s.user);
  return useQuery({
    queryKey: unreadKey,
    queryFn: notificationsApi.unreadCount,
    enabled: signedIn,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export function useNotificationPrefs() {
  return useQuery({ queryKey: prefsKey, queryFn: notificationsApi.prefs });
}

export function useSetNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPrefs) => notificationsApi.setPrefs(prefs),
    onSuccess: (saved) => queryClient.setQueryData(prefsKey, saved),
  });
}
