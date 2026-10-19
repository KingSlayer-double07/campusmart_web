import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => "/admin/users",
  useSearchParams: () => nav.params,
}));
const moderationApi = vi.hoisted(() => ({ users: vi.fn(), setRole: vi.fn(), suspend: vi.fn(), unsuspend: vi.fn() }));
vi.mock("@/lib/api/moderation", async (actual) => ({ ...(await actual<object>()), moderationApi }));

import { useAuthStore } from "@/app/store/useAuthStore";
import AdminUsersPage from "./page";

const user = (overrides: object = {}) => ({
  id: "u1",
  email: "chidi@unilag.edu.ng",
  name: "Chidi Okafor",
  role: "SELLER",
  institutionName: "University of Lagos",
  verificationStatus: "VERIFIED",
  emailVerified: true,
  isSuspended: false,
  suspendedReason: null,
  suspendedAt: null,
  isActive: true,
  createdAt: "2026-10-01T10:00:00Z",
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminUsersPage />
    </QueryClientProvider>,
  );
}

// The table and the phone cards both render, so each row's text appears twice
const rowActions = (name: RegExp | string) => screen.getAllByRole("button", { name })[0];

describe("Admin users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.params = new URLSearchParams();
    useAuthStore.setState({ user: { id: "me", email: "admin@campusmart.test", role: "ADMIN" } as never });
  });
  afterEach(cleanup);

  it("suspends a user with a reason they'll see (M6)", async () => {
    moderationApi.users.mockResolvedValue({ items: [user()], nextCursor: null });
    moderationApi.suspend.mockResolvedValue(user({ isSuspended: true, suspendedReason: "Sold fake phones" }));
    renderPage();
    expect((await screen.findAllByText("Chidi Okafor")).length).toBeGreaterThan(0);
    fireEvent.click(rowActions("Suspend"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/signed out everywhere/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(await within(dialog).findByText(/Please give a reason/)).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Sold fake phones" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(moderationApi.suspend).toHaveBeenCalledWith("u1", "Sold fake phones"));
    expect(await screen.findByText("User suspended")).toBeTruthy();
  });

  it("shows a suspension's reason and lifts it", async () => {
    moderationApi.users.mockResolvedValue({
      items: [user({ isSuspended: true, suspendedReason: "Sold fake phones", suspendedAt: "2026-10-18T09:00:00Z" })],
      nextCursor: null,
    });
    moderationApi.unsuspend.mockResolvedValue(user());
    renderPage();
    expect((await screen.findAllByText("Sold fake phones")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Change role" })).toBeNull();
    fireEvent.click(rowActions("Lift suspension"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Lift suspension" }));
    await waitFor(() => expect(moderationApi.unsuspend).toHaveBeenCalledWith("u1"));
  });

  it("makes a user an admin (M1), warning when a seller's store closes", async () => {
    moderationApi.users.mockResolvedValue({ items: [user()], nextCursor: null });
    moderationApi.setRole.mockResolvedValue(user({ role: "ADMIN" }));
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Change role" }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Role"), { target: { value: "ADMIN" } });
    expect(within(dialog).getByText("Their store closes")).toBeTruthy();
    expect(within(dialog).getByText(/emailed code/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save role" }));
    await waitFor(() => expect(moderationApi.setRole).toHaveBeenCalledWith("u1", "ADMIN"));
    expect(await screen.findByText("Role changed")).toBeTruthy();
  });

  it("offers no actions on your own account, another admin's suspension or a rider", async () => {
    moderationApi.users.mockResolvedValue({
      items: [
        user({ id: "me", email: "admin@campusmart.test", name: null, role: "ADMIN" }),
        user({ id: "a2", email: "other@campusmart.test", name: "Other Admin", role: "ADMIN" }),
        user({ id: "r1", email: "musa@gmail.com", name: "Musa Bello", role: "DISPATCH" }),
      ],
      nextCursor: null,
    });
    renderPage();
    expect((await screen.findAllByText("Musa Bello")).length).toBeGreaterThan(0);
    // Only the other admin can have their role changed, and nobody here can be suspended
    expect(screen.getAllByRole("button", { name: "Change role" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
  });

  it("filters by role and suspended, in the URL", async () => {
    nav.params = new URLSearchParams("role=SELLER&tab=SUSPENDED");
    moderationApi.users.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("No one matches")).toBeTruthy();
    expect(moderationApi.users).toHaveBeenCalledWith({ role: "SELLER", suspended: true, cursor: undefined });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "BUYER" } });
    expect(nav.replace).toHaveBeenCalledWith("/admin/users?role=BUYER&tab=SUSPENDED", { scroll: false });
  });

  it("shows an error with a retry", async () => {
    moderationApi.users.mockRejectedValueOnce(new Error("down")).mockResolvedValue({ items: [user()], nextCursor: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect((await screen.findAllByText("Chidi Okafor")).length).toBeGreaterThan(0);
  });
});
