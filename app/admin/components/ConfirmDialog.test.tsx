import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import ConfirmDialog from "./ConfirmDialog";

function open(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      isOpen
      onClose={onClose}
      title="Switch off institution?"
      description="It will be paused."
      confirmLabel="Switch off"
      {...props}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onClose };
}

describe("ConfirmDialog", () => {
  afterEach(cleanup);

  it("won't confirm a destructive action without a reason", async () => {
    const { onConfirm } = open();
    fireEvent.click(await screen.findByRole("button", { name: "Switch off" }));
    expect(await screen.findByText(/Please give a reason/)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason, then closes", async () => {
    const { onConfirm, onClose } = open();
    fireEvent.change(await screen.findByLabelText("Reason"), { target: { value: "  Term break  " } });
    fireEvent.click(screen.getByRole("button", { name: "Switch off" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Term break"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("clears the reason error as soon as you type", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Switch off" }));
    await screen.findByText(/Please give a reason/);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "T" } });
    expect(screen.queryByText(/Please give a reason/)).toBeNull();
  });

  it("shows the API's message and stays open when it fails", async () => {
    const { onClose } = open({
      onConfirm: vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", "Already switched off")),
    });
    fireEvent.change(await screen.findByLabelText("Reason"), { target: { value: "Term break" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch off" }));
    expect(await screen.findByText("Already switched off")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("needs no reason for a non-destructive confirmation", async () => {
    const { onConfirm } = open({ tone: "default", confirmLabel: "Switch on" });
    expect(screen.queryByLabelText("Reason")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Switch on" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(undefined));
  });
});
