import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

type Verification = { status: string; latestRequest: null | { createdAt: string; reviewNote: string | null } };
const state = vi.hoisted(() => ({
  query: {} as { data?: Verification; isPending: boolean; isError: boolean; refetch: () => void },
}));
const mutateAsync = vi.hoisted(() => vi.fn());
const uploadImages = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/hooks/useSellerVerification", () => ({
  useMyVerification: () => state.query,
  useSubmitVerification: () => ({ mutateAsync }),
}));
vi.mock("@/lib/uploads", () => ({ uploadImages }));

import { ApiError } from "@/lib/api/client";
import VerificationCard from "./VerificationCard";

const loaded = (data: Verification) => {
  state.query = { data, isPending: false, isError: false, refetch: vi.fn() };
};
const file = new File(["id"], "card.jpg", { type: "image/jpeg" });

describe("VerificationCard", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    uploadImages.mockReset();
  });
  afterEach(cleanup);

  it("asks an unverified seller for their student ID and sends it as a private upload", async () => {
    loaded({ status: "UNVERIFIED", latestRequest: null });
    uploadImages.mockResolvedValue([{ url: "https://res.cloudinary.com/x/image/authenticated/v1/card.jpg", publicId: "card" }]);
    mutateAsync.mockResolvedValue({});
    render(<VerificationCard />);

    expect(screen.getByRole("heading", { name: "Get verified to start selling" })).toBeTruthy();
    expect(screen.getByText(/Only CampusMart admins can see this photo/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Student ID photo"), { target: { files: [file] } });

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith("https://res.cloudinary.com/x/image/authenticated/v1/card.jpg"),
    );
    expect(uploadImages.mock.calls[0][0]).toEqual([file]);
    expect(uploadImages.mock.calls[0][1]).toBe("VERIFICATION");
  });

  it("says when uploads aren't set up", async () => {
    loaded({ status: "UNVERIFIED", latestRequest: null });
    uploadImages.mockRejectedValue(new ApiError(503, "UPLOADS_NOT_CONFIGURED", "not set up"));
    render(<VerificationCard />);
    fireEvent.change(screen.getByLabelText("Student ID photo"), { target: { files: [file] } });
    expect(await screen.findByText(/Photo uploads aren't set up yet/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows a pending request without another upload button", () => {
    loaded({ status: "PENDING", latestRequest: { createdAt: "2026-10-09T10:00:00Z", reviewNote: null } });
    render(<VerificationCard />);
    expect(screen.getByRole("heading", { name: "We're checking your student ID" })).toBeTruthy();
    expect(screen.getByText(/Sent 9 Oct 2026/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Upload|Send/ })).toBeNull();
  });

  it("shows the admin's note after a rejection and lets the seller try again", () => {
    loaded({
      status: "REJECTED",
      latestRequest: { createdAt: "2026-10-09T10:00:00Z", reviewNote: "The photo is blurry. Please retake it." },
    });
    render(<VerificationCard />);
    expect(screen.getByRole("heading", { name: "Your student ID wasn't approved" })).toBeTruthy();
    expect(screen.getByText("The photo is blurry. Please retake it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a new photo" })).toBeTruthy();
  });

  it("disappears once the seller is verified", () => {
    loaded({ status: "VERIFIED", latestRequest: null });
    const { container } = render(<VerificationCard />);
    expect(container.innerHTML).toBe("");
  });

  it("offers a retry when the status can't load", () => {
    state.query = { isPending: false, isError: true, refetch: vi.fn() };
    render(<VerificationCard />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.query.refetch).toHaveBeenCalled();
  });
});
