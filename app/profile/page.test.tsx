import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/profile" }));
vi.mock("@/lib/api/hooks/useCart", () => ({ useCart: () => ({ lineCount: 0 }) }));
vi.mock("@/lib/api/hooks/useLogout", () => ({ useLogout: () => vi.fn() }));
vi.mock("../components/nav", () => ({ default: () => null }));

import { useAuthStore } from "@/app/store/useAuthStore";
import ProfilePage from "./page";

const user = {
  id: "u1",
  email: "slayerddev@gmail.com",
  username: "slayerddev",
  firstName: null,
  lastName: null,
  phone: null,
  role: "BUYER",
  emailVerifiedAt: "2026-10-19T10:00:00.000Z",
  createdAt: "2026-10-19T10:00:00.000Z",
};

describe("The profile page", () => {
  beforeEach(() => useAuthStore.setState({ user: user as never }));
  afterEach(cleanup);

  it("shows who's signed in, with a card readable in dark mode too", () => {
    render(<ProfilePage />);
    const name = screen.getByRole("heading", { name: "slayerddev" });
    expect(screen.getByText("slayerddev@gmail.com")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    // The card's light tint has a dark-mode counterpart, so the theme's light text stays readable (2026-10-19)
    const card = name.closest("div.rounded-2xl");
    expect(card?.className).toContain("dark:from-blue-500/10");
  });

  it("writes the footer's bullet as a bullet", () => {
    render(<ProfilePage />);
    expect(screen.getByText(`Campusmart v1.0.0 • ${new Date().getFullYear()}`)).toBeTruthy();
  });
});
