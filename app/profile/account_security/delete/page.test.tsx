import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/profile/account_security/delete" }));
const accountApi = vi.hoisted(() => ({ deleteAccount: vi.fn() }));
const authApi = vi.hoisted(() => ({ logout: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/api/auth", () => ({ accountApi, authApi }));

import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/app/store/useAuthStore";
import DeleteAccountPage from "./page";

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeleteAccountPage />
    </QueryClientProvider>,
  );
}

describe("Deleting an account (T6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: "u1", role: "BUYER" } as never });
  });
  afterEach(cleanup);

  it("deletes with the password, signs out on this device and leaves", async () => {
    accountApi.deleteAccount.mockResolvedValue(undefined);
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Password, or DELETE/), { target: { value: "Campus2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(accountApi.deleteAccount).toHaveBeenCalledWith({ password: "Campus2026" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding/role-select"));
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("an account made with Google types DELETE", async () => {
    accountApi.deleteAccount.mockResolvedValue(undefined);
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Password, or DELETE/), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(accountApi.deleteAccount).toHaveBeenCalledWith({ confirm: "DELETE" }));
  });

  it("says why it was refused, such as orders in progress", async () => {
    accountApi.deleteAccount.mockRejectedValue(
      new ApiError(409, "ACCOUNT_HAS_OPEN_ORDERS", "You have 1 order in progress. Delete your account once they're finished."),
    );
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Password, or DELETE/), { target: { value: "Campus2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/1 order in progress/);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
