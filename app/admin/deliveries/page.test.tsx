import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, useRouter: () => nav.router, usePathname: () => "/admin/deliveries" }));
const adminDispatchApi = vi.hoisted(() => ({ deliveries: vi.fn(), riders: vi.fn(), assign: vi.fn(), locked: vi.fn(), unlock: vi.fn(), refund: vi.fn() }));
vi.mock("@/lib/api/dispatch", () => ({ adminDispatchApi }));

import AdminDeliveriesPage from "./page";

const job = (overrides: object = {}) => ({
  id: "j1",
  orderId: "o1",
  status: "OPEN",
  createdAt: "2026-10-17T10:00:00Z",
  acceptedAt: null,
  unacceptedAlertAt: "2026-10-17T15:00:00Z",
  institutionId: "i1",
  institutionName: "University of Lagos",
  rider: null,
  buyerName: "tobi",
  destination: "Faculty of Science",
  stops: [
    {
      sellerOrderId: "so1",
      code: "CM-7F3K2Q",
      storeName: "Ada Wears",
      area: "Moremi Hall",
      status: "AWAITING_RIDER",
      pickupDeadline: null,
      pickedUpAt: null,
      notReadyAt: null,
      deliveredAt: null,
      handoverLocked: false,
    },
  ],
  ...overrides,
});

function renderPage(query = "") {
  nav.params = new URLSearchParams(query);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminDeliveriesPage />
    </QueryClientProvider>,
  );
}

describe("AdminDeliveriesPage (C5, F5)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("flags a job nobody took and assigns a rider from that campus", async () => {
    adminDispatchApi.deliveries.mockResolvedValue({ items: [job()], nextCursor: null });
    adminDispatchApi.riders.mockResolvedValue({
      items: [
        { id: "r1", email: "musa@gmail.com", firstName: "Musa", lastName: null, invitePending: false, activeJobs: 0 },
        { id: "r2", email: "new@gmail.com", firstName: "New", lastName: null, invitePending: true, activeJobs: 0 },
      ],
      nextCursor: null,
    });
    adminDispatchApi.assign.mockResolvedValue(job({ status: "ASSIGNED", rider: { id: "r1", name: "Musa" } }));
    renderPage();
    expect((await screen.findAllByText(/Waiting over 5 hours/)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Assign rider" })[0]);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("option", { name: /Musa/ });
    expect(adminDispatchApi.riders).toHaveBeenCalledWith(expect.objectContaining({ status: "ACTIVE", institutionId: "i1" }));
    // Riders who haven't set a password yet can't take jobs
    expect(within(dialog).queryByRole("option", { name: /New/ })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Rider"), { target: { value: "r1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(adminDispatchApi.assign).toHaveBeenCalledWith("j1", "r1", undefined));
    expect(await screen.findByText("Rider assigned")).toBeTruthy();
  });

  it("unlocks a locked handover with a reason", async () => {
    adminDispatchApi.locked.mockResolvedValue({
      items: [{ sellerOrderId: "so1", orderId: "o1", code: "CM-7F3K2Q", storeName: "Ada Wears", buyerName: "tobi", deliveryMethod: "DISPATCH", lockedAt: "2026-10-17T12:00:00Z" }],
      nextCursor: null,
    });
    adminDispatchApi.deliveries.mockResolvedValue({ items: [], nextCursor: null });
    adminDispatchApi.unlock.mockResolvedValue({ sellerOrderId: "so1", unlocked: true });
    renderPage("view=LOCKED");
    fireEvent.click((await screen.findAllByRole("button", { name: "Unlock" }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Spoke to the buyer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(adminDispatchApi.unlock).toHaveBeenCalledWith("so1", "Spoke to the buyer"));
    expect(await screen.findByText("Unlocked")).toBeTruthy();
  });
});
