import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import ProductCarousel from "./ProductCarousel";

describe("ProductCarousel", () => {
  afterEach(cleanup);

  it("has loading, error, empty and filled states", () => {
    // The cards' hearts read the wishlist (guide 8.1); signed out, they ask nothing of the API
    const client = new QueryClient();
    const { rerender } = render(<ProductCarousel items={undefined} isLoading />, {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    expect(screen.getByLabelText("Loading products")).toBeTruthy();

    const onRetry = vi.fn();
    rerender(<ProductCarousel items={undefined} isError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();

    rerender(<ProductCarousel items={[]} emptyText="Nothing at your school yet" />);
    expect(screen.getByText("Nothing at your school yet")).toBeTruthy();

    rerender(
      <ProductCarousel
        items={[{ id: "l1", title: "Desk lamp", minPriceKobo: 450_000, maxPriceKobo: 600_000, imageUrl: null, categoryLabel: "Tech" }]}
      />,
    );
    expect(screen.getByText("Desk lamp")).toBeTruthy();
    expect(screen.getByText("From ₦4,500")).toBeTruthy();
  });
});
