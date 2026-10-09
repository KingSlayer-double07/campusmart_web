import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/app/components/ListingsCarousel", () => ({ default: () => null }));
const cartApi = vi.hoisted(() => ({ get: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), merge: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ cartApi }));

import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import CartPage from "./page";

const item = (id: string, overrides: object = {}) => ({
  id,
  listing: { id: `l-${id}`, title: `Item ${id}`, imageUrl: null, category: "TECH" },
  variant: null,
  quantity: 1,
  unitPriceKobo: 450_000,
  available: true,
  maxQuantity: 3,
  ...overrides,
});
const issue = (itemId: string, type: string, message: string, extra: object = {}) => ({
  itemId,
  listingId: `l-${itemId}`,
  type,
  message,
  available: null,
  previousPriceKobo: null,
  currentPriceKobo: null,
  ...extra,
});

function renderCart() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CartPage />
    </QueryClientProvider>,
  );
}

describe("CartPage", () => {
  beforeEach(() => {
    Object.values(cartApi).forEach((fn) => fn.mockReset());
    useAuthStore.setState({ user: { id: "u1", emailVerifiedAt: "2026-10-01T00:00:00Z" } as never });
  });
  afterEach(cleanup);

  it("groups by store with subtotals, caps the stepper and blocks checkout on a problem", async () => {
    const cart = {
      groups: [
        { seller: { id: "s1", storeName: "Tunde Tech" }, subtotalKobo: 900_000, items: [item("a", { quantity: 2, maxQuantity: 2 })] },
        {
          seller: { id: "s2", storeName: "Ada Wears" },
          subtotalKobo: 450_000,
          items: [item("b", { quantity: 3, maxQuantity: 1 }), item("c", { available: false, maxQuantity: 0 })],
        },
      ],
      subtotalKobo: 1_350_000,
      itemCount: 6,
      issues: [issue("b", "LOW_STOCK", "Only 1 left", { available: 1 }), issue("c", "UNAVAILABLE", "No longer available")],
    };
    cartApi.get.mockResolvedValue(cart);
    renderCart();

    expect(await screen.findByRole("region", { name: "Tunde Tech" })).toBeTruthy();
    expect(screen.getByText("₦9,000")).toBeTruthy();
    expect(screen.getByText("Only 1 left")).toBeTruthy();
    expect(screen.getByText("No longer available")).toBeTruthy();
    expect(screen.getByText("Some items need your attention")).toBeTruthy();
    // 2 of 2 in the first line: no more
    expect(screen.getAllByRole("button", { name: "One more" })[0].hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Checkout (6)" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Fix the items marked above to check out")).toBeTruthy();

    cartApi.setItem.mockResolvedValue(cart);
    fireEvent.click(screen.getByRole("button", { name: "Change to 1" }));
    await waitFor(() => expect(cartApi.setItem).toHaveBeenCalledWith({ listingId: "l-b", quantity: 1 }));

    cartApi.removeItem.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(cartApi.removeItem).toHaveBeenCalledWith("c"));
  });

  it("lets a price change through once acknowledged", async () => {
    cartApi.get.mockResolvedValue({
      groups: [{ seller: { id: "s1", storeName: "Tunde Tech" }, subtotalKobo: 500_000, items: [item("a", { unitPriceKobo: 500_000 })] }],
      subtotalKobo: 500_000,
      itemCount: 1,
      issues: [issue("a", "PRICE_CHANGED", "Price went up from ₦4,500 to ₦5,000", { previousPriceKobo: 450_000, currentPriceKobo: 500_000 })],
    });
    cartApi.setItem.mockResolvedValue({ groups: [], subtotalKobo: 0, itemCount: 0, issues: [] });
    renderCart();
    expect(await screen.findByText("Price went up from ₦4,500 to ₦5,000")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Checkout (1)" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(cartApi.setItem).toHaveBeenCalledWith({ listingId: "l-a", quantity: 1 }));
  });

  it("says why a stepper change was refused", async () => {
    cartApi.get.mockResolvedValue({
      groups: [{ seller: { id: "s1", storeName: "Tunde Tech" }, subtotalKobo: 450_000, items: [item("a")] }],
      subtotalKobo: 450_000,
      itemCount: 1,
      issues: [],
    });
    cartApi.setItem.mockRejectedValue(new ApiError(409, "OUT_OF_STOCK", "Only 1 left", { available: 1 }));
    renderCart();
    fireEvent.click(await screen.findByRole("button", { name: "One more" }));
    expect(await screen.findByText("Only 1 left")).toBeTruthy();
  });

  it("has loading, empty and error states", async () => {
    cartApi.get.mockReturnValue(new Promise(() => undefined));
    renderCart();
    expect(screen.getByLabelText("Loading your cart")).toBeTruthy();
    cleanup();

    cartApi.get.mockResolvedValue({ groups: [], subtotalKobo: 0, itemCount: 0, issues: [] });
    renderCart();
    expect(await screen.findByText("Your cart is empty")).toBeTruthy();
    cleanup();

    cartApi.get.mockRejectedValue(new ApiError(403, "INSTITUTION_INACTIVE", "CampusMart isn't available at your school right now."));
    renderCart();
    expect(await screen.findByText("CampusMart isn't available at your school right now.")).toBeTruthy();
  });
});
