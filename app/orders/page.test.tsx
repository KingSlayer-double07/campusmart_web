import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const buyerOrdersApi = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ buyerOrdersApi, cartApi: {} }));

import OrdersPage from "./page";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrdersPage />
    </QueryClientProvider>,
  );
}

describe("OrdersPage", () => {
  // Braces matter: a function returned from beforeEach runs as a cleanup hook
  beforeEach(() => {
    buyerOrdersApi.list.mockReset();
  });
  afterEach(cleanup);

  it("lists orders with each store and links to the detail", async () => {
    buyerOrdersApi.list.mockResolvedValue({
      items: [
        {
          id: "o1",
          status: "PAID",
          paymentMethod: "CARD",
          totalKobo: 900_000,
          createdAt: "2026-10-09T10:00:00Z",
          expiresAt: "2026-10-09T10:30:00Z",
          pickupStation: { id: "st1", name: "Library Pickup Point" },
          sellerOrders: [{ id: "so1", code: "CM-7F3K2Q", seller: { id: "s1", storeName: "Tunde Tech" }, fulfillmentStatus: "DROPPED_OFF", subtotalKobo: 900_000, itemCount: 2, imageUrl: null }],
        },
      ],
      nextCursor: null,
    });
    renderPage();
    expect(await screen.findByText("Tunde Tech")).toBeTruthy();
    expect(screen.getByText("2 items · Ready for pickup")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByRole("link", { name: /₦9,000/ }).getAttribute("href")).toBe("/orders/o1");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("has loading, empty and error states", async () => {
    buyerOrdersApi.list.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByLabelText("Loading your orders")).toBeTruthy();
    cleanup();

    buyerOrdersApi.list.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("No orders yet")).toBeTruthy();
    cleanup();

    buyerOrdersApi.list.mockRejectedValue(new Error("offline"));
    renderPage();
    expect(await screen.findByText("We couldn't load your orders")).toBeTruthy();
  });
});
