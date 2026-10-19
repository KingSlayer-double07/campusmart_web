import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const cartApi = vi.hoisted(() => ({ get: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), merge: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ cartApi }));

import { useAuthStore } from "@/app/store/useAuthStore";
import { useCartStore } from "@/app/store/useCartStore";
import { ApiError } from "@/lib/api/client";
import AddCartNav from "./addCartNav";

const listing = {
  id: "l1",
  title: "Cargo pants",
  priceKobo: 1_450_000,
  imageUrl: null,
  category: "FASHION",
  stock: 3,
  hasVariants: true,
  isOwner: false,
  seller: { id: "s1", displayName: "Ada Wears", verified: true },
} as never;
const medium = { id: "v1", label: "M", priceKobo: 1_500_000, stock: 1, isActive: true };

const serverCart = (quantity: number) => ({
  groups:
    quantity === 0
      ? []
      : [
          {
            seller: { id: "s1", storeName: "Ada Wears" },
            subtotalKobo: 1_500_000 * quantity,
            items: [
              {
                id: "c1",
                listing: { id: "l1", title: "Cargo pants", imageUrl: null, category: "FASHION" },
                variant: { id: "v1", label: "M", priceKobo: 1_500_000, stock: 1 },
                quantity,
                unitPriceKobo: 1_500_000,
                available: true,
                maxQuantity: 1,
              },
            ],
          },
        ],
  subtotalKobo: 1_500_000 * quantity,
  itemCount: quantity,
  issues: [],
});

function renderNav(props: Partial<React.ComponentProps<typeof AddCartNav>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui = (p: Partial<React.ComponentProps<typeof AddCartNav>>) => (
    <QueryClientProvider client={client}>
      <AddCartNav listing={listing} variant={null} {...p} />
    </QueryClientProvider>
  );
  const result = render(ui(props));
  return { ...result, rerenderWith: (p: Partial<React.ComponentProps<typeof AddCartNav>>) => result.rerender(ui(p)) };
}

describe("AddCartNav", () => {
  beforeEach(() => {
    useCartStore.setState({ cart: [] });
    useAuthStore.setState({ user: null });
    Object.values(cartApi).forEach((fn) => fn.mockReset());
  });
  afterEach(cleanup);

  describe("as a guest", () => {
    it("asks for an option first, then adds that option at its price to this device's cart", () => {
      const { rerenderWith } = renderNav();
      expect(screen.getByRole("button", { name: "Choose an option" }).hasAttribute("disabled")).toBe(true);

      rerenderWith({ variant: medium });
      fireEvent.click(screen.getByRole("button", { name: "Add to Cart" }));
      expect(useCartStore.getState().cart[0]).toMatchObject({
        id: "l1",
        variantId: "v1",
        size: "M",
        priceKobo: 1_500_000,
        quantity: 1,
        sellerId: "s1",
        storeName: "Ada Wears",
      });
      // Only 1 left in M, so the stepper can't go higher
      expect(screen.getByRole("button", { name: "One more" }).hasAttribute("disabled")).toBe(true);
      expect(cartApi.setItem).not.toHaveBeenCalled();
    });
  });

  describe("signed in", () => {
    beforeEach(() => {
      useAuthStore.setState({ user: { id: "u1", emailVerifiedAt: "2026-10-01T00:00:00Z" } as never });
    });

    it("adds to the server cart and shows the quantity it holds", async () => {
      cartApi.get.mockResolvedValue(serverCart(0));
      cartApi.setItem.mockResolvedValue(serverCart(1));
      renderNav({ variant: medium });

      fireEvent.click(await screen.findByRole("button", { name: "Add to Cart" }));
      await waitFor(() => expect(cartApi.setItem).toHaveBeenCalledWith({ listingId: "l1", variantId: "v1", quantity: 1 }));
      expect(await screen.findByRole("button", { name: "View cart" })).toBeTruthy();
      expect(useCartStore.getState().cart).toEqual([]);
    });

    it("says why the cart refused", async () => {
      cartApi.get.mockResolvedValue(serverCart(0));
      cartApi.setItem.mockRejectedValue(new ApiError(409, "OUT_OF_STOCK", "This is sold out", { available: 0 }));
      const onError = vi.fn();
      renderNav({ variant: medium, onError });
      fireEvent.click(await screen.findByRole("button", { name: "Add to Cart" }));
      await waitFor(() => expect(onError).toHaveBeenCalledWith("This is sold out"));
    });
  });

  it("says out of stock", () => {
    renderNav({ variant: { ...medium, stock: 0 } });
    expect(screen.getByRole("button", { name: "Out of stock" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the seller an edit link on their own listing", () => {
    renderNav({ listing: { ...(listing as object), isOwner: true } as never });
    expect(screen.getByText(/This is your listing/).closest("a")?.getAttribute("href")).toBe("/sellers/products/l1/edit");
  });
});
