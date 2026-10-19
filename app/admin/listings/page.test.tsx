import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => "/admin/listings",
  useSearchParams: () => nav.params,
}));
const moderationApi = vi.hoisted(() => ({ listings: vi.fn(), moderate: vi.fn() }));
vi.mock("@/lib/api/moderation", async (actual) => ({ ...(await actual<object>()), moderationApi }));

import AdminListingsPage from "./page";

const listing = (overrides: object = {}) => ({
  id: "l1",
  title: "Replica watch",
  description: "Gold colour",
  imageUrl: null,
  priceKobo: 900_000,
  status: "FLAGGED",
  isFlagged: false,
  heldAt: "2026-10-18T09:00:00Z",
  heldWords: ["replica"],
  wentLive: false,
  moderationReason: null,
  openReports: 0,
  reportReasons: [],
  sellerId: "s1",
  storeName: "Chidi Gadgets",
  sellerSuspended: false,
  createdAt: "2026-10-18T09:00:00Z",
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminListingsPage />
    </QueryClientProvider>,
  );
}

describe("Admin listings (M2-M4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.params = new URLSearchParams();
  });
  afterEach(cleanup);

  it("shows why each listing is in the queue", async () => {
    moderationApi.listings.mockResolvedValue({
      items: [
        listing(),
        listing({
          id: "l2",
          title: "Phone",
          status: "ACTIVE",
          isFlagged: true,
          heldAt: null,
          heldWords: [],
          wentLive: true,
          openReports: 5,
          reportReasons: ["SCAM", "MISLEADING"],
        }),
        listing({ id: "l3", title: "Pills", isFlagged: true, heldAt: null, heldWords: [], wentLive: true, openReports: 1, reportReasons: ["PROHIBITED_ITEM"] }),
      ],
      nextCursor: null,
    });
    renderPage();
    expect((await screen.findAllByText("Uses: replica")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("5 open reports: Looks like a scam, Misleading description or photos").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reported as a prohibited item; hidden until you decide/).length).toBeGreaterThan(0);
    expect(moderationApi.listings).toHaveBeenCalledWith("REVIEW", { q: undefined, cursor: undefined });
  });

  it("approves a held listing", async () => {
    moderationApi.listings.mockResolvedValue({ items: [listing()], nextCursor: null });
    moderationApi.moderate.mockResolvedValue(listing({ status: "ACTIVE", heldAt: null, heldWords: [], wentLive: true }));
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Approve" }))[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/goes live for buyers/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(moderationApi.moderate).toHaveBeenCalledWith("l1", { type: "APPROVE" }));
    expect(await screen.findByText("Listing approved")).toBeTruthy();
  });

  it("takes a listing down with an M3 reason and a note", async () => {
    moderationApi.listings.mockResolvedValue({ items: [listing()], nextCursor: null });
    moderationApi.moderate.mockResolvedValue(listing({ heldAt: null, moderationReason: "Counterfeit: Fake logo" }));
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Take down" }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Take down" }));
    expect(await within(dialog).findByText("Choose why you're taking it down")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "PROHIBITED_ITEM" } });
    // Held before it ever went live: no suspension (M4f)
    expect(within(dialog).getByText(/won't be suspended/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "COUNTERFEIT" } });
    fireEvent.change(within(dialog).getByLabelText(/Note for the seller/), { target: { value: "Fake logo" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Take down" }));
    await waitFor(() =>
      expect(moderationApi.moderate).toHaveBeenCalledWith("l1", { type: "REJECT", reason: "COUNTERFEIT", note: "Fake logo" }),
    );
    expect(await screen.findByText("Listing taken down")).toBeTruthy();
  });

  it("warns that a prohibited item buyers saw suspends the seller (M4d)", async () => {
    moderationApi.listings.mockResolvedValue({
      items: [listing({ status: "ACTIVE", heldAt: null, heldWords: [], isFlagged: true, wentLive: true, openReports: 5, reportReasons: ["SCAM"] })],
      nextCursor: null,
    });
    moderationApi.moderate.mockResolvedValue(listing({ sellerSuspended: true }));
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Take down" }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "PROHIBITED_ITEM" } });
    expect(within(dialog).getByText("The seller will be suspended")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Take down and suspend" }));
    await waitFor(() => expect(moderationApi.moderate).toHaveBeenCalledWith("l1", { type: "REJECT", reason: "PROHIBITED_ITEM" }));
    expect(await screen.findByText("Chidi Gadgets was suspended")).toBeTruthy();
  });

  it("flags a live listing with what to check, and unflags it", async () => {
    moderationApi.listings.mockResolvedValue({
      items: [
        listing({ id: "l1", status: "ACTIVE", heldAt: null, heldWords: [], wentLive: true }),
        listing({ id: "l2", title: "Lamp", status: "ACTIVE", heldAt: null, heldWords: [], isFlagged: true, wentLive: true }),
      ],
      nextCursor: null,
    });
    moderationApi.moderate.mockResolvedValue(listing());
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Flag" }))[0]);
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("What to check"), { target: { value: "Price looks wrong" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Flag" }));
    await waitFor(() => expect(moderationApi.moderate).toHaveBeenCalledWith("l1", { type: "FLAG", note: "Price looks wrong" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getAllByRole("button", { name: "Unflag" })[0]);
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unflag" }));
    await waitFor(() => expect(moderationApi.moderate).toHaveBeenCalledWith("l2", { type: "UNFLAG" }));
  });

  it("says when there's nothing to review, and switches tabs in the URL", async () => {
    moderationApi.listings.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("Nothing to review")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Taken down" }));
    expect(nav.replace).toHaveBeenCalledWith("/admin/listings?tab=HIDDEN", { scroll: false });
  });
});
