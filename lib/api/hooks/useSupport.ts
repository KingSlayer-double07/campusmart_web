import { useMutation, useQuery } from '@tanstack/react-query';
import { supportApi, type SupportReportBody } from '../support';

// Decision T4: each contact unset shows "coming soon"
export function useSupportContacts() {
  return useQuery({ queryKey: ['support-contacts'], queryFn: supportApi.contacts, staleTime: 60 * 60 * 1000 });
}

// Guide 10: reaches the admins' queue at /admin/reports
export function useSendSupportReport() {
  return useMutation({ mutationFn: (body: SupportReportBody) => supportApi.report(body) });
}
