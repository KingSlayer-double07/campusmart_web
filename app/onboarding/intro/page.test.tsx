import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useGuestStore } from "@/app/store/useGuestStore";
import IntroPage, { INTRO_SLIDES } from "./page";

describe("Intro slides (decision 2026-10-19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGuestStore.setState({ introSeen: false });
  });
  afterEach(cleanup);

  it("steps through the slides, then goes to the three choices and isn't shown again", () => {
    render(<IntroPage />);
    for (const slide of INTRO_SLIDES.slice(0, -1)) {
      expect(screen.getByRole("heading", { name: slide.title })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(screen.getByRole("heading", { name: INTRO_SLIDES.at(-1)!.title })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(router.replace).toHaveBeenCalledWith("/onboarding/role-select");
    expect(useGuestStore.getState().introSeen).toBe(true);
  });

  it("can be skipped, jumped with the dots, and swiped", () => {
    const { container } = render(<IntroPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Slide 3" }));
    expect(screen.getByRole("heading", { name: INTRO_SLIDES[2].title })).toBeTruthy();
    // A swipe to the right goes back one slide
    const page = container.firstElementChild!;
    fireEvent.touchStart(page, { touches: [{ clientX: 50 }] });
    fireEvent.touchEnd(page, { changedTouches: [{ clientX: 250 }] });
    expect(screen.getByRole("heading", { name: INTRO_SLIDES[1].title })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(router.replace).toHaveBeenCalledWith("/onboarding/role-select");
    expect(useGuestStore.getState().introSeen).toBe(true);
  });
});
