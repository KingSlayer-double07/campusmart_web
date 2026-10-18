import { toParams } from './admin';
import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type WishlistItem = Schemas['WishlistItemDto'];
export type WishlistPage = Schemas['WishlistPageDto'];
export type WishlistIds = Schemas['WishlistIdsDto'];

// Guide 8.1: favourites in the account
export const wishlistApi = {
  list: (params: { cursor?: string; limit?: number } = {}) => fetchApi<WishlistPage>('/wishlist', { params: toParams(params) }),
  ids: () => fetchApi<WishlistIds>('/wishlist/ids'),
  add: (listingId: string) => fetchApi<void>(`/wishlist/${listingId}`, { method: 'PUT' }),
  remove: (listingId: string) => fetchApi<void>(`/wishlist/${listingId}`, { method: 'DELETE' }),
  // Decision R5: favourites this phone saved before sign-in
  merge: (listingIds: string[]) =>
    fetchApi<WishlistIds>('/wishlist/merge', { method: 'POST', body: JSON.stringify({ listingIds }) }),
};
