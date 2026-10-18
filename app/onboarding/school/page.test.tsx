import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/onboarding/school" }));
const accountApi = vi.hoisted(() => ({ institutions: vi.fn(), setInstitution: vi.fn() }));
vi.mock("@/lib/api/account", () => ({ accountApi }));

import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/app/store/useAuthStore";
import PickSchoolPage from "./page";

const buyer = { id: "u1", email: "ada@gmail.com", role: "BUYER", emailVerifiedAt: "2026-10-18T00:00:00Z", institutionId: null };
const schools = [
  { id: "unilag", name: "University of Lagos", domains: ["unilag.edu.ng"], isActive: true, createdAt: "" },
  { id: "lasu", name: "Lagos State University", domains: ["lasu.edu.ng"], isActive: true, createdAt: "" },
];

function renderWith(ui: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

describe("Picking a school (T1, G4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: buyer as never });
    accountApi.institutions.mockResolvedValue(schools);
  });
  afterEach(cleanup);

  it("searches the schools, saves the pick and goes home", async () => {
    accountApi.setInstitution.mockResolvedValue({ ...buyer, institutionId: "unilag" });
    renderWith(<PickSchoolPage />);
    expect(await screen.findByText("Lagos State University")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search for your school"), { target: { value: "of lagos" } });
    expect(screen.queryByText("Lagos State University")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Choose your school");
    fireEvent.click(screen.getByRole("radio", { name: /University of Lagos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(accountApi.setInstitution).toHaveBeenCalledWith("unilag"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(useAuthStore.getState().user?.institutionId).toBe("unilag");
  });

  it("points to the waitlist for a school that isn't listed", async () => {
    renderWith(<PickSchoolPage />);
    expect((await screen.findByRole("link", { name: "Join the waitlist" })).getAttribute("href")).toBe("/waitlist");
  });

  it("shows why the API refused", async () => {
    accountApi.setInstitution.mockRejectedValue(new ApiError(403, "INSTITUTION_INACTIVE", "CampusMart isn't available at your school right now."));
    renderWith(<PickSchoolPage />);
    fireEvent.click(await screen.findByRole("radio", { name: /Lagos State University/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't available at your school/);
  });
});
