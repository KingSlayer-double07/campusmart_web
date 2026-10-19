import { toParams } from './admin';
import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type DeliveryJob = Schemas['DeliveryJobDto'];
export type DeliveryJobPage = Schemas['DeliveryJobPageDto'];
export type JobStop = Schemas['JobStopDto'];
export type JobScope = Schemas['JobScope'];
export type ArrivalWindow = Schemas['ArrivalWindowDto'];
export type RiderProblemReason = Schemas['RiderProblemReason'];
export type SellerSideOrder = Schemas['SellerSideOrderDto'];
export type SellerSideOrderPage = Schemas['SellerSideOrderPageDto'];
export type SellerOrderTab = Schemas['SellerOrderTab'];
export type SellerOrderCounts = Schemas['SellerOrderCountsDto'];
export type BuyerProblemReason = Schemas['BuyerProblemReason'];
export type ReportProblemBody = Schemas['ReportProblemDto'];
export type ReportResult = Schemas['ReportResultDto'];
export type InviteInfo = Schemas['InviteInfoDto'];
export type AdminRider = Schemas['AdminRiderDto'];
export type AdminRiderPage = Schemas['AdminRiderPageDto'];
export type InviteRiderBody = Schemas['InviteRiderDto'];
export type AdminDeliveryJob = Schemas['AdminDeliveryJobDto'];
export type AdminDeliveryJobPage = Schemas['AdminDeliveryJobPageDto'];
export type DeliveryView = Schemas['DeliveryView'];
export type LockedHandover = Schemas['LockedHandoverDto'];
export type LockedHandoverPage = Schemas['LockedHandoverPageDto'];
export type AdminDispute = Schemas['AdminDisputeDto'];
export type AdminDisputePage = Schemas['AdminDisputePageDto'];
export type ResolveDisputeBody = Schemas['ResolveDisputeDto'];
export type AdminProblem = Schemas['AdminProblemDto'];
export type AdminProblemPage = Schemas['AdminProblemPageDto'];
export type Fault = Schemas['Fault'];
export type User = Schemas['UserDto'];

