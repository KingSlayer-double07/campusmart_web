import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const paymentsApi = vi.hoisted(() => ({ payoutAccount: vi.fn(), payouts: vi.fn(), banks: vi.fn() }));
vi.mock("@/lib/api/payments", () => ({ paymentsApi }));

import { ApiError } from "@/lib/api/client";
import EarningsPage from "./page";

const none = { bankName: null, accountLast4: null, accountName: null, holdUntil: null };
const payout = (overrides: object) => ({
  id: "p1",
  sellerOrderCode: "CM-7F3K2Q",
  amountKobo: 1_200_000,
  status: "PAID",
  failureReason: null,
  createdAt: "2026-10-12T10:00:00Z",
  paidAt: "2026-10-12T10:20:00Z",
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EarningsPage />
    </QueryClientProvider>,
  );
}

describe("EarningsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentsApi.payoutAccount.mockResolvedValue(none);
  });
  afterEach(cleanup);

  it("lists payouts with their status", async () => {
    paymentsApi.payouts.mockResolvedValue({
      items: [payout({}), payout({ id: "p2", sellerOrderCode: "CM-ABC234", status: "AWAITING_ACCOUNT", paidAt: null })],
      nextCursor: null,
    });
    renderPage();
    expect(await screen.findByText("CM-7F3K2Q")).toBeTruthy();
    expect(screen.getAllByText("₦12,000")).toHaveLength(2);
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("Needs a payout account")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Payout account" })).toBeTruthy();
  });

  it("explains when there are no payouts yet, and when they can't load", async () => {
    paymentsApi.payouts.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("No payouts yet")).toBeTruthy();
    cleanup();

    paymentsApi.payouts.mockRejectedValue(new ApiError(0, "NETWORK", "offline"));
    paymentsApi.payoutAccount.mockRejectedValue(new ApiError(0, "NETWORK", "offline"));
    renderPage();
    expect(await screen.findByText("We couldn't load your payouts")).toBeTruthy();
    expect(screen.getByText("We couldn't load your payout account")).toBeTruthy();
  });
});
