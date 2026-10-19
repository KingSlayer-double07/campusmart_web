import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "j1" }), useRouter: () => router }));
const riderApi = vi.hoisted(() => ({
  job: vi.fn(),
  jobs: vi.fn(),
  accept: vi.fn(),
  updateWindow: vi.fn(),
  pickup: vi.fn(),
  notReady: vi.fn(),
  handOver: vi.fn(),
  drop: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/lib/api/dispatch", () => ({ riderApi }));

import { ApiError } from "@/lib/api/client";
import type { DeliveryJob, JobStop } from "@/lib/api/dispatch";
import RiderJobPage from "./page";

const stop = (overrides: Partial<JobStop> = {}): JobStop => ({
  sellerOrderId: "so1",
  storeName: null,
  area: "Moremi Hall",
  address: null,
  phone: null,
  itemCount: 2,
  items: [],
  status: "AWAITING_RIDER",
  arrivalFrom: null,
  arrivalTo: null,
  pickupDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  pickedUpAt: null,
  notReadyAt: null,
  notReadyNote: null,
  deliveredAt: null,
  handoverLocked: false,
  ...overrides,
});
const job = (overrides: Partial<DeliveryJob> = {}): DeliveryJob => ({
  id: "j1",
  status: "OPEN",
  mine: false,
  createdAt: "2026-10-17T10:00:00Z",
  acceptedAt: null,
  deliveryFeeKobo: 50_000,
  destination: { offCampus: false, campusPlace: "Faculty of Science", address: null },
  buyer: null,
  stops: [stop()],
  ...overrides,
});
const mine = (stopOverrides: Partial<JobStop>) =>
  job({
    status: "ASSIGNED",
    mine: true,
    buyer: { name: "tobi", phone: "+234 801 234 5678" },
    stops: [
      stop({
        storeName: "Ada Wears",
        address: "Room 12, Block B",
        phone: "+234 809 000 0000",
        items: [{ title: "Ankara dress", variantLabel: "M", quantity: 1 }],
        status: "RIDER_ASSIGNED",
        ...stopOverrides,
      }),
    ],
  });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RiderJobPage />
    </QueryClientProvider>,
  );
}

describe("RiderJobPage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("before accepting shows the areas only; accepting sends an arrival window per store (DF8b, C6)", async () => {
    riderApi.job.mockResolvedValue(job());
    riderApi.accept.mockResolvedValue(mine({}));
    renderPage();
    expect(await screen.findByText("Faculty of Science")).toBeTruthy();
    expect(screen.getByText(/Moremi Hall · 2 items/)).toBeTruthy();
    expect(screen.getByText(/show once you accept/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept job" }));
    await waitFor(() => expect(riderApi.accept).toHaveBeenCalled());
    const [id, windows] = riderApi.accept.mock.calls[0];
    expect(id).toBe("j1");
    expect(windows).toHaveLength(1);
    expect(windows[0].sellerOrderId).toBe("so1");
    expect(new Date(windows[0].to).getTime() - new Date(windows[0].from).getTime()).toBe(2 * 3_600_000);
  });

  it("if another rider took it first, says so and goes back to the list (DX2)", async () => {
    riderApi.job.mockResolvedValue(job());
    riderApi.accept.mockRejectedValue(new ApiError(409, "JOB_TAKEN", "Another rider took this job first"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Accept job" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dispatch"));
  });

  it("at the store: enter the CM- code; at the buyer: their 3-digit code (DX5, DL5)", async () => {
    riderApi.job.mockResolvedValue(mine({}));
    riderApi.pickup
      .mockRejectedValueOnce(new ApiError(400, "WRONG_CODE", "That code isn't for a store on this job"))
      .mockResolvedValue(mine({ status: "WITH_RIDER", pickedUpAt: "2026-10-18T10:00:00Z" }));
    renderPage();
    const store = await screen.findByRole("region", { name: /Store 1: Ada Wears/ });
    expect(within(store).getByText(/Room 12, Block B/)).toBeTruthy();
    expect(within(store).getByRole("link", { name: /809 000 0000/ }).getAttribute("href")).toBe("tel:+2348090000000");
    expect(screen.getByRole("link", { name: /801 234 5678/ })).toBeTruthy();

    const codeInput = within(store).getByLabelText("Store's order code");
    fireEvent.change(codeInput, { target: { value: "cm-zzzzzz" } });
    fireEvent.click(within(store).getByRole("button", { name: "Collect" }));
    expect(await within(store).findByText("That code isn't for a store on this job")).toBeTruthy();
    fireEvent.change(codeInput, { target: { value: "CM-7F3K2Q" } });
    fireEvent.click(within(store).getByRole("button", { name: "Collect" }));
    await waitFor(() => expect(riderApi.pickup).toHaveBeenLastCalledWith("j1", "CM-7F3K2Q"));

    riderApi.handOver.mockResolvedValue(mine({ status: "DELIVERED", deliveredAt: "2026-10-18T11:00:00Z" }));
    const handover = await screen.findByLabelText("Buyer's code for Ada Wears");
    fireEvent.change(handover, { target: { value: "048" } });
    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    await waitFor(() => expect(riderApi.handOver).toHaveBeenCalledWith("j1", "so1", "048"));
    expect(await screen.findByText(/^Delivered .*/, { selector: "p" })).toBeTruthy();
  });

  it("can report a store not ready (DF11), and give the job back while carrying nothing (C5)", async () => {
    riderApi.job.mockResolvedValue(mine({}));
    riderApi.notReady.mockResolvedValue(mine({ notReadyAt: "2026-10-18T10:00:00Z" }));
    riderApi.drop.mockResolvedValue(job());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Not ready, or the seller isn't there/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Note (optional)"), { target: { value: "Shop closed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Report and carry on" }));
    await waitFor(() => expect(riderApi.notReady).toHaveBeenCalledWith("j1", "so1", "Shop closed"));

    fireEvent.click(screen.getByRole("button", { name: "Give this job back" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Give it back" }));
    await waitFor(() => expect(riderApi.drop).toHaveBeenCalledWith("j1"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dispatch"));
  });

  it("says when the job isn't available", async () => {
    riderApi.job.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Job not found"));
    renderPage();
    expect(await screen.findByText("This job isn't available any more")).toBeTruthy();
  });
});
