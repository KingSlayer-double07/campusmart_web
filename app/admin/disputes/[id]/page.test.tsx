import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "d1" }), useRouter: () => ({ push: vi.fn() }) }));
const adminDispatchApi = vi.hoisted(() => ({ dispute: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/api/dispatch", () => ({ adminDispatchApi }));

import AdminDisputePage from "./page";

const dispute = (overrides: object = {}) => ({
  id: "d1",
  sellerOrderId: "so1",
  orderId: "o1",
  code: "CM-7F3K2Q",
  storeName: "Tunde Tech",
  buyerName: "tobi",
  reason: "DAMAGED",
  details: "The lamp arrived cracked",
  evidenceUrls: ["https://res.cloudinary.com/x/image/upload/v1/campusmart/disputes/b1/a.jpg"],
  status: "OPEN",
  fault: null,
  resolutionNote: null,
  deliveryMethod: "DISPATCH",
  subtotalKobo: 450_000,
  handedOverAt: "2026-10-17T10:00:00Z",
  createdAt: "2026-10-17T12:00:00Z",
  resolvedAt: null,
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminDisputePage />
    </QueryClientProvider>,
  );
}

describe("AdminDisputePage (F8)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows the buyer's account and photos, then refunds with whose fault it was", async () => {
    adminDispatchApi.dispute.mockResolvedValue(dispute());
    adminDispatchApi.resolve.mockResolvedValue(dispute({ status: "RESOLVED_REFUND", fault: "SELLER", resolutionNote: "Cracked on arrival" }));
    renderPage();
    expect(await screen.findByText("The lamp arrived cracked")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Photo 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save decision" }));
    expect(await screen.findByText("Choose refund or release")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Refund the buyer/));
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Cracked on arrival" } });
    adminDispatchApi.dispute.mockResolvedValue(dispute({ status: "RESOLVED_REFUND", fault: "SELLER", resolutionNote: "Cracked on arrival" }));
    fireEvent.click(screen.getByRole("button", { name: "Save decision" }));
    await waitFor(() =>
      expect(adminDispatchApi.resolve).toHaveBeenCalledWith("d1", { outcome: "REFUND", fault: "SELLER", note: "Cracked on arrival" }),
    );
    expect(await screen.findByText(/Refunded: the seller's fault/)).toBeTruthy();
  });

  it("a decided dispute shows the decision only", async () => {
    adminDispatchApi.dispute.mockResolvedValue(dispute({ status: "RESOLVED_RELEASE", resolutionNote: "Photos show it intact", resolvedAt: "2026-10-18T09:00:00Z" }));
    renderPage();
    expect(await screen.findByText(/Released to the seller/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save decision" })).toBeNull();
  });
});
