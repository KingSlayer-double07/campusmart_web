import type { SellerSideOrder } from "@/lib/api/dispatch";

// A seller-side order for the tests, with only what each test changes passed in
export const sellerOrder = (overrides: Partial<SellerSideOrder> = {}): SellerSideOrder => ({
  id: "so1",
  code: "CM-7F3K2Q",
  placedAt: "2026-10-17T10:00:00Z",
  buyerName: "tobi",
  deliveryMethod: "DISPATCH",
  items: [{ title: "Desk lamp", variantLabel: null, imageUrl: null, quantity: 1, unitPriceKobo: 450_000 }],
  subtotalKobo: 450_000,
  sellerPayoutKobo: 450_000,
  fulfillmentStatus: "AWAITING_RIDER",
  escrowStatus: "HELD",
  pickupDeadline: "2026-10-20T10:00:00Z",
  rider: null,
  arrivalFrom: null,
  arrivalTo: null,
  pickedUpAt: null,
  notReadyAt: null,
  notReadyNote: null,
  handedOverAt: null,
  releaseAt: null,
  cancelledAt: null,
  cancelReason: null,
  canCancel: true,
  handoverLocked: false,
  ...overrides,
});
