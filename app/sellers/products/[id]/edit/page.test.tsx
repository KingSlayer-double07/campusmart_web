import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

type Query = { data?: unknown; isPending: boolean; isError: boolean; error: unknown; refetch: () => void };
const query = vi.hoisted(() => ({ value: {} as Query }));
vi.mock("@/lib/api/hooks/useListings", () => ({
  useListing: () => query.value,
  useUpdateListing: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import { ApiError } from "@/lib/api/client";
import EditProductPage from "./page";

const failed = (error: unknown): Query => ({ isPending: false, isError: true, error, refetch: vi.fn() });

describe("EditProductPage", () => {
  afterEach(cleanup);

  it("shows a skeleton while loading", () => {
    query.value = { isPending: true, isError: false, error: null, refetch: vi.fn() };
    render(<EditProductPage />);
    expect(screen.getByLabelText("Loading product")).toBeTruthy();
  });

  it("says the product isn't yours when the API answers 404", () => {
    query.value = failed(new ApiError(404, "NOT_FOUND", "Not found"));
    render(<EditProductPage />);
    expect(screen.getByText("This product isn't one of yours")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers a retry when the request fails for another reason", () => {
    query.value = failed(new TypeError("Failed to fetch"));
    render(<EditProductPage />);
    expect(screen.getByText("We couldn't load this product")).toBeTruthy();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(query.value.refetch).toHaveBeenCalled();
  });

  it("won't edit someone else's listing", () => {
    query.value = { data: { id: "l1", isOwner: false }, isPending: false, isError: false, error: null, refetch: vi.fn() };
    render(<EditProductPage />);
    expect(screen.getByText("This product isn't one of yours")).toBeTruthy();
  });
});
