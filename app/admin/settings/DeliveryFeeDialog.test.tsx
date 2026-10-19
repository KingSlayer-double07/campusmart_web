import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const update = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("@/lib/api/hooks/useAdminInstitutions", () => ({ useUpdateInstitution: () => update }));

import DeliveryFeeDialog from "./DeliveryFeeDialog";

const school = (deliveryFeeKobo: number | null, placeCount = 2) =>
  ({ id: "i1", name: "University of Lagos", isActive: true, deliveryFeeKobo, placeCount }) as never;

describe("DeliveryFeeDialog", () => {
  beforeEach(() => {
    update.mutateAsync.mockReset();
  });
  afterEach(cleanup);

  it("sets the fee in naira, sent as kobo", async () => {
    update.mutateAsync.mockResolvedValue(school(50_000));
    const onSaved = vi.fn();
    render(<DeliveryFeeDialog institution={school(null)} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.queryByRole("button", { name: "Stop delivery on campus" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Fee in naira"), { target: { value: "five hundred" } });
    fireEvent.click(screen.getByRole("button", { name: "Save fee" }));
    expect(await screen.findByText("Enter the fee in naira, such as 500")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Fee in naira"), { target: { value: "₦500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save fee" }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ id: "i1", body: { deliveryFeeKobo: 50_000 } }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("can stop delivery on campus, and warns when the school has no places", async () => {
    update.mutateAsync.mockResolvedValue(school(null, 0));
    render(<DeliveryFeeDialog institution={school(50_000, 0)} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect((screen.getByLabelText("Fee in naira") as HTMLInputElement).value).toBe("500");
    expect(screen.getByText(/has no campus places yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop delivery on campus" }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ id: "i1", body: { deliveryFeeKobo: null } }));
  });
});
