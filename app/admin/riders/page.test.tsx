import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, useRouter: () => nav.router, usePathname: () => "/admin/riders" }));
const adminDispatchApi = vi.hoisted(() => ({ riders: vi.fn(), inviteRider: vi.fn(), resendInvite: vi.fn(), setRiderActive: vi.fn() }));
vi.mock("@/lib/api/dispatch", () => ({ adminDispatchApi }));
const adminApi = vi.hoisted(() => ({ institutions: vi.fn() }));
vi.mock("@/lib/api/admin", async (actual) => ({ ...(await actual<object>()), adminApi }));

import { ApiError } from "@/lib/api/client";
import AdminRidersPage from "./page";

const rider = (overrides: object = {}) => ({
  id: "r1",
  email: "musa@gmail.com",
  firstName: "Musa",
  lastName: "Bello",
  phone: null,
  isActive: true,
  invitePending: false,
  institution: { id: "i1", name: "University of Lagos", isActive: true },
  activeJobs: 1,
  createdAt: "2026-10-17T10:00:00Z",
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminRidersPage />
    </QueryClientProvider>,
  );
}

describe("AdminRidersPage (DX1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.institutions.mockResolvedValue({ items: [{ id: "i1", name: "University of Lagos", isActive: true }], nextCursor: null });
  });
  afterEach(cleanup);

  it("invites a rider for a campus", async () => {
    adminDispatchApi.riders.mockResolvedValue({ items: [], nextCursor: null });
    adminDispatchApi.inviteRider.mockResolvedValue(rider({ invitePending: true }));
    renderPage();
    expect(await screen.findByText("No riders yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Invite rider/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Send invite" }));
    expect(await within(dialog).findByText("Enter the rider's email address")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "musa@gmail.com" } });
    fireEvent.change(within(dialog).getByLabelText("First name"), { target: { value: "Musa" } });
    await waitFor(() => expect((within(dialog).getByLabelText("Campus") as HTMLSelectElement).value).toBe("i1"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send invite" }));
    await waitFor(() =>
      expect(adminDispatchApi.inviteRider).toHaveBeenCalledWith({ email: "musa@gmail.com", firstName: "Musa", institutionId: "i1" }),
    );
    expect(await screen.findByText("Invite sent")).toBeTruthy();
  });

  it("switches a rider off with a reason; says why when refused", async () => {
    adminDispatchApi.riders.mockResolvedValue({ items: [rider()], nextCursor: null });
    adminDispatchApi.setRiderActive.mockRejectedValue(new ApiError(409, "RIDER_HAS_JOBS", "This rider has 1 job(s) in progress. Reassign them first."));
    renderPage();
    expect((await screen.findAllByText("Musa Bello")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Switch off" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Left the team" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Switch off" }));
    await waitFor(() => expect(adminDispatchApi.setRiderActive).toHaveBeenCalledWith("r1", false, "Left the team"));
    expect(await within(dialog).findByText(/Reassign them first/)).toBeTruthy();
  });
});
