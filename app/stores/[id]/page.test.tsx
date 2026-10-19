import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "s1" }),
  usePathname: () => "/stores/s1",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));
const storesApi = vi.hoisted(() => ({ detail: vi.fn(), listings: vi.fn() }));
vi.mock("@/lib/api/stores", () => ({ storesApi }));
const reviewsApi = vi.hoisted(() => ({ forStore: vi.fn() }));
vi.mock("@/lib/api/reviews", () => ({ reviewsApi }));

import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import StorePage from "./page";

const store = (overrides: object = {}) => ({
  sellerId: "s1",
  storeName: "Ada Wears",
  logoUrl: null,
  ratingAvg: 4.5,
  ratingCount: 2,
  verified: true,
  trusted: true,
  listingCount: 1,
  bio: "Thrift and new, Moremi Hall",
  isOnline: true,
  pickupArea: "Moremi Hall",
  joinedAt: "2026-09-01T10:00:00Z",
  ...overrides,
});

const card = {
  id: "l1",
  title: "Ankara dress",
  priceKobo: 1_200_000,
  minPriceKobo: 1_200_000,
  maxPriceKobo: 1_200_000,
  imageUrl: null,
  category: "FASHION",
  condition: "NEW",
  status: "ACTIVE",
  stock: 3,
  ratingAvg: 0,
  ratingCount: 0,
  hasVariants: false,
  createdAt: "2026-10-01T10:00:00Z",
  seller: { id: "s1", displayName: "Ada Wears", verified: true, trusted: true },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StorePage />
    </QueryClientProvider>,
  );
}

describe("Store page (guide 8.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: "b1", role: "BUYER", emailVerifiedAt: null } as never });
  });
  afterEach(cleanup);

  it("shows the store, its trusted badge and area, its items and its reviews", async () => {
    storesApi.detail.mockResolvedValue(store());
    storesApi.listings.mockResolvedValue({ items: [card], nextCursor: null });
    reviewsApi.forStore.mockResolvedValue({
      items: [{ id: "r1", rating: 5, comment: "Lovely fabric", reviewerDisplayName: "tobi", listingTitle: "Ankara dress", createdAt: "2026-10-10T10:00:00Z" }],
      nextCursor: null,
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Ada Wears" })).toBeTruthy();
    expect(screen.getByText("Trusted seller")).toBeTruthy();
    expect(screen.getByLabelText("Verified seller")).toBeTruthy();
    expect(screen.getByText("Pick up near Moremi Hall")).toBeTruthy();
    expect(await screen.findByText("Ankara dress")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Reviews (2)" }));
    expect(await screen.findByText("Lovely fabric")).toBeTruthy();
    expect(screen.getByText(/tobi · Ankara dress/)).toBeTruthy();
  });

  it("says when nothing is on sale and there are no reviews, without a badge or area", async () => {
    storesApi.detail.mockResolvedValue(store({ trusted: false, pickupArea: null, ratingCount: 0, ratingAvg: 0, listingCount: 0 }));
    storesApi.listings.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("Nothing on sale right now.")).toBeTruthy();
    expect(screen.queryByText("Trusted seller")).toBeNull();
    expect(screen.queryByText(/Pick up near/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Reviews (0)" }));
    expect(screen.getByText(/No reviews yet. Buyers can review/)).toBeTruthy();
    expect(reviewsApi.forStore).not.toHaveBeenCalled();
  });

  it("a store at another school reads as not found", async () => {
    storesApi.detail.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Store not found"));
    renderPage();
    expect(await screen.findByText("This store isn't at your school")).toBeTruthy();
  });
});
