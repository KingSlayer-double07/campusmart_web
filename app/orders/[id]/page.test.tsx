import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "o1" }), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const buyerOrdersApi = vi.hoisted(() => ({ pickupStations: vi.fn(), checkout: vi.fn(), list: vi.fn(), get: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ buyerOrdersApi, cartApi: {} }));

import { ApiError } from "@/lib/api/client";
import OrderDetailPage from "./page";

const sellerOrder = (overrides: object = {}) => ({
  id: "so1",
  code: "CM-7F3K2Q",
  collectionCode: "048213",
  seller: { id: "s1", storeName: "Tunde Tech" },
  fulfillmentStatus: "AWAITING_DROPOFF",
  subtotalKobo: 900_000,
  itemCount: 2,
  imageUrl: null,
  dropOffDeadline: null,
  droppedOffAt: null,
  collectedAt: null,
  cancelledAt: null,
  cancelReason: null,
  items: [{ id: "i1", listingId: "l1", variantId: null, title: "Desk lamp", variantLabel: null, imageUrl: null, unitPriceKobo: 450_000, quantity: 2 }],
  ...overrides,
});
const order = (overrides: object = {}, so: object = {}) => ({
  id: "o1",
  status: "PAID",
  paymentMethod: "CARD",
  subtotalKobo: 900_000,
  totalKobo: 900_000,
  createdAt: "2026-10-09T10:00:00Z",
  expiresAt: "2026-10-09T10:30:00Z",
  paidAt: "2026-10-09T10:05:00Z",
  pickupStation: {
    id: "st1",
    name: "Library Pickup Point",
    address: "Main library",
    contactName: "Mr Bello",
    contactPhone: "+234 801 234 5678",
    openingHours: [{ day: "MON", open: "09:00", close: "17:00" }],
  },
  sellerOrders: [sellerOrder(so)],
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderDetailPage />
    </QueryClientProvider>,
  );
}

describe("OrderDetailPage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows the per-seller timeline, and the collection code only once dropped off", async () => {
    buyerOrdersApi.get.mockResolvedValue(order());
    renderPage();
    expect(await screen.findByText("CM-7F3K2Q")).toBeTruthy();
    expect(screen.queryByText("048213")).toBeNull();
    expect(screen.getByText("Drop-off").closest("li")?.getAttribute("aria-current")).toBe("step");
    cleanup();

    buyerOrdersApi.get.mockResolvedValue(order({}, { fulfillmentStatus: "DROPPED_OFF" }));
    renderPage();
    expect(await screen.findByText("048213")).toBeTruthy();
    expect(screen.getByText("Your collection code")).toBeTruthy();
    expect(screen.getByText("Ready for pickup").closest("li")?.getAttribute("aria-current")).toBe("step");
  });

  it("cancels an unpaid order after asking", async () => {
    const cancelled = order({ status: "CANCELLED", paidAt: null }, { fulfillmentStatus: "CANCELLED", cancelReason: "BUYER_CANCELLED" });
    buyerOrdersApi.get
      .mockResolvedValueOnce(order({ status: "PENDING_PAYMENT", paidAt: null }, { fulfillmentStatus: "PENDING" }))
      .mockResolvedValue(cancelled);
    buyerOrdersApi.cancel.mockResolvedValue(cancelled);
    renderPage();
    expect(await screen.findByText(/Waiting for payment/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, cancel it" }));
    await waitFor(() => expect(buyerOrdersApi.cancel).toHaveBeenCalledWith("o1"));
    expect(await screen.findByText("Order cancelled")).toBeTruthy();
    expect(await screen.findByText("Cancelled by you")).toBeTruthy();
  });

  it("says when the order isn't yours or can't load", async () => {
    buyerOrdersApi.get.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Order not found"));
    renderPage();
    expect(await screen.findByText("We can't find this order")).toBeTruthy();
    cleanup();

    buyerOrdersApi.get.mockRejectedValue(new ApiError(0, "NETWORK", "offline"));
    renderPage();
    expect(await screen.findByText("We couldn't load this order")).toBeTruthy();
  });
});
