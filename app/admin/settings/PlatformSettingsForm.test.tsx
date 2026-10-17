import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const update = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("@/lib/api/hooks/useAdminPayments", () => ({ useUpdateSettings: () => update }));

import { ApiError } from "@/lib/api/client";
import PlatformSettingsForm, { percentToBps } from "./PlatformSettingsForm";

const settings = { platformFeeBps: 0, pickupDeadlineDays: 3 };

describe("PlatformSettingsForm", () => {
  beforeEach(() => {
    update.mutateAsync.mockReset();
  });
  afterEach(cleanup);

  it("turns a percentage into basis points", () => {
    expect(percentToBps("2.5")).toBe(250);
    expect(percentToBps("0")).toBe(0);
    expect(percentToBps("50%")).toBe(5000);
    expect(percentToBps("50.01")).toBeNull();
    expect(percentToBps("two")).toBeNull();
  });

  it("checks the values, then sends only what changed", async () => {
    const onSaved = vi.fn();
    update.mutateAsync.mockResolvedValue({ platformFeeBps: 250, pickupDeadlineDays: 3 });
    render(<PlatformSettingsForm settings={settings} onSaved={onSaved} />);
    expect((screen.getByLabelText("Platform fee (%)") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("Days for a seller to hand over an order") as HTMLInputElement).value).toBe("3");

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Nothing has changed.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Platform fee (%)"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Days for a seller to hand over an order"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/Enter a percentage from 0 to 50/)).toBeTruthy();
    expect(screen.getByText(/Enter a whole number of days from 1 to 14/)).toBeTruthy();
    expect(update.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Platform fee (%)"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Days for a seller to hand over an order"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ platformFeeBps: 250 }));
    expect(onSaved).toHaveBeenCalledWith({ platformFeeBps: 250, pickupDeadlineDays: 3 });
  });

  it("shows why the API refused", async () => {
    update.mutateAsync.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Admins only"));
    render(<PlatformSettingsForm settings={settings} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Days for a seller to hand over an order"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Admins only")).toBeTruthy();
  });
});
