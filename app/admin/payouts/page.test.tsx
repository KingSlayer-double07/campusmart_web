import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, useRouter: () => nav.router, usePathname: () => "/admin/payouts" }));
const adminPaymentsApi = vi.hoisted(() => ({ payouts: vi.fn(), retryPayout: vi.fn() }));
vi.mock("@/lib/api/payments", () => ({ adminPaymentsApi }));

import { ApiError } from "@/lib/api/client";
import AdminPayoutsPage from "./page";

const payout = (overrides: object = {}) => ({
  id: "po1",
  sellerId: "s1",
  storeName: "Tunde Tech",
  sellerOrderCode: "CM-7F3K2Q",
  amountKobo: 450_000,
  status: "FAILED",
  failureReason: "Account is invalid",
  attempt: 1,
  createdAt: "2026-10-12T10:00:00Z",
  paidAt: null,
  ...overrides,
});

function renderPage(query = "") {
  nav.params = new URLSearchParams(query);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminPayoutsPage />
    </QueryClientProvider>,
  );
}

describe("AdminPayoutsPage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("lists failed payouts by default and retries one after asking", async () => {
    adminPaymentsApi.payouts.mockResolvedValue({ items: [payout()], nextCursor: null });
    adminPaymentsApi.retryPayout.mockResolvedValue(payout({ status: "PROCESSING", failureReason: null, attempt: 2 }));
    renderPage();
    expect((await screen.findAllByText("Tunde Tech")).length).toBeGreaterThan(0);
    expect(adminPaymentsApi.payouts).toHaveBeenCalledWith({ status: "FAILED", cursor: undefined });
    expect(screen.getAllByText("Account is invalid").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/with a new reference/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry payout" }));
    await waitFor(() => expect(adminPaymentsApi.retryPayout).toHaveBeenCalledWith("po1"));
    expect(await screen.findByText("Payout sent again")).toBeTruthy();
  });

  it("says when a retried payout is only queued, or failed again", async () => {
    adminPaymentsApi.payouts.mockResolvedValue({ items: [payout()], nextCursor: null });
    adminPaymentsApi.retryPayout.mockResolvedValueOnce(payout({ status: "PENDING", failureReason: null, attempt: 2 }));
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Retry" }))[0]);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Retry payout" }));
    expect(await screen.findByText("Payout queued")).toBeTruthy();

    adminPaymentsApi.retryPayout.mockResolvedValueOnce(payout({ failureReason: "Recipient account is closed", attempt: 2 }));
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Retry payout" }));
    expect(await screen.findByText("Retried, but it failed again")).toBeTruthy();
  });

  it("filters by status from the URL, and has empty and error states", async () => {
    adminPaymentsApi.payouts.mockResolvedValue({ items: [], nextCursor: null });
    renderPage("status=AWAITING_ACCOUNT");
    expect(await screen.findByText("No one is waiting")).toBeTruthy();
    expect(adminPaymentsApi.payouts).toHaveBeenCalledWith({ status: "AWAITING_ACCOUNT", cursor: undefined });
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(nav.router.replace).toHaveBeenCalledWith("/admin/payouts?status=ALL", { scroll: false });
    cleanup();

    adminPaymentsApi.payouts.mockRejectedValue(new ApiError(0, "NETWORK", "offline"));
    renderPage("status=ALL");
    await waitFor(() => expect(adminPaymentsApi.payouts).toHaveBeenCalledWith({ cursor: undefined }));
    expect(await screen.findByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("only failed payouts can be retried", async () => {
    adminPaymentsApi.payouts.mockResolvedValue({ items: [payout({ status: "PAID", failureReason: null, paidAt: "2026-10-12T10:20:00Z" })], nextCursor: null });
    renderPage("status=PAID");
    expect((await screen.findAllByText("Tunde Tech")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
