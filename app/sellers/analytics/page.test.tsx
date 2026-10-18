import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const analyticsApi = vi.hoisted(() => ({ stats: vi.fn(), timeseries: vi.fn(), topListings: vi.fn(), inventoryAlerts: vi.fn() }));
vi.mock("@/lib/api/analytics", () => ({ analyticsApi }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));
// The chart is recharts, lazy-loaded; here it just says what it was given
vi.mock("next/dynamic", () => ({
  default: () =>
    function Chart({ data, metric }: { data: { value: number }[]; metric: string }) {
      return <p>{`${metric} chart, ${data.length} days`}</p>;
    },
}));

import { ApiError } from "@/lib/api/client";
import { useSellerStore } from "@/app/store/useSellerStore";
import AnalyticsPage from "./page";

const stats = {
  range: "7d",
  views: 40,
  viewsChangePct: 25,
  orders: 3,
  ordersChangePct: null,
  revenueKobo: 1_650_000,
  revenueChangePct: -10,
  heldKobo: 950_000,
  releasedKobo: 400_000,
  paidOutKobo: 1_200_000,
};

const days = (n: number, value = 0) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, value }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnalyticsPage />
    </QueryClientProvider>,
  );
}

describe("Seller AnalyticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSellerStore.setState({ range: "7d" });
    analyticsApi.stats.mockResolvedValue(stats);
    analyticsApi.timeseries.mockResolvedValue(days(7, 100));
    analyticsApi.topListings.mockResolvedValue([
      { listingId: "l1", title: "Desk lamp", imageUrl: null, unitsSold: 3, revenueKobo: 1_350_000, views: 40, conversionPct: 7.5 },
    ]);
    analyticsApi.inventoryAlerts.mockResolvedValue({
      threshold: 5,
      items: [
        { listingId: "p1", variantId: "v1", title: "Cargo pants", variantLabel: "M", imageUrl: null, stock: 0 },
        { listingId: "l1", variantId: null, title: "Desk lamp", variantLabel: null, imageUrl: null, stock: 2 },
      ],
    });
  });
  afterEach(cleanup);

  it("shows revenue, counts, the trend, best sellers, items to restock and payouts", async () => {
    renderPage();
    expect(await screen.findByText("₦16,500")).toBeTruthy();
    expect(screen.getByText("Revenue in the last 7 days")).toBeTruthy();
    expect(screen.getByLabelText("Down 10%")).toBeTruthy();
    expect(screen.getByText("against the 7 days before")).toBeTruthy();
    expect(screen.getByLabelText("Up 25%")).toBeTruthy();
    // No orders the week before: nothing to compare with
    expect(screen.getByText("New")).toBeTruthy();
    expect(await screen.findByText("revenue chart, 7 days")).toBeTruthy();
    expect(await screen.findByText("3 sold · ₦13,500")).toBeTruthy();
    expect(screen.getByText("7.5%")).toBeTruthy();
    expect(await screen.findByText("Out of stock")).toBeTruthy();
    expect(screen.getByText("2 left")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Restock Cargo pants (M)" }).getAttribute("href")).toBe("/sellers/products/p1/edit");
    expect(screen.getByText("₦9,500")).toBeTruthy();
    expect(screen.getByText("₦4,000")).toBeTruthy();
    expect(screen.getByText("₦12,000")).toBeTruthy();
  });

  it("switches the range and the metric", async () => {
    analyticsApi.timeseries.mockImplementation((range: string) => Promise.resolve(days(range === "30d" ? 30 : 7)));
    renderPage();
    await screen.findByText("revenue chart, 7 days");
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(await screen.findByText("revenue chart, 30 days")).toBeTruthy();
    expect(analyticsApi.stats).toHaveBeenLastCalledWith("30d");
    expect(analyticsApi.topListings).toHaveBeenLastCalledWith("30d", 5);
    fireEvent.click(screen.getByRole("tab", { name: "Orders" }));
    expect(await screen.findByText("orders chart, 30 days")).toBeTruthy();
    expect(analyticsApi.timeseries).toHaveBeenLastCalledWith("30d", "orders");
    // Nothing happened in those days
    expect(screen.getByText("Nothing in the last 30 days yet.")).toBeTruthy();
  });

  it("says when nothing sold and nothing is low", async () => {
    analyticsApi.stats.mockResolvedValue({ ...stats, revenueKobo: 0, revenueChangePct: null });
    analyticsApi.topListings.mockResolvedValue([]);
    analyticsApi.inventoryAlerts.mockResolvedValue({ threshold: 5, items: [] });
    renderPage();
    expect(await screen.findByText("Nothing sold in the last 7 days yet.")).toBeTruthy();
    expect(screen.getByText("No sales in the 7 days before to compare with")).toBeTruthy();
    expect(await screen.findByText(/Nothing is running low. You'll be told when an item has 5 or fewer left./)).toBeTruthy();
  });

  it("offers to try again when the numbers don't load", async () => {
    analyticsApi.stats.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong"));
    analyticsApi.inventoryAlerts.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong"));
    renderPage();
    expect(await screen.findByText(/Couldn't load your numbers/)).toBeTruthy();
    expect(await screen.findByText(/Couldn't load your stock/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    await waitFor(() => expect(screen.getByText("₦16,500")).toBeTruthy());
  });
});
