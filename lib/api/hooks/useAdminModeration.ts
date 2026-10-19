import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  moderationApi,
  type AdminUserFilters,
  type AssignableRole,
  type AuditFilters,
  type ListingView,
  type ModerateListingBody,
  type ReportStatus,
  type UpdateReportBody,
} from '../moderation';

// Admin queries stay out of persistence (guide 9.2.4)
const usersKey = ['admin', 'users'] as const;
const listingsKey = ['admin', 'listings'] as const;
const reportsKey = ['admin', 'support-reports'] as const;
const auditKey = ['admin', 'audit-log'] as const;
const overviewKey = ['admin', 'overview'] as const;
const bannedWordsKey = ['admin', 'banned-words'] as const;

const page = { initialPageParam: undefined as string | undefined };
const next = (last: { nextCursor: string | null }) => last.nextCursor ?? undefined;

export function useAdminUsers(filters: Omit<AdminUserFilters, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: [...usersKey, filters],
    queryFn: ({ pageParam }) => moderationApi.users({ ...filters, cursor: pageParam }),
    ...page,
    getNextPageParam: next,
  });
}

// A suspension also archives listings and changes the overview, so those refresh too
function useAdminMutation<V, R>(mutationFn: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        [usersKey, listingsKey, reportsKey, auditKey, overviewKey].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export function useSetRole() {
  return useAdminMutation(({ id, role }: { id: string; role: AssignableRole }) => moderationApi.setRole(id, role));
}

export function useSetSuspended() {
  return useAdminMutation(({ id, reason }: { id: string; reason: string | null }) =>
    reason === null ? moderationApi.unsuspend(id) : moderationApi.suspend(id, reason),
  );
}

export function useAdminListings(view: ListingView, q?: string) {
  return useInfiniteQuery({
    queryKey: [...listingsKey, view, q ?? ''],
    queryFn: ({ pageParam }) => moderationApi.listings(view, { q, cursor: pageParam }),
    ...page,
    getNextPageParam: next,
  });
}

export function useModerateListing() {
  return useAdminMutation(({ id, ...body }: ModerateListingBody & { id: string }) => moderationApi.moderate(id, body));
}

export function useAdminReports(status: ReportStatus) {
  return useInfiniteQuery({
    queryKey: [...reportsKey, status],
    queryFn: ({ pageParam }) => moderationApi.reports(status, pageParam),
    ...page,
    getNextPageParam: next,
  });
}

export function useUpdateReport() {
  return useAdminMutation(({ id, ...body }: UpdateReportBody & { id: string }) => moderationApi.updateReport(id, body));
}

export function useAuditLog(filters: Omit<AuditFilters, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: [...auditKey, filters],
    queryFn: ({ pageParam }) => moderationApi.auditLog({ ...filters, cursor: pageParam }),
    ...page,
    getNextPageParam: next,
  });
}

export function useAdminOverview() {
  return useQuery({ queryKey: overviewKey, queryFn: () => moderationApi.overview() });
}

export function useBannedWords() {
  return useQuery({ queryKey: bannedWordsKey, queryFn: () => moderationApi.bannedWords() });
}

export function useSetBannedWords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (words: string[]) => moderationApi.setBannedWords(words),
    onSuccess: (saved) => queryClient.setQueryData(bannedWordsKey, saved),
  });
}
