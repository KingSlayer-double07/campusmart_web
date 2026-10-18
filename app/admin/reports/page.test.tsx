import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => "/admin/reports",
  useSearchParams: () => nav.params,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const moderationApi = vi.hoisted(() => ({ reports: vi.fn(), updateReport: vi.fn() }));
vi.mock("@/lib/api/moderation", async (actual) => ({ ...(await actual<object>()), moderationApi }));

import AdminReportsPage from "./page";

const report = (overrides: object = {}) => ({
  id: "r1",
  type: "LISTING",
  reason: "COUNTERFEIT",
  message: "Logo looks off",
  screenshotUrl: null,
  listingId: "l1",
  listingTitle: "Desk lamp",
  reporterEmail: "tobi@unilag.edu.ng",
  status: "OPEN",
  resolutionNote: null,
  createdAt: "2026-10-18T09:00:00Z",
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminReportsPage />
    </QueryClientProvider>,
  );
}

describe("Admin reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.params = new URLSearchParams();
  });
  afterEach(cleanup);

  it("closes a report with what was done", async () => {
    moderationApi.reports.mockResolvedValue({ items: [report()], nextCursor: null });
    moderationApi.updateReport.mockResolvedValue(report({ status: "CLOSED" }));
    renderPage();
    expect((await screen.findAllByText("Counterfeit or fake")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Desk lamp" })[0].getAttribute("href")).toBe("/admin/listings?tab=ALL&q=Desk%20lamp");
    expect(moderationApi.reports).toHaveBeenCalledWith("OPEN", undefined);
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close report" }));
    expect(await within(dialog).findByText(/Please fill in "What was done"/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("What was done"), { target: { value: "Receipt checked, genuine" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close report" }));
    await waitFor(() =>
      expect(moderationApi.updateReport).toHaveBeenCalledWith("r1", { status: "CLOSED", note: "Receipt checked, genuine" }),
    );
    expect(await screen.findByText("Report closed")).toBeTruthy();
  });

  it("reopens a closed report", async () => {
    nav.params = new URLSearchParams("tab=CLOSED");
    moderationApi.reports.mockResolvedValue({
      items: [report({ status: "CLOSED", resolutionNote: "Approved: checked" })],
      nextCursor: null,
    });
    moderationApi.updateReport.mockResolvedValue(report());
    renderPage();
    expect((await screen.findAllByText("Closed: Approved: checked")).length).toBeGreaterThan(0);
    expect(moderationApi.reports).toHaveBeenCalledWith("CLOSED", undefined);
    fireEvent.click(screen.getAllByRole("button", { name: "Reopen" })[0]);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(moderationApi.updateReport).toHaveBeenCalledWith("r1", { status: "OPEN" }));
  });

  it("says when nothing is open", async () => {
    moderationApi.reports.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("No open reports")).toBeTruthy();
  });
});
