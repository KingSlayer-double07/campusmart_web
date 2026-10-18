import { toParams } from './admin';
import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type AdminUser = Schemas['AdminUserDto'];
export type AdminUserPage = Schemas['AdminUserPageDto'];
export type AssignableRole = Schemas['SetRoleDto']['role'];
export type UserRole = Schemas['UserRole'];
export type AdminListing = Schemas['AdminListingDto'];
export type AdminListingPage = Schemas['AdminListingPageDto'];
export type ModerateListingBody = Schemas['ModerateListingDto'];
export type RejectReason = Schemas['RejectReason'];
export type AdminReport = Schemas['AdminReportDto'];
export type AdminReportPage = Schemas['AdminReportPageDto'];
export type UpdateReportBody = Schemas['UpdateReportDto'];
export type ReportReason = Schemas['ReportReason'];
export type ReportReceipt = Schemas['ReportReceiptDto'];
export type AuditEntry = Schemas['AuditEntryDto'];
export type AuditPage = Schemas['AuditPageDto'];
export type AdminOverview = Schemas['AdminOverviewDto'];
export type ListingView = 'REVIEW' | 'HIDDEN' | 'ALL';
export type ReportStatus = UpdateReportBody['status'];

export interface AdminUserFilters {
  q?: string;
  role?: UserRole;
  institutionId?: string;
  suspended?: boolean;
  cursor?: string;
}

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  cursor?: string;
}

const json = (method: 'POST' | 'PATCH' | 'PUT', body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

// Decision M3: what a moderator picks when taking a listing down
export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  PROHIBITED_ITEM: 'Prohibited item',
  MISLEADING: 'Misleading or wrong category',
  POOR_PHOTOS: 'Poor photos',
  COUNTERFEIT: 'Counterfeit',
  DUPLICATE: 'Duplicate',
  OTHER: 'Other',
};

// What a buyer can report a listing for (M4, M4b)
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  PROHIBITED_ITEM: 'Prohibited item',
  MISLEADING: 'Misleading description or photos',
  COUNTERFEIT: 'Counterfeit or fake',
  SCAM: 'Looks like a scam',
  OFFENSIVE: 'Offensive',
  OTHER: 'Something else',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  BUYER: 'Buyer',
  SELLER: 'Seller',
  ADMIN: 'Admin',
  PICKUP_AGENT: 'Pickup agent',
  DISPATCH: 'Rider',
};

// Phase 9: users, listing moderation, reports, the audit log and the overview
export const moderationApi = {
  users: (filters: AdminUserFilters = {}) => fetchApi<AdminUserPage>('/admin/users', { params: toParams(filters) }),
  setRole: (id: string, role: AssignableRole) => fetchApi<AdminUser>(`/admin/users/${id}/role`, json('PATCH', { role })),
  suspend: (id: string, reason: string) => fetchApi<AdminUser>(`/admin/users/${id}/suspend`, json('POST', { reason })),
  unsuspend: (id: string) => fetchApi<AdminUser>(`/admin/users/${id}/unsuspend`, json('POST')),

  listings: (view: ListingView, filters: { q?: string; cursor?: string } = {}) =>
    fetchApi<AdminListingPage>('/admin/listings', { params: toParams({ view, ...filters }) }),
  moderate: (id: string, body: ModerateListingBody) =>
    fetchApi<AdminListing>(`/admin/listings/${id}/moderate`, json('POST', body)),

  reports: (status: ReportStatus, cursor?: string) =>
    fetchApi<AdminReportPage>('/admin/support-reports', { params: toParams({ status, cursor }) }),
  updateReport: (id: string, body: UpdateReportBody) =>
    fetchApi<AdminReport>(`/admin/support-reports/${id}`, json('PATCH', body)),

  auditLog: (filters: AuditFilters = {}) => fetchApi<AuditPage>('/admin/audit-log', { params: toParams(filters) }),
  overview: () => fetchApi<AdminOverview>('/admin/overview'),

  bannedWords: () => fetchApi<{ words: string[] }>('/admin/settings/banned-words'),
  setBannedWords: (words: string[]) =>
    fetchApi<{ words: string[] }>('/admin/settings/banned-words', json('PUT', { words })),
};

// Any verified user, once per listing
export const reportsApi = {
  reportListing: (listingId: string, body: { reason: ReportReason; details?: string }) =>
    fetchApi<ReportReceipt>(`/listings/${listingId}/report`, json('POST', body)),
};
