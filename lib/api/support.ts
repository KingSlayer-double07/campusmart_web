import { fetchApi } from './client';
import type { components } from './schema';

type Schemas = components['schemas'];
export type SupportContacts = Schemas['SupportContactsDto'];
export type SupportReportBody = Schemas['CreateSupportReportDto'];
export type SupportType = SupportReportBody['type'];

export const SUPPORT_TYPE_LABELS: Record<SupportType, string> = {
  BUG: 'Something isn’t working',
  ORDER: 'An order',
  PAYMENT: 'A payment',
  OTHER: 'Something else',
};

// Guide 10 and decision T4
export const supportApi = {
  contacts: () => fetchApi<SupportContacts>('/support/contacts'),
  report: (body: SupportReportBody) =>
    fetchApi<{ id: string }>('/support/reports', { method: 'POST', body: JSON.stringify(body) }),
};
