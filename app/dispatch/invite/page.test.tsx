import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ params: new URLSearchParams("token=abc123abc123abc123abc"), router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, useRouter: () => nav.router }));
const inviteApi = vi.hoisted(() => ({ info: vi.fn(), accept: vi.fn() }));
vi.mock("@/lib/api/dispatch", () => ({ inviteApi }));

import { ApiError } from "@/lib/api/client";
import RiderInvitePage from "./page";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RiderInvitePage />
    </QueryClientProvider>,
  );
}

describe("RiderInvitePage (DX1)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("greets the rider, checks the password, then signs them in", async () => {
    inviteApi.info.mockResolvedValue({ email: "musa@gmail.com", firstName: "Musa", institutionName: "University of Lagos" });
    inviteApi.accept.mockResolvedValue({ id: "r1", role: "DISPATCH", email: "musa@gmail.com" });
    renderPage();
    expect(await screen.findByText("Welcome, Musa")).toBeTruthy();
    expect(screen.getByText(/University of Lagos/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password and start" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Campus2026" } });
    fireEvent.change(screen.getByLabelText("Password again"), { target: { value: "Campus2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password and start" }));
    expect(await screen.findByText("The two passwords don't match")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Password again"), { target: { value: "Campus2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password and start" }));
    await waitFor(() => expect(inviteApi.accept).toHaveBeenCalledWith("abc123abc123abc123abc", "Campus2026"));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/dispatch"));
  });

  it("explains a link that expired or was used", async () => {
    inviteApi.info.mockRejectedValue(new ApiError(404, "INVALID_INVITE", "This invite link has expired"));
    renderPage();
    expect(await screen.findByText("This invite link doesn't work")).toBeTruthy();
  });
});
