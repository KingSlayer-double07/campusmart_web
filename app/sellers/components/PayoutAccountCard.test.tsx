import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const paymentsApi = vi.hoisted(() => ({ banks: vi.fn(), setPayoutAccount: vi.fn() }));
vi.mock("@/lib/api/payments", () => ({ paymentsApi }));

import { ApiError } from "@/lib/api/client";
import type { PayoutAccount } from "@/lib/api/payments";
import PayoutAccountCard from "./PayoutAccountCard";

const none: PayoutAccount = { bankName: null, accountLast4: null, accountName: null, holdUntil: null };
const saved: PayoutAccount = { bankName: "Guaranty Trust Bank", accountLast4: "6789", accountName: "ADA OBI", holdUntil: "2026-10-18T12:00:00Z" };
const banks = [
  { name: "Access Bank", code: "044" },
  { name: "Guaranty Trust Bank", code: "058" },
];

function renderCard(account = none, onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PayoutAccountCard account={account} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}

describe("PayoutAccountCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentsApi.banks.mockResolvedValue(banks);
  });
  afterEach(cleanup);

  it("checks the bank and number, then saves and shows only the last 4 digits", async () => {
    paymentsApi.setPayoutAccount.mockResolvedValue(saved);
    const onSaved = renderCard();
    expect(screen.getByText(/Payouts wait until you do/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    await screen.findByRole("option", { name: "Guaranty Trust Bank" });
    fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(await screen.findByText("Choose the bank this account is with")).toBeTruthy();
    expect(screen.getByText("Enter your 10-digit account number")).toBeTruthy();
    expect(paymentsApi.setPayoutAccount).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "058" } });
    fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "01234 56789" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await waitFor(() => expect(paymentsApi.setPayoutAccount).toHaveBeenCalledWith({ bankCode: "058", accountNumber: "0123456789" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });

  it("shows the saved account and the 24-hour hold (P9)", () => {
    renderCard(saved);
    expect(screen.getByText("Guaranty Trust Bank ••6789")).toBeTruthy();
    expect(screen.getByText("ADA OBI")).toBeTruthy();
    expect(screen.getByText(/Payouts start again/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("says when the bank couldn't confirm the account", async () => {
    paymentsApi.setPayoutAccount.mockRejectedValue(new ApiError(502, "PAYMENT_PROVIDER_ERROR", "Could not resolve account name"));
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    await screen.findByRole("option", { name: "Access Bank" });
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "044" } });
    fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "0123456789" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(await screen.findByText(/couldn't confirm that account with your bank/)).toBeTruthy();
  });

  it("is honest while payouts aren't switched on", async () => {
    paymentsApi.banks.mockRejectedValue(new ApiError(503, "PAYMENTS_NOT_CONFIGURED", "Online payment isn't set up yet"));
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(await screen.findByText("Payouts aren't switched on yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save account" }).hasAttribute("disabled")).toBe(true);
  });
});
