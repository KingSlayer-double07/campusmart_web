import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "so1" }), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const sellerOrdersApi = vi.hoisted(() => ({ get: vi.fn(), cancel: vi.fn(), handOver: vi.fn(), list: vi.fn(), counts: vi.fn() }));
vi.mock("@/lib/api/dispatch", () => ({ sellerOrdersApi }));

import { ApiError } from "@/lib/api/client";
import { sellerOrder } from "../fixtures";
import SellerOrderDetailPage from "./page";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SellerOrderDetailPage />
    </QueryClientProvider>,
  );
}

describe("SellerOrderDetailPage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows the CM- code with a QR for the rider, and cancels with a reason (F10)", async () => {
    sellerOrdersApi.get.mockResolvedValue(sellerOrder({ fulfillmentStatus: "RIDER_ASSIGNED", rider: { name: "Musa Bello" } }));
    sellerOrdersApi.cancel.mockResolvedValue(sellerOrder({ fulfillmentStatus: "CANCELLED", canCancel: false, cancelReason: "SELLER_CANCELLED" }));
    renderPage();
    expect(await screen.findByText("CM-7F3K2Q")).toBeTruthy();
    expect(await screen.findByRole("img", { name: "QR code for CM-7F3K2Q" })).toBeTruthy();
    expect(screen.getByText("Rider: Musa Bello")).toBeTruthy();
    // The buyer's email and phone never reach the seller
    expect(screen.queryByText(/@/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel and refund the buyer" }));
    expect(await within(dialog).findByText("Say why, in a few words")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Why?"), { target: { value: "Sold out in my shop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel and refund the buyer" }));
    await waitFor(() => expect(sellerOrdersApi.cancel).toHaveBeenCalledWith("so1", "Sold out in my shop"));
    expect(await screen.findByText("Order cancelled")).toBeTruthy();
  });

  it("a buyer collecting gives their code; the seller enters it (DL5)", async () => {
    sellerOrdersApi.get.mockResolvedValue(sellerOrder({ deliveryMethod: "SELLER_PICKUP", fulfillmentStatus: "AWAITING_PICKUP" }));
    sellerOrdersApi.handOver
      .mockRejectedValueOnce(new ApiError(400, "WRONG_CODE", "That code isn't right. 4 tries left."))
      .mockResolvedValue(sellerOrder({ deliveryMethod: "SELLER_PICKUP", fulfillmentStatus: "COLLECTED", canCancel: false }));
    renderPage();
    const input = await screen.findByLabelText("Buyer’s code");
    expect(screen.queryByRole("img", { name: /QR code/ })).toBeNull();
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    expect(await screen.findByText("Enter the buyer’s 3-digit code")).toBeTruthy();
    fireEvent.change(input, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    expect(await screen.findByText("That code isn't right. 4 tries left.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    await waitFor(() => expect(sellerOrdersApi.handOver).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Handed over")).toBeTruthy();
  });

  it("says when the order is someone else's or can't load", async () => {
    sellerOrdersApi.get.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Order not found"));
    renderPage();
    expect(await screen.findByText("We can’t find this order")).toBeTruthy();
  });
});
