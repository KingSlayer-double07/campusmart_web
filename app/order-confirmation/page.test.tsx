import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const search = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.value, useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/app/components/ListingsCarousel", () => ({ default: () => null }));
const buyerOrdersApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ buyerOrdersApi, cartApi: {} }));
const paymentsApi = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/api/payments", () => ({ paymentsApi }));

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
  pickupStation: null,
  destination: { campusPlace: { id: "p1", name: "Faculty of Science" }, address: null },
  deliveryFeeKobo: 50_000,
  buyerPhone: "+234 801 234 5678",
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
    paymentsApi.verify.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("asks Paystack once when the payment hasn't shown up after 10 seconds (guide 5.3)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    buyerOrdersApi.get.mockResolvedValue(order("PENDING_PAYMENT"));
    paymentsApi.verify.mockResolvedValue({ orderId: "o1", status: "PENDING_PAYMENT" });
    // Paystack sends the buyer back with trxref and reference added
    renderPage("orderId=o1&trxref=CM_o1_1&reference=CM_o1_1");
    expect(await screen.findByText("Confirming your payment…")).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(9_000));
    expect(paymentsApi.verify).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(paymentsApi.verify).toHaveBeenCalledTimes(1);
    expect(paymentsApi.verify).toHaveBeenCalledWith("CM_o1_1");
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(paymentsApi.verify).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask Paystack without a reference, or once the order is paid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    buyerOrdersApi.get.mockResolvedValue(order("PENDING_PAYMENT"));
    renderPage("orderId=o1");
    await screen.findByText("Confirming your payment…");
    await act(() => vi.advanceTimersByTimeAsync(12_000));
    cleanup();

    buyerOrdersApi.get.mockResolvedValue(order("PAID"));
    renderPage("orderId=o1&reference=CM_o1_1");
    await screen.findByText("Payment received");
    await act(() => vi.advanceTimersByTimeAsync(12_000));
    expect(paymentsApi.verify).not.toHaveBeenCalled();
  });

  it("shows each seller order's code and where it's delivered once paid", async () => {
    buyerOrdersApi.get.mockResolvedValue(order("PAID"));
    renderPage("orderId=o1");
    expect(await screen.findByText("Payment received")).toBeTruthy();
    expect(screen.getByText("CM-7F3K2Q")).toBeTruthy();
    expect(screen.getByText("CM-ABC234")).toBeTruthy();
    expect(screen.getByText("Delivery to Faculty of Science")).toBeTruthy();
    expect(screen.getByText(/We'll keep you posted/)).toBeTruthy();
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
