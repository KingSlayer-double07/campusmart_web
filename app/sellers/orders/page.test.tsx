import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const sellerOrdersApi = vi.hoisted(() => ({ list: vi.fn(), counts: vi.fn() }));
vi.mock("@/lib/api/dispatch", () => ({ sellerOrdersApi }));

import { ApiError } from "@/lib/api/client";
import { sellerOrder } from "./fixtures";
import OrdersPage from "./page";

const counts = { TO_PREPARE: 2, ON_THE_WAY: 0, DONE: 1, PROBLEMS: 0, CANCELLED: 0 };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrdersPage />
    </QueryClientProvider>,
  );
}

describe("Seller OrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sellerOrdersApi.counts.mockResolvedValue(counts);
  });
  afterEach(cleanup);

  it("lists orders to prepare with what happens next, and switches tabs", async () => {
    sellerOrdersApi.list.mockResolvedValue({
      items: [
        sellerOrder({
          fulfillmentStatus: "RIDER_ASSIGNED",
          rider: { name: "Musa Bello" },
          arrivalFrom: "2026-10-18T13:00:00Z",
          arrivalTo: "2026-10-18T15:00:00Z",
        }),
        sellerOrder({ id: "so2", code: "CM-ABC234", deliveryMethod: "SELLER_PICKUP", fulfillmentStatus: "AWAITING_PICKUP" }),
      ],
      nextCursor: null,
    });
    renderPage();
    expect(await screen.findByText("CM-7F3K2Q")).toBeTruthy();
    expect(screen.getByText(/Musa Bello comes .* Give them the code CM-7F3K2Q/)).toBeTruthy();
    expect(screen.getByText(/The buyer collects it from you by/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "To prepare (2)" }).getAttribute("aria-selected")).toBe("true");
    expect(sellerOrdersApi.list).toHaveBeenCalledWith({ tab: "TO_PREPARE", cursor: undefined });
    // There is no "Mark as" menu any more: riders, buyers and the clock move orders on
    expect(screen.queryByText(/Mark as/)).toBeNull();

    sellerOrdersApi.list.mockResolvedValue({ items: [], nextCursor: null });
    fireEvent.click(screen.getByRole("tab", { name: "Problems" }));
    await waitFor(() => expect(sellerOrdersApi.list).toHaveBeenCalledWith({ tab: "PROBLEMS", cursor: undefined }));
    expect(await screen.findByText("Nothing here")).toBeTruthy();
  });

  it("says when the orders can't load", async () => {
    sellerOrdersApi.list.mockRejectedValue(new ApiError(0, "NETWORK", "offline"));
    renderPage();
    expect(await screen.findByText("We couldn't load your orders")).toBeTruthy();
  });
});
