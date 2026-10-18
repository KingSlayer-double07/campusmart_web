import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const listingsApi = vi.hoisted(() => ({ setStatus: vi.fn(), remove: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api/listings", async (actual) => ({ ...(await actual<object>()), listingsApi }));

import { ApiError } from "@/lib/api/client";
import { useListingActions } from "./useListingActions";
import ModerationNotice from "./ModerationNotice";

const lamp = { id: "l1", title: "Desk lamp" };

function Harness() {
  const { actions, dialogs } = useListingActions();
  return (
    <>
      <button type="button" onClick={() => actions.onStatus(lamp as never, "ACTIVE")}>
        Publish lamp
      </button>
      <button type="button" onClick={() => actions.onStatus(lamp as never, "ARCHIVED")}>
        Archive lamp
      </button>
      {dialogs}
    </>
  );
}

function renderHarness() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe("useListingActions: publishing (M4a)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("asks for the prohibited-items confirmation before publishing", async () => {
    listingsApi.setStatus.mockResolvedValue({ ...lamp, status: "ACTIVE" });
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Publish lamp" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/prohibited list to publish/);
    expect(listingsApi.setStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(listingsApi.setStatus).toHaveBeenCalledWith("l1", "ACTIVE", true));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says when a banned word sent it for review instead (M4c)", async () => {
    listingsApi.setStatus.mockResolvedValue({ ...lamp, status: "FLAGGED" });
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Publish lamp" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Sent for review")).toBeTruthy();
  });

  it("keeps the dialog open with the API's reason when publishing fails", async () => {
    listingsApi.setStatus.mockRejectedValue(new ApiError(403, "SELLER_NOT_VERIFIED", "Get verified first"));
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Publish lamp" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Get verified first")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("archives without asking", async () => {
    listingsApi.setStatus.mockResolvedValue({ ...lamp, status: "ARCHIVED" });
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Archive lamp" }));
    await waitFor(() => expect(listingsApi.setStatus).toHaveBeenCalledWith("l1", "ARCHIVED", false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ModerationNotice", () => {
  afterEach(cleanup);

  it("tells the seller a held listing waits for review", () => {
    render(<ModerationNotice listing={{ status: "FLAGGED", heldForReview: true, moderationReason: null }} />);
    expect(screen.getByText("Waiting for review")).toBeTruthy();
  });

  it("shows an admin's reason and how to send it back", () => {
    render(<ModerationNotice listing={{ status: "FLAGGED", heldForReview: false, moderationReason: "Poor photos: too dark" }} />);
    expect(screen.getByText(/Taken down: Poor photos: too dark\. Edit it to fix this/)).toBeTruthy();
  });

  it("shows a report's sentence as it is", () => {
    render(
      <ModerationNotice
        listing={{
          status: "FLAGGED",
          heldForReview: false,
          moderationReason: "Reported as a prohibited item. It’s hidden until CampusMart reviews it.",
        }}
      />,
    );
    expect(screen.getByText("Reported as a prohibited item. It’s hidden until CampusMart reviews it.")).toBeTruthy();
  });

  it("shows nothing for a live listing", () => {
    const { container } = render(<ModerationNotice listing={{ status: "ACTIVE", heldForReview: false, moderationReason: null }} />);
    expect(container.textContent).toBe("");
  });
});
