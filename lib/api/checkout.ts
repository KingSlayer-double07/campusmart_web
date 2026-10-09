import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type Cart = Schemas['CartDto'];
export type CartGroup = Schemas['CartGroupDto'];
export type ServerCartItem = Schemas['CartItemDto'];
export type CartIssue = Schemas['CartIssueDto'];
export type MergeCartLine = Schemas['MergeCartLineDto'];
export type PickupStation = Schemas['PickupStationDto'];
export type CheckoutResult = Schemas['CheckoutResultDto'];
export type Order = Schemas['OrderDto'];
export type OrderSummary = Schemas['OrderSummaryDto'];
export type OrderPage = Schemas['OrderPageDto'];
export type SellerOrder = Schemas['SellerOrderDto'];
export type PaymentMethod = Schemas['PaymentMethod'];

const json = (method: 'POST' | 'PUT', body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

// Guide 4.1: the signed-in buyer's cart. Every write returns the whole cart.
export const cartApi = {
  get: () => fetchApi<Cart>('/cart'),
  setItem: (body: { listingId: string; variantId?: string; quantity: number }) =>
    fetchApi<Cart>('/cart/items', json('PUT', body)),
  removeItem: (id: string) => fetchApi<void>(`/cart/items/${id}`, { method: 'DELETE' }),
  merge: (items: MergeCartLine[]) => fetchApi<Cart>('/cart/merge', json('POST', { items })),
};

// Guide 4.2: stations, checkout and the buyer's own orders
export const buyerOrdersApi = {
  pickupStations: () => fetchApi<PickupStation[]>('/pickup-stations'),
  checkout: (body: { pickupStationId: string; paymentMethod: PaymentMethod; idempotencyKey: string }) =>
    fetchApi<CheckoutResult>('/orders/checkout', json('POST', body)),
  list: (params: { cursor?: string; limit?: number } = {}) =>
    fetchApi<OrderPage>('/orders', {
      params: Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ),
    }),
  get: (id: string) => fetchApi<Order>(`/orders/${id}`),
  cancel: (id: string) => fetchApi<Order>(`/orders/${id}/cancel`, { method: 'POST' }),
};
