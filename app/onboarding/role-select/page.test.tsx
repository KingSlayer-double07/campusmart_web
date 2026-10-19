import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useGuestStore } from "@/app/store/useGuestStore";
import RoleSelectPage from "./page";

function choose(title: string) {
  render(<RoleSelectPage />);
  fireEvent.click(screen.getByText(title));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("How do you want to use CampusMart? (decision 2026-10-19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGuestStore.setState({ school: null });
  });
  afterEach(cleanup);

  it("Browse needs no account: pick a school, or go straight home if one is picked", () => {
    choose("Browse Items");
    expect(router.push).toHaveBeenCalledWith("/onboarding/guest-school");
    cleanup();
    useGuestStore.setState({ school: { id: "unilag", name: "University of Lagos" } });
    choose("Browse Items");
    expect(router.push).toHaveBeenLastCalledWith("/");
  });

  it("Buy and Sell sign in first", () => {
    choose("Buy Items");
    expect(router.push).toHaveBeenCalledWith("/onboarding/buyers/welcome");
    cleanup();
    choose("Sell Items");
    expect(router.push).toHaveBeenLastCalledWith("/onboarding/sellers/welcome");
  });
});
