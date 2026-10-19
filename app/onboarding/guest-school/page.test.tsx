import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const accountApi = vi.hoisted(() => ({ institutions: vi.fn() }));
vi.mock("@/lib/api/account", () => ({ accountApi }));

import { useGuestStore } from "@/app/store/useGuestStore";
import GuestSchoolPage from "./page";

const schools = [
  { id: "unilag", name: "University of Lagos", domains: ["unilag.edu.ng"], isActive: true, createdAt: "" },
  { id: "ui", name: "University of Ibadan", domains: ["ui.edu.ng"], isActive: true, createdAt: "" },
];

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GuestSchoolPage />
    </QueryClientProvider>,
  );
}

describe("A guest picks a school to browse (decision 2026-10-19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGuestStore.setState({ school: null });
    accountApi.institutions.mockResolvedValue(schools);
  });
  afterEach(cleanup);

  it("asks for a school, then remembers it on the phone and opens the home page", async () => {
    renderPage();
    await screen.findByRole("radio", { name: /University of Ibadan/ });
    fireEvent.click(screen.getByRole("button", { name: "Start browsing" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Choose a school to browse");
    fireEvent.click(screen.getByRole("radio", { name: /University of Ibadan/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start browsing" }));
    expect(useGuestStore.getState().school).toEqual({ id: "ui", name: "University of Ibadan" });
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("starts from the school already picked, offers sign-in and the waitlist", async () => {
    useGuestStore.setState({ school: { id: "unilag", name: "University of Lagos" } });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /University of Lagos/ }).getAttribute("aria-checked")).toBe("true"),
    );
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/onboarding/buyers/sign-in");
    expect(screen.getByRole("link", { name: "Join the waitlist" }).getAttribute("href")).toBe("/waitlist");
  });
});
