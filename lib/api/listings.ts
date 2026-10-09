import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type ListingCard = Schemas['ListingCardDto'];
export type Listing = Schemas['ListingDto'];
export type ListingPage = Schemas['ListingPageDto'];
export type ListingImage = Schemas['ListingImageDto'];
export type ListingVariant = Schemas['ListingVariantDto'];
export type CreateListingBody = Schemas['CreateListingDto'];
export type UpdateListingBody = Schemas['UpdateListingDto'];
export type ListingSort = Schemas['ListingSort'];
export type SellerProfile = Schemas['SellerProfileDto'];
export type UpdateSellerProfileBody = Schemas['UpdateSellerProfileDto'];
export type UploadPurpose = Schemas['UploadPurpose'];
export type UploadSignature = Schemas['UploadSignatureDto'];
export type OwnerListingStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ListingFilters {
  q?: string;
  category?: Schemas['ListingCategory'];
  condition?: Schemas['ProductCondition'];
  minPriceKobo?: number;
  maxPriceKobo?: number;
  sort?: ListingSort;
  limit?: number;
}

function params(values: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  );
}

const json = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const listingsApi = {
  browse: (filters: ListingFilters & { cursor?: string }) =>
    fetchApi<ListingPage>('/listings', { params: params(filters) }),
  get: (id: string) => fetchApi<Listing>(`/listings/${id}`),
  related: (id: string) => fetchApi<ListingCard[]>(`/listings/${id}/related`),
  mine: (filters: { status?: Schemas['ListingStatus']; cursor?: string; limit?: number }) =>
    fetchApi<ListingPage>('/sellers/me/listings', { params: params(filters) }),
  create: (body: CreateListingBody) => fetchApi<Listing>('/listings', json('POST', body)),
  update: (id: string, body: UpdateListingBody) => fetchApi<Listing>(`/listings/${id}`, json('PATCH', body)),
  setStatus: (id: string, status: OwnerListingStatus) =>
    fetchApi<Listing>(`/listings/${id}/status`, json('PATCH', { status })),
  remove: (id: string) => fetchApi<void>(`/listings/${id}`, { method: 'DELETE' }),
};

export const sellersApi = {
  me: () => fetchApi<SellerProfile>('/sellers/me'),
  update: (body: UpdateSellerProfileBody) => fetchApi<SellerProfile>('/sellers/me', json('PATCH', body)),
};

export const uploadsApi = {
  signature: (purpose: UploadPurpose) => fetchApi<UploadSignature>('/uploads/signature', json('POST', { purpose })),
};
