import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { useCartStore } from "@/app/store/useCartStore";
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
} as never;
const medium = { id: "v1", label: "M", priceKobo: 1_500_000, stock: 1, isActive: true };

describe("AddCartNav", () => {
  beforeEach(() => useCartStore.setState({ cart: [] }));
  afterEach(cleanup);

  it("asks for an option first, then adds that option at its price", () => {
    const { rerender } = render(<AddCartNav listing={listing} variant={null} />);
    expect(screen.getByRole("button", { name: "Choose an option" }).hasAttribute("disabled")).toBe(true);

    rerender(<AddCartNav listing={listing} variant={medium} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to Cart" }));
    expect(useCartStore.getState().cart[0]).toMatchObject({
      id: "l1",
      variantId: "v1",
      size: "M",
      priceKobo: 1_500_000,
      quantity: 1,
    });
    // Only 1 left in M, so the stepper can't go higher
    expect(screen.getByRole("button", { name: "One more" }).hasAttribute("disabled")).toBe(true);
  });

  it("says out of stock", () => {
    render(<AddCartNav listing={listing} variant={{ ...medium, stock: 0 }} />);
    expect(screen.getByRole("button", { name: "Out of stock" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the seller an edit link on their own listing", () => {
    render(<AddCartNav listing={{ ...(listing as object), isOwner: true } as never} variant={null} />);
    expect(screen.getByText(/This is your listing/).closest("a")?.getAttribute("href")).toBe("/sellers/products/l1/edit");
  });
});