const json = (method: 'POST' | 'PATCH', body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

// Phase 6: the rider app (DISPATCH)
export const riderApi = {
  jobs: (params: { scope: JobScope; cursor?: string }) =>
    fetchApi<DeliveryJobPage>('/dispatch/jobs', { params: toParams(params) }),
  job: (id: string) => fetchApi<DeliveryJob>(`/dispatch/jobs/${id}`),
  accept: (id: string, windows: ArrivalWindow[]) =>
    fetchApi<DeliveryJob>(`/dispatch/jobs/${id}/accept`, json('POST', { windows })),
  updateWindow: (id: string, sellerOrderId: string, body: { from: string; to: string }) =>
    fetchApi<DeliveryJob>(`/dispatch/jobs/${id}/stops/${sellerOrderId}/window`, json('PATCH', body)),
  pickup: (id: string, code: string) => fetchApi<DeliveryJob>(`/dispatch/jobs/${id}/pickups`, json('POST', { code })),
  notReady: (id: string, sellerOrderId: string, note?: string) =>
    fetchApi<DeliveryJob>(`/dispatch/jobs/${id}/stops/${sellerOrderId}/not-ready`, json('POST', note ? { note } : {})),
  handOver: (id: string, sellerOrderId: string, code: string) =>
    fetchApi<DeliveryJob>(`/dispatch/jobs/${id}/handovers`, json('POST', { sellerOrderId, code })),
  drop: (id: string) => fetchApi<DeliveryJob>(`/dispatch/jobs/${id}/drop`, json('POST')),
  report: (id: string, body: { reason: RiderProblemReason; details?: string }) =>
    fetchApi<ReportResult>(`/dispatch/jobs/${id}/problems`, json('POST', body)),
};

// Decision DX1: the invite link
export const inviteApi = {
  info: (token: string) => fetchApi<InviteInfo>(`/auth/invites/${encodeURIComponent(token)}`),
  accept: (token: string, password: string) =>
    fetchApi<User>('/auth/accept-invite', json('POST', { token, password })),
};

// Guide 6.2, rebuilt: the seller's orders
export const sellerOrdersApi = {
  list: (params: { tab: SellerOrderTab; cursor?: string }) =>
    fetchApi<SellerSideOrderPage>('/sellers/me/orders', { params: toParams(params) }),
  counts: () => fetchApi<SellerOrderCounts>('/sellers/me/orders/counts'),
  get: (id: string) => fetchApi<SellerSideOrder>(`/sellers/me/orders/${id}`),
  cancel: (id: string, reason: string) =>
    fetchApi<SellerSideOrder>(`/sellers/me/orders/${id}/cancel`, json('POST', { reason })),
  handOver: (id: string, code: string) =>
    fetchApi<SellerSideOrder>(`/sellers/me/orders/${id}/handover`, json('POST', { code })),
};

// Decision C8: report a problem with one store's order
export const problemsApi = {
  report: (orderId: string, sellerOrderId: string, body: ReportProblemBody) =>
    fetchApi<ReportResult>(`/orders/${orderId}/seller-orders/${sellerOrderId}/problems`, json('POST', body)),
};

export const adminDispatchApi = {
  riders: (filters: { q?: string; status?: string; institutionId?: string; cursor?: string; limit?: number } = {}) =>
    fetchApi<AdminRiderPage>('/admin/riders', { params: toParams(filters) }),
  inviteRider: (body: InviteRiderBody) => fetchApi<AdminRider>('/admin/riders', json('POST', body)),
  resendInvite: (id: string) => fetchApi<AdminRider>(`/admin/riders/${id}/resend-invite`, json('POST')),
  setRiderActive: (id: string, isActive: boolean, reason: string) =>
    fetchApi<AdminRider>(`/admin/riders/${id}`, json('PATCH', { isActive, reason })),

  deliveries: (filters: { view: DeliveryView; institutionId?: string; cursor?: string }) =>
    fetchApi<AdminDeliveryJobPage>('/admin/deliveries', { params: toParams(filters) }),
  assign: (id: string, riderId: string, reason?: string) =>
    fetchApi<AdminDeliveryJob>(`/admin/deliveries/${id}/assign`, json('POST', { riderId, ...(reason && { reason }) })),
  locked: (cursor?: string) => fetchApi<LockedHandoverPage>('/admin/locked-handovers', { params: toParams({ cursor }) }),
  unlock: (sellerOrderId: string, reason: string) =>
    fetchApi<{ sellerOrderId: string; unlocked: boolean }>(`/admin/seller-orders/${sellerOrderId}/unlock`, json('POST', { reason })),
  refund: (sellerOrderId: string, fault: Fault, reason: string) =>
    fetchApi<{ sellerOrderId: string; refunded: boolean }>(`/admin/seller-orders/${sellerOrderId}/refund`, json('POST', { fault, reason })),

  disputes: (filters: { status: 'OPEN' | 'RESOLVED'; cursor?: string }) =>
    fetchApi<AdminDisputePage>('/admin/disputes', { params: toParams(filters) }),
  dispute: (id: string) => fetchApi<AdminDispute>(`/admin/disputes/${id}`),
  resolve: (id: string, body: ResolveDisputeBody) => fetchApi<AdminDispute>(`/admin/disputes/${id}/resolve`, json('POST', body)),
  problems: (filters: { status: 'OPEN' | 'CLOSED'; cursor?: string }) =>
    fetchApi<AdminProblemPage>('/admin/problems', { params: toParams(filters) }),
  closeProblem: (id: string, note: string) =>
    fetchApi<{ id: string; closed: boolean }>(`/admin/problems/${id}/close`, json('POST', { note })),
};
