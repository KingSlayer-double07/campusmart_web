export type OrderStatus = "Awaiting drop-off" | "Dropped off" | "Completed" | "Cancelled";

export type SellerOrder = {
  id: string;
  productName: string;
  productImage: string;
  orderId: string;
  category: string;
  price: number;
  quantity: number;
  status: OrderStatus;
  buyerName: string;
  placedAt: string;
};

// Listings use the generated types in lib/api/listings.ts (Phase 3). SellerOrder becomes a generated
// type in Phase 6.
