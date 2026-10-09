import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const cartApi = vi.hoisted(() => ({ get: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), merge: vi.fn() }));
const buyerOrdersApi = vi.hoisted(() => ({ pickupStations: vi.fn(), checkout: vi.fn(), list: vi.fn(), get: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ cartApi, buyerOrdersApi }));

import { useAuthStore } from "@/app/store/useAuthStore";
import { usePickupStore } from "@/app/store/usePickupStore";
import { ApiError } from "@/lib/api/client";
import CheckoutPage from "./page";

const station = {
  id: "st1",
  name: "Library Pickup Point",
  address: "Main library",
  contactName: "Mr Bello",
  contactPhone: "+234 801 234 5678",
  openingHours: [{ day: "MON", open: "09:00", close: "17:00" }],
};
const cart = {
  groups: [
    {
      seller: { id: "s1", storeName: "Tunde Tech" },
      subtotalKobo: 900_000,
      items: [
        {
          id: "c1",
          listing: { id: "l1", title: "Desk lamp", imageUrl: null, category: "TECH" },
          variant: null,
          quantity: 2,
          unitPriceKobo: 450_000,
          available: true,
          maxQuantity: 2,
        },
      ],
    },
  ],
  subtotalKobo: 900_000,
  itemCount: 2,
  issues: [],
};

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CheckoutPage />
    </QueryClientProvider>,
  );
}

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: "u1", emailVerifiedAt: "2026-10-01T00:00:00Z" } as never });
    usePickupStore.setState({ selectedStationId: null });
    cartApi.get.mockResolvedValue(cart);
    buyerOrdersApi.pickupStations.mockResolvedValue([station]);
  });
  afterEach(cleanup);

  it("asks for a station and a payment choice first", async () => {
    renderCheckout();
    fireEvent.click(await screen.findByRole("button", { name: "Proceed to Pay (2)" }));
    expect(await screen.findByText("Choose a pickup station")).toBeTruthy();
    expect(buyerOrdersApi.checkout).not.toHaveBeenCalled();
  });

  it("checks out with the PaymentMethod and a fresh idempotency key, then shows the order", async () => {
    usePickupStore.setState({ selectedStationId: "st1" });
    buyerOrdersApi.checkout.mockResolvedValue({ orderId: "o1", totalKobo: 900_000, authorizationUrl: null, reference: null });
    renderCheckout();

    expect(await screen.findByText("Library Pickup Point")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Enter here")).toBeNull(); // no coupon field
    fireEvent.click(screen.getByRole("radio", { name: "Bank transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Proceed to Pay (2)" }));

    await waitFor(() => expect(buyerOrdersApi.checkout).toHaveBeenCalled());
    const body = buyerOrdersApi.checkout.mock.calls[0][0];
    expect(body).toMatchObject({ pickupStationId: "st1", paymentMethod: "BANK_TRANSFER" });
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/order-confirmation?orderId=o1&payment=unavailable"));
  });

  it("on OUT_OF_STOCK, refetches the cart and says which item", async () => {
    usePickupStore.setState({ selectedStationId: "st1" });
    buyerOrdersApi.checkout.mockRejectedValue(
      new ApiError(409, "OUT_OF_STOCK", "Desk lamp: only 1 left", { listingId: "l1", available: 1 }),
    );
    renderCheckout();
    fireEvent.click(await screen.findByRole("radio", { name: "Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Proceed to Pay (2)" }));
    expect(await screen.findByText("Desk lamp: only 1 left")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review cart" }).getAttribute("href")).toBe("/cart");
    await waitFor(() => expect(cartApi.get).toHaveBeenCalledTimes(2));
  });

  it("won't pay while an item can't be bought", async () => {
    cartApi.get.mockResolvedValue({
      ...cart,
      issues: [{ itemId: "c1", listingId: "l1", type: "OUT_OF_STOCK", message: "Sold out", available: 0, previousPriceKobo: null, currentPriceKobo: null }],
    });
    renderCheckout();
    expect(await screen.findByText("Some items changed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Proceed to Pay (2)" }).hasAttribute("disabled")).toBe(true);
  });
});
