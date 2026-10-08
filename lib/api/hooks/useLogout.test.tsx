import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const logout = vi.hoisted(() => vi.fn());
vi.mock("../auth", () => ({ authApi: { logout } }));

import { useAuthStore } from "@/app/store/useAuthStore";
import { useCartStore } from "@/app/store/useCartStore";
import { useFavouritesStore } from "@/app/store/useFavouritesStore";
import { useLogout } from "./useLogout";

describe("useLogout", () => {
  it("calls the API, clears the query cache, the cart, favourites and their storage keys", async () => {
    logout.mockResolvedValue(undefined);
    const client = new QueryClient();
    client.setQueryData(["orders"], [{ id: "o1" }]);
    useAuthStore.setState({ user: { id: "u1" } as never });
    useCartStore.setState({ cart: [{ id: "p1" } as never] });
    useFavouritesStore.setState({ favourites: [{ id: "p1" } as never] });
    expect(localStorage.getItem("campus-mart-cart")).not.toBeNull();

    const { result } = renderHook(() => useLogout(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await result.current();

    expect(logout).toHaveBeenCalled();
    expect(client.getQueryData(["orders"])).toBeUndefined();
    expect(useCartStore.getState().cart).toEqual([]);
    expect(useFavouritesStore.getState().favourites).toEqual([]);
    expect(localStorage.getItem("campus-mart-cart")).toBeNull();
    expect(localStorage.getItem("campus-mart-favourites")).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("still wipes the device when the API call fails", async () => {
    logout.mockRejectedValue(new Error("offline"));
    useAuthStore.setState({ user: { id: "u1" } as never });
    const client = new QueryClient();
    const { result } = renderHook(() => useLogout(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await result.current();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
