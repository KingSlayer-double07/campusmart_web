import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const analyticsApi = vi.hoisted(() => ({ stats: vi.fn(), topListings: vi.fn() }));
vi.mock("@/lib/api/analytics", () => ({ analyticsApi }));
vi.mock("@/lib/api/hooks/useSellerProfile", () => ({
  useSellerProfile: () => ({ data: { storeName: "Chidi Gadgets", isOnline: true } }),
  useUpdateSellerProfile: () => ({ mutate: vi.fn() }),
}));
vi.mock("./components/PayoutAccountBanner", () => ({ default: () => null }));

import { ApiError } from "@/lib/api/client";
import { useSellerStore } from "@/app/store/useSellerStore";
import SellersPage from "./page";

const stats = {
  range: "7d",
  views: 1204,
  viewsChangePct: 12,
  orders: 15,
  ordersChangePct: 0,
  revenueKobo: 36_450_000,
  revenueChangePct: -2.5,
  heldKobo: 0,
  releasedKobo: 0,
  paidOutKobo: 0,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SellersPage />
    </QueryClientProvider>,
  );
}

describe("Seller dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSellerStore.setState({ range: "7d" });
    analyticsApi.stats.mockResolvedValue(stats);
    analyticsApi.topListings.mockResolvedValue([
      { listingId: "l1", title: "Desk lamp", imageUrl: null, unitsSold: 7, revenueKobo: 3_150_000, views: 90, conversionPct: 7.8 },
    ]);
  });
  afterEach(cleanup);

  it("shows the real numbers for the chosen range and the best seller", async () => {
    renderPage();
    expect(await screen.findByText("1,204")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("₦364,500")).toBeTruthy();
    expect(screen.getByText("Sales in the last 7 days")).toBeTruthy();
    expect(screen.getByLabelText("Up 12%")).toBeTruthy();
    expect(screen.getByLabelText("Down 2.5%")).toBeTruthy();
    expect(await screen.findByText("7 sold in the last 7 days")).toBeTruthy();
    expect(analyticsApi.topListings).toHaveBeenCalledWith("7d", 1);

    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(await screen.findByText("Sales in the last 90 days")).toBeTruthy();
    expect(analyticsApi.stats).toHaveBeenLastCalledWith("90d");
    expect(useSellerStore.getState().range).toBe("90d");
  });

  it("hides the best seller until something sells, and offers a retry when the numbers fail", async () => {
    analyticsApi.topListings.mockResolvedValue([]);
    analyticsApi.stats.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong"));
    renderPage();
    expect(await screen.findByText(/Couldn't load your numbers/)).toBeTruthy();
    expect(screen.queryByText("Best Performing")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1,204")).toBeTruthy();
  });
});
