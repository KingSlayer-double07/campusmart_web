import { toParams } from './admin';
import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type PaymentConfig = Schemas['PaymentConfigDto'];
export type StartedPayment = Schemas['StartedPaymentDto'];
export type VerifiedPayment = Schemas['VerifiedPaymentDto'];
export type Bank = Schemas['BankDto'];
export type SetPayoutAccountBody = Schemas['SetPayoutAccountDto'];
export type PayoutAccount = Schemas['PayoutAccountDto'];
export type Payout = Schemas['PayoutDto'];
export type PayoutPage = Schemas['PayoutPageDto'];
export type PayoutStatus = Schemas['PayoutStatus'];
export type AdminPayout = Schemas['AdminPayoutDto'];
export type AdminPayoutPage = Schemas['AdminPayoutPageDto'];
export type PlatformSettings = Schemas['SettingsDto'];
export type UpdateSettingsBody = Schemas['UpdateSettingsDto'];

const json = (method: 'POST' | 'PATCH', body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

// Guide 5: paying for an order, and the seller's side of the money
export const paymentsApi = {
  config: () => fetchApi<PaymentConfig>('/payments/config'),
  verify: (reference: string) => fetchApi<VerifiedPayment>(`/payments/verify/${encodeURIComponent(reference)}`),
  // Decision P7: a new payment page for an order still waiting for payment
  pay: (orderId: string) => fetchApi<StartedPayment>(`/orders/${orderId}/pay`, json('POST')),

  banks: () => fetchApi<Bank[]>('/payouts/banks'),
  payoutAccount: () => fetchApi<PayoutAccount>('/sellers/me/payout-account'),
  setPayoutAccount: (body: SetPayoutAccountBody) =>
    fetchApi<PayoutAccount>('/sellers/me/payout-account', json('POST', body)),
  payouts: (params: { cursor?: string; limit?: number } = {}) =>
    fetchApi<PayoutPage>('/sellers/me/payouts', { params: toParams(params) }),
};

// Guide 9.1 Payouts and settings (built with Phase 5)
export const adminPaymentsApi = {
  payouts: (filters: { status?: PayoutStatus; cursor?: string; limit?: number } = {}) =>
    fetchApi<AdminPayoutPage>('/admin/payouts', { params: toParams(filters) }),
  retryPayout: (id: string) => fetchApi<AdminPayout>(`/admin/payouts/${id}/retry`, json('POST')),
  settings: () => fetchApi<PlatformSettings>('/admin/settings'),
  updateSettings: (body: UpdateSettingsBody) => fetchApi<PlatformSettings>('/admin/settings', json('PATCH', body)),
};
