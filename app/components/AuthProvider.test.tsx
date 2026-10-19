import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const me = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/auth", () => ({ authApi: { me } }));

import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/app/store/useAuthStore";
import AuthProvider from "./AuthProvider";

const stored = {
  id: "u1",
  email: "ada@unilag.edu.ng",
  role: "BUYER",
  firstName: null,
  emailVerifiedAt: null,
} as never;

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <p>app</p>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    me.mockReset();
    useAuthStore.setState({ user: stored });
  });
  afterEach(cleanup);

  it("refreshes the persisted user from GET /auth/me on start", async () => {
    me.mockResolvedValue({ ...(stored as object), firstName: "Ada" });
    renderProvider();
    await waitFor(() => expect(useAuthStore.getState().user?.firstName).toBe("Ada"));
  });

  it("clears auth on a 401", async () => {
    me.mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "Unauthorized"));
    renderProvider();
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
  });

  it("keeps the user on a network error (offline PWA)", async () => {
    me.mockRejectedValue(new ApiError(0, "NETWORK", "Failed to fetch"));
    renderProvider();
    await waitFor(() => expect(me).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(useAuthStore.getState().user).toEqual(stored);
  });

  it("does not call the API when nobody is signed in", async () => {
    useAuthStore.setState({ user: null });
    renderProvider();
    await new Promise((r) => setTimeout(r, 20));
    expect(me).not.toHaveBeenCalled();
  });
});
