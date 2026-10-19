import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("./components/ListingsCarousel", () => ({ default: () => null }));
vi.mock("./components/FeaturedStoresRow", () => ({ default: () => <p>stores row</p> }));
vi.mock("./components/FeaturedBanner", () => ({ default: () => null }));
vi.mock("./components/CategoryList", () => ({ default: () => null }));
vi.mock("./components/nav", () => ({ default: () => null }));
vi.mock("@/lib/api/hooks/useNotifications", () => ({ useUnreadCount: () => ({ data: { count: 0 } }) }));

import { useAuthStore } from "./store/useAuthStore";
import { useGuestStore } from "./store/useGuestStore";
import Home from "./page";

function renderHome() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Home />
    </QueryClientProvider>,
  );
}

describe("Home (decision 2026-10-19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null });
    useGuestStore.setState({ school: null });
  });
  afterEach(cleanup);

  it("a guest browsing a school sees which one, can change it or sign in, and no store pages", async () => {
    useGuestStore.setState({ school: { id: "unilag", name: "University of Lagos" } });
    renderHome();
    expect((await screen.findByRole("link", { name: "Sign in" })).getAttribute("href")).toBe("/onboarding/buyers/welcome");
    expect(screen.getByText("University of Lagos")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change" }).getAttribute("href")).toBe("/onboarding/guest-school");
    expect(screen.queryByText("stores row")).toBeNull();
    expect(screen.queryByRole("link", { name: /Notifications/ })).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("signed in, the bell and the featured stores show", async () => {
    useAuthStore.setState({ user: { id: "u1", role: "BUYER", institutionId: "unilag" } as never });
    renderHome();
    expect(await screen.findByRole("link", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText("stores row")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("a visitor with no account and no school goes to the splash", async () => {
    renderHome();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/splash"));
  });
});
