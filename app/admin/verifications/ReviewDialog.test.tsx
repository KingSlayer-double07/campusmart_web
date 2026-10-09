import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/hooks/useAdminVerifications", () => ({
  useDecideVerification: () => ({ mutateAsync, isPending: false }),
}));

import { ApiError } from "@/lib/api/client";
import type { AdminVerificationRequest } from "@/lib/api/admin";
import ReviewDialog from "./ReviewDialog";

const request: AdminVerificationRequest = {
  id: "r1",
  status: "PENDING",
  createdAt: "2026-10-09T10:00:00Z",
  reviewedAt: null,
  reviewNote: null,
  documentViewUrl: "https://api.cloudinary.com/v1_1/campusmart/image/download?signature=abc",
  seller: {
    id: "s1",
    firstName: "Amaka",
    lastName: "Obi",
    email: "amaka@unilag.edu.ng",
    storeName: "Amaka Styles",
    institutionName: "University of Lagos",
  },
};

function open(overrides: Partial<AdminVerificationRequest> = {}) {
  const props = { onClose: vi.fn(), onDecided: vi.fn(), onReloadPhoto: vi.fn() };
  render(<ReviewDialog isOpen request={{ ...request, ...overrides }} {...props} />);
  return props;
}

describe("ReviewDialog", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });
  afterEach(cleanup);

  it("shows the ID photo next to the account it should match", async () => {
    open();
    const photo = await screen.findByRole("img", { name: "Student ID sent by Amaka Obi" });
    expect(photo.getAttribute("src")).toBe(request.documentViewUrl);
    expect(screen.getByText("amaka@unilag.edu.ng")).toBeTruthy();
    expect(screen.getByText("Amaka Styles")).toBeTruthy();
    expect(screen.getByText("University of Lagos")).toBeTruthy();
  });

  it("approves without a note", async () => {
    mutateAsync.mockResolvedValue({ ...request, status: "VERIFIED" });
    const { onDecided, onClose } = open();
    fireEvent.click(await screen.findByRole("button", { name: "Approve seller" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: "r1", body: { decision: "VERIFIED" } }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onDecided.mock.calls[0][0].status).toBe("VERIFIED");
  });

  it("needs a note to reject, and sends it trimmed", async () => {
    mutateAsync.mockResolvedValue({ ...request, status: "REJECTED" });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Reject…" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByText(/Tell the seller what to fix/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("What should they fix?"), { target: { value: "  Blurry photo  " } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ id: "r1", body: { decision: "REJECTED", note: "Blurry photo" } }),
    );
  });

  it("explains why the API refused and stays open", async () => {
    mutateAsync.mockRejectedValue(new ApiError(409, "VERIFICATION_ALREADY_DECIDED", "Someone already decided this request"));
    const { onClose } = open();
    fireEvent.click(await screen.findByRole("button", { name: "Approve seller" }));
    expect(await screen.findByText("Someone already decided this request")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("offers a fresh link when the photo has expired", async () => {
    const { onReloadPhoto } = open();
    fireEvent.error(await screen.findByRole("img"));
    expect(await screen.findByText("The photo can't be shown")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload photo" }));
    expect(onReloadPhoto).toHaveBeenCalled();
  });

  it("is read-only once decided", async () => {
    open({ status: "REJECTED", reviewedAt: "2026-10-09T12:00:00Z", reviewNote: "Blurry photo", documentViewUrl: null });
    expect(await screen.findByText("Blurry photo")).toBeTruthy();
    expect(screen.getByText(/wasn't uploaded through CampusMart/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve seller" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});
