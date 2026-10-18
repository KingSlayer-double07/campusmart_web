import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => nav.params }));
const authApi = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ authApi }));

import { useAuthStore } from "@/app/store/useAuthStore";
import GoogleDonePage from "./page";

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GoogleDonePage />
    </QueryClientProvider>,
  );
}

const buyer = { id: "u1", email: "ada@gmail.com", role: "BUYER", emailVerifiedAt: "2026-10-18T00:00:00Z", institutionId: null };

describe("After Google sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.params = new URLSearchParams();
    useAuthStore.setState({ user: null });
  });
  afterEach(cleanup);

  it("loads the account and sends a buyer without a school to pick one", async () => {
    authApi.me.mockResolvedValue(buyer);
    renderPage();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding/school"));
    expect(useAuthStore.getState().user).toEqual(buyer);
  });

  it("goes where the buyer was heading", async () => {
    nav.params = new URLSearchParams("next=/orders");
    authApi.me.mockResolvedValue({ ...buyer, institutionId: "unilag" });
    renderPage();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/orders"));
  });

  it("offers a way back when the session didn't stick", async () => {
    authApi.me.mockRejectedValue(new Error("401"));
    renderPage();
    expect(await screen.findByRole("link", { name: "Back to sign in" })).toBeTruthy();
  });
});
