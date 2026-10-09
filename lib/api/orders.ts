import { fetchApi } from './client';
import type { SellerOrder, OrderStatus } from "@/types";

// The seller's side of orders, still on the old mock types until Phase 6. The buyer's side
// (checkout, GET /orders) is in ./checkout.ts.

export const ordersApi = {
  // Fetch orders received by the seller
  fetchOrders: async (): Promise<SellerOrder[]> => {
    return fetchApi<SellerOrder[]>('/orders', {
      method: 'GET',
    });
  },

  // Update the status of an order (e.g. from 'Awaiting drop-off' to 'Dropped off')
  updateOrderStatus: async (id: string, status: OrderStatus): Promise<SellerOrder> => {
    return fetchApi<SellerOrder>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};
