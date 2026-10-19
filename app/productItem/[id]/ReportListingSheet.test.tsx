import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const reportsApi = vi.hoisted(() => ({ reportListing: vi.fn() }));
vi.mock("@/lib/api/moderation", async (actual) => ({ ...(await actual<object>()), reportsApi }));

import { ApiError } from "@/lib/api/client";
import ReportListingSheet from "./ReportListingSheet";

function renderSheet() {
  const onReported = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReportListingSheet listingId="l1" isOpen onClose={onClose} onReported={onReported} />
    </QueryClientProvider>,
  );
  return { onReported, onClose };
}

describe("ReportListingSheet (M4, M4b)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("needs a reason, then sends it with the details", async () => {
    reportsApi.reportListing.mockResolvedValue({ id: "r1", hidden: false });
    const { onReported, onClose } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Choose what's wrong");
    fireEvent.click(screen.getByLabelText("Looks like a scam"));
    fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: " Asked me to pay outside " } });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() =>
      expect(reportsApi.reportListing).toHaveBeenCalledWith("l1", { reason: "SCAM", details: "Asked me to pay outside" }),
    );
    expect(onReported).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("says a prohibited-item report hides the listing", async () => {
    reportsApi.reportListing.mockResolvedValue({ id: "r1", hidden: true });
    const { onReported } = renderSheet();
    fireEvent.click(screen.getByLabelText("Prohibited item"));
    expect(screen.getByText(/hidden from buyers until an admin checks it/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(onReported).toHaveBeenCalledWith(true));
  });

  it("shows why the API refused, such as a second report", async () => {
    reportsApi.reportListing.mockRejectedValue(new ApiError(409, "ALREADY_REPORTED", "You’ve already reported this listing"));
    const { onReported } = renderSheet();
    fireEvent.click(screen.getByLabelText("Something else"));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You’ve already reported this listing");
    expect(onReported).not.toHaveBeenCalled();
  });
});
