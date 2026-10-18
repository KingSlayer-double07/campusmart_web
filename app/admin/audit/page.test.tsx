import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => "/admin/audit",
  useSearchParams: () => nav.params,
}));
const moderationApi = vi.hoisted(() => ({ auditLog: vi.fn() }));
vi.mock("@/lib/api/moderation", async (actual) => ({ ...(await actual<object>()), moderationApi }));

import AdminAuditPage from "./page";

const entry = (overrides: object = {}) => ({
  id: "e1",
  action: "USER_SUSPENDED",
  entityType: "User",
  entityId: "u1",
  actorId: "a1",
  actorEmail: "admin@campusmart.test",
  meta: { reason: "Spam listings", archivedListings: 2 },
  createdAt: "2026-10-18T09:00:00Z",
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminAuditPage />
    </QueryClientProvider>,
  );
}

describe("Admin audit log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.params = new URLSearchParams();
  });
  afterEach(cleanup);

  it("shows who did what, when, with the details", async () => {
    moderationApi.auditLog.mockResolvedValue({
      items: [entry(), entry({ id: "e2", action: "ESCROW_RELEASED", entityType: "SellerOrder", actorId: null, actorEmail: null, meta: null })],
      nextCursor: null,
    });
    renderPage();
    expect((await screen.findAllByText("User suspended")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("reason: Spam listings · archivedListings: 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("admin@campusmart.test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("System").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Store order").length).toBeGreaterThan(0);
  });

  it("filters by record type and id, in the URL", async () => {
    nav.params = new URLSearchParams("entityType=Listing&entityId=l1");
    moderationApi.auditLog.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("Nothing matches")).toBeTruthy();
    expect(moderationApi.auditLog).toHaveBeenCalledWith({ entityType: "Listing", entityId: "l1", cursor: undefined });
    fireEvent.change(screen.getByLabelText("Record type"), { target: { value: "User" } });
    expect(nav.replace).toHaveBeenCalledWith("/admin/audit?entityType=User&entityId=l1", { scroll: false });
    fireEvent.change(screen.getByLabelText("Record id"), { target: { value: " u9 " } });
    fireEvent.submit(screen.getByLabelText("Record id").closest("form")!);
    expect(nav.replace).toHaveBeenLastCalledWith("/admin/audit?entityType=Listing&entityId=u9", { scroll: false });
  });
});
