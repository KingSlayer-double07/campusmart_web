import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const paymentsApi = vi.hoisted(() => ({ config: vi.fn(), payoutAccount: vi.fn() }));
vi.mock("@/lib/api/payments", () => ({ paymentsApi }));

import PayoutAccountBanner from "./PayoutAccountBanner";

const none = { bankName: null, accountLast4: null, accountName: null, holdUntil: null };

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PayoutAccountBanner />
    </QueryClientProvider>,
  );
}

describe("PayoutAccountBanner", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("asks for a payout account until there is one", async () => {
    paymentsApi.config.mockResolvedValue({ paymentsEnabled: true, methods: ["CARD"] });
    paymentsApi.payoutAccount.mockResolvedValue(none);
    renderBanner();
    expect((await screen.findByRole("link", { name: "Add account" })).getAttribute("href")).toBe("/sellers/earnings#payout-account");
    cleanup();

    paymentsApi.payoutAccount.mockResolvedValue({ ...none, bankName: "GTBank", accountLast4: "6789" });
    const { container } = renderBanner();
    await vi.waitFor(() => expect(paymentsApi.payoutAccount).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });

  it("stays hidden while online payment is off", async () => {
    paymentsApi.config.mockResolvedValue({ paymentsEnabled: false, methods: ["CARD"] });
    paymentsApi.payoutAccount.mockResolvedValue(none);
    const { container } = renderBanner();
    await vi.waitFor(() => expect(paymentsApi.config).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
