import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const update = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("@/lib/api/hooks/useSellerProfile", () => ({ useUpdateSellerProfile: () => update }));

import { ApiError } from "@/lib/api/client";
import type { SellerProfile } from "@/lib/api/listings";
import DeliveryCard from "./DeliveryCard";

const profile = (overrides: Partial<SellerProfile> = {}) =>
  ({
    storeName: "Ada Wears",
    pickupArea: null,
    pickupAddress: null,
    contactPhone: null,
    allowsPickup: false,
    deliveryDetailsComplete: false,
    ...overrides,
  }) as SellerProfile;

describe("DeliveryCard", () => {
  beforeEach(() => {
    update.mutateAsync.mockReset();
  });
  afterEach(cleanup);

  it("asks for the details publishing needs, checks them, then saves", async () => {
    const onSaved = vi.fn();
    update.mutateAsync.mockResolvedValue({});
    render(<DeliveryCard profile={profile()} onSaved={onSaved} />);
    expect(screen.getByText(/before your products can go live/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add details" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Enter your area/)).toBeTruthy();
    expect(screen.getByText(/Enter the full address/)).toBeTruthy();
    expect(screen.getByText("Add a phone number so the rider can call you")).toBeTruthy();
    expect(update.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Area"), { target: { value: " Moremi Hall " } });
    fireEvent.change(screen.getByLabelText("Full address"), { target: { value: "Room 12, Block B" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+234 809 000 0000" } });
    fireEvent.click(screen.getByRole("switch", { name: "Let buyers pick up from me" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        pickupArea: "Moremi Hall",
        pickupAddress: "Room 12, Block B",
        contactPhone: "+234 809 000 0000",
        allowsPickup: true,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows saved details, and the API's reason when a save is refused", async () => {
    update.mutateAsync.mockRejectedValue(new ApiError(400, "PICKUP_DETAILS_REQUIRED", "Add your area, address and phone number first"));
    render(
      <DeliveryCard
        profile={profile({ pickupArea: "Moremi Hall", pickupAddress: "Room 12, Block B", contactPhone: "+234 809 000 0000", deliveryDetailsComplete: true })}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Moremi Hall")).toBeTruthy();
    expect(screen.getByText("Riders only; buyers can't pick up from you")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Add your area, address and phone number first")).toBeTruthy();
  });
});
