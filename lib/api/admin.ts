import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type AdminInstitution = Schemas['AdminInstitutionDto'];
export type AdminInstitutionPage = Schemas['AdminInstitutionPageDto'];
export type CreateInstitutionBody = Schemas['CreateInstitutionDto'];
export type UpdateInstitutionBody = Schemas['UpdateInstitutionDto'];
export type AdminPickupStation = Schemas['AdminPickupStationDto'];
export type AdminPickupStationPage = Schemas['AdminPickupStationPageDto'];
export type CreatePickupStationBody = Schemas['CreatePickupStationDto'];
export type UpdatePickupStationBody = Schemas['UpdatePickupStationDto'];
export type OpeningHours = Schemas['OpeningHoursDto'];
export type Weekday = Schemas['Weekday'];
export type ActiveFilter = Schemas['ActiveFilter'];
export type AdminVerificationRequest = Schemas['AdminVerificationRequestDto'];
export type AdminVerificationPage = Schemas['AdminVerificationPageDto'];
export type ReviewQueue = Schemas['ReviewQueue'];
export type DecideVerificationBody = Schemas['DecideVerificationDto'];

export interface AdminListFilters {
  q?: string;
  status?: ActiveFilter;
  cursor?: string;
  limit?: number;
}

export interface StationFilters extends AdminListFilters {
  institutionId?: string;
}

// Drops empty filters so they never reach the URL as "undefined"
export function toParams(filters: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  );
}

const json = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const adminApi = {
  institutions: (filters: AdminListFilters = {}) =>
    fetchApi<AdminInstitutionPage>('/admin/institutions', { params: toParams(filters) }),
  createInstitution: (body: CreateInstitutionBody) =>
    fetchApi<AdminInstitution>('/admin/institutions', json('POST', body)),
  updateInstitution: (id: string, body: UpdateInstitutionBody) =>
    fetchApi<AdminInstitution>(`/admin/institutions/${id}`, json('PATCH', body)),

  stations: (filters: StationFilters = {}) =>
    fetchApi<AdminPickupStationPage>('/admin/pickup-stations', { params: toParams(filters) }),
  createStation: (body: CreatePickupStationBody) =>
    fetchApi<AdminPickupStation>('/admin/pickup-stations', json('POST', body)),
  updateStation: (id: string, body: UpdatePickupStationBody) =>
    fetchApi<AdminPickupStation>(`/admin/pickup-stations/${id}`, json('PATCH', body)),

  verificationRequests: (filters: { status?: ReviewQueue; cursor?: string; limit?: number } = {}) =>
    fetchApi<AdminVerificationPage>('/admin/verification-requests', { params: toParams(filters) }),
  decideVerification: (id: string, body: DecideVerificationBody) =>
    fetchApi<AdminVerificationRequest>(`/admin/verification-requests/${id}/decide`, json('POST', body)),
};
