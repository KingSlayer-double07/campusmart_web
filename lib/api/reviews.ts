import { toParams } from './admin';
import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type Review = Schemas['ReviewDto'];
export type ReviewPage = Schemas['ReviewPageDto'];
export type CreateReviewBody = Schemas['CreateReviewDto'];
export type AdminReview = Schemas['AdminReviewDto'];
export type AdminReviewPage = Schemas['AdminReviewPageDto'];
export type AdminReviewView = 'SHOWN' | 'HIDDEN';

const post = (body?: unknown): RequestInit => ({ method: 'POST', ...(body !== undefined && { body: JSON.stringify(body) }) });

// Guide 8.4: rating what you received, and reading reviews
export const reviewsApi = {
  forListing: (listingId: string, cursor?: string) =>
    fetchApi<ReviewPage>(`/listings/${listingId}/reviews`, { params: toParams({ cursor }) }),
  forStore: (sellerId: string, cursor?: string) => fetchApi<ReviewPage>(`/stores/${sellerId}/reviews`, { params: toParams({ cursor }) }),
  create: (sellerOrderId: string, body: CreateReviewBody) => fetchApi<Review>(`/seller-orders/${sellerOrderId}/reviews`, post(body)),
};

// Decision R4: admins hide an abusive review
export const adminReviewsApi = {
  list: (view: AdminReviewView, cursor?: string) => fetchApi<AdminReviewPage>('/admin/reviews', { params: toParams({ view, cursor }) }),
  hide: (id: string, reason: string) => fetchApi<AdminReview>(`/admin/reviews/${id}/hide`, post({ reason })),
  show: (id: string) => fetchApi<AdminReview>(`/admin/reviews/${id}/show`, post()),
};
