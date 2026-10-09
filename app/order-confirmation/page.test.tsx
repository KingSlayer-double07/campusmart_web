import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const search = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.value, useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/app/components/ListingsCarousel", () => ({ default: () => null }));
const buyerOrdersApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ buyerOrdersApi, cartApi: {} }));

import OrderConfirmationPage from "./page";

const order = (status: string) => ({
  id: "o1",
  status,
  paymentMethod: "CARD",
  subtotalKobo: 900_000,
  totalKobo: 900_000,
  createdAt: "2026-10-09T10:00:00Z",
  expiresAt: "2026-10-09T10:30:00Z",
  paidAt: null,
  pickupStation: { id: "st1", name: "Library Pickup Point", address: "Main library", contactName: "", contactPhone: "", openingHours: [] },
  sellerOrders: [
    { id: "so1", code: "CM-7F3K2Q", seller: { id: "s1", storeName: "Tunde Tech" }, fulfillmentStatus: "AWAITING_DROPOFF", items: [] },
    { id: "so2", code: "CM-ABC234", seller: { id: "s2", storeName: "Ada Wears" }, fulfillmentStatus: "AWAITING_DROPOFF", items: [] },
  ],
});

function renderPage(query: string) {
  search.value = new URLSearchParams(query);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderConfirmationPage />
    </QueryClientProvider>,
  );
}

describe("OrderConfirmationPage", () => {
  beforeEach(() => {
    buyerOrdersApi.get.mockReset();
  });
  afterEach(cleanup);

  it("shows each seller order's code and the station once paid", async () => {
    buyerOrdersApi.get.mockResolvedValue(order("PAID"));
    renderPage("orderId=o1");
    expect(await screen.findByText("Payment received")).toBeTruthy();
    expect(screen.getByText("CM-7F3K2Q")).toBeTruthy();
    expect(screen.getByText("CM-ABC234")).toBeTruthy();
    expect(screen.getByText("Library Pickup Point")).toBeTruthy();
    expect(screen.getByText(/You'll be told when it's ready/)).toBeTruthy();
  });

  it("waits for the payment while polling", async () => {
    buyerOrdersApi.get.mockResolvedValue(order("PENDING_PAYMENT"));
    renderPage("orderId=o1");
    expect(await screen.findByText("Confirming your payment…")).toBeTruthy();
  });

  it("is honest when online payment isn't switched on yet", async () => {
    buyerOrdersApi.get.mockResolvedValue(order("PENDING_PAYMENT"));
    renderPage("orderId=o1&payment=unavailable");
    expect(await screen.findByText("Order placed, waiting for payment")).toBeTruthy();
    expect(screen.getByText(/Online payment isn't switched on yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View order" }).getAttribute("href")).toBe("/orders/o1");
  });

  it("says when the order lapsed, or there's no order", async () => {
    buyerOrdersApi.get.mockResolvedValue(order("EXPIRED"));
    renderPage("orderId=o1");
    expect(await screen.findByText("This order wasn't paid in time")).toBeTruthy();
    cleanup();

    renderPage("");
    expect(await screen.findByText("There's no order to show here")).toBeTruthy();
    expect(buyerOrdersApi.get).toHaveBeenCalledTimes(1);
  });
});
