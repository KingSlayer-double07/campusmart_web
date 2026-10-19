import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/admin/reviews",
  useSearchParams: () => new URLSearchParams(),
}));
const adminReviewsApi = vi.hoisted(() => ({ list: vi.fn(), hide: vi.fn(), show: vi.fn() }));
vi.mock("@/lib/api/reviews", () => ({ adminReviewsApi }));

import AdminReviewsPage from "./page";

const review = (overrides: object = {}) => ({
  id: "r1",
  rating: 1,
  comment: "Terrible person",
  reviewerDisplayName: "tobi",
  listingTitle: "Desk lamp",
  createdAt: "2026-10-10T10:00:00Z",
  listingId: "l1",
  sellerId: "s1",
  storeName: "Chidi Gadgets",
  hiddenAt: null,
  hiddenReason: null,
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminReviewsPage />
    </QueryClientProvider>,
  );
}

describe("Admin reviews (R4)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("hides an abusive review with a reason", async () => {
    adminReviewsApi.list.mockResolvedValue({ items: [review()], nextCursor: null });
    adminReviewsApi.hide.mockResolvedValue(review({ hiddenAt: "2026-10-18T10:00:00Z", hiddenReason: "Insults the seller" }));
    renderPage();
    expect((await screen.findAllByText("Terrible person")).length).toBeGreaterThan(0);
    expect(adminReviewsApi.list).toHaveBeenCalledWith("SHOWN", undefined);
    fireEvent.click(screen.getAllByRole("button", { name: "Hide" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Insults the seller" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide review" }));
    await waitFor(() => expect(adminReviewsApi.hide).toHaveBeenCalledWith("r1", "Insults the seller"));
    expect(await screen.findByText("Review hidden")).toBeTruthy();
  });

  it("says when there are no reviews", async () => {
    adminReviewsApi.list.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("No reviews yet")).toBeTruthy();
  });
});
