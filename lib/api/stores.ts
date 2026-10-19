import { toParams } from './admin';
import { fetchApi } from './client';
import type { ListingPage } from './listings';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type StoreCard = Schemas['StoreCardDto'];
export type StorePage = Schemas['StorePageDto'];
export type Store = Schemas['StoreDto'];

// Guide 8.2: stores at the user's school
export const storesApi = {
  list: (params: { featured?: boolean; limit?: number; cursor?: string } = {}) =>
    fetchApi<StorePage>('/stores', { params: toParams(params) }),
  detail: (sellerId: string) => fetchApi<Store>(`/stores/${sellerId}`),
  listings: (sellerId: string, cursor?: string) => fetchApi<ListingPage>(`/stores/${sellerId}/listings`, { params: toParams({ cursor }) }),
};
