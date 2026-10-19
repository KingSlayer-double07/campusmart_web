import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useAuthStore } from "@/app/store/useAuthStore";
import { useGuestStore } from "@/app/store/useGuestStore";
import SplashScreen from "./page";

function landing() {
  render(<SplashScreen />);
  act(() => vi.advanceTimersByTime(2200));
  return router.replace.mock.calls.at(-1)?.[0];
}

describe("Splash (decision 2026-10-19)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useAuthStore.setState({ user: null });
    useGuestStore.setState({ introSeen: false, school: null });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the logo for 2.2 seconds, then the intro slides on a first visit", () => {
    render(<SplashScreen />);
    act(() => vi.advanceTimersByTime(2100));
    expect(router.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(router.replace).toHaveBeenCalledWith("/onboarding/intro");
  });

  it("then the three choices, or straight back to browsing for a guest who picked a school", () => {
    useGuestStore.setState({ introSeen: true });
    expect(landing()).toBe("/onboarding/role-select");
    cleanup();
    useGuestStore.setState({ school: { id: "unilag", name: "University of Lagos" } });
    expect(landing()).toBe("/");
  });

  it("sends someone signed in to their home", () => {
    useAuthStore.setState({ user: { id: "u1", role: "SELLER", emailVerifiedAt: "2026-10-01T00:00:00Z" } as never });
    expect(landing()).toBe("/sellers");
  });
});
