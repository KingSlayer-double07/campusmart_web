import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const create = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const update = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("@/lib/api/hooks/useAdminCampusPlaces", () => ({ useCreateCampusPlace: () => create, useUpdateCampusPlace: () => update }));

import { ApiError } from "@/lib/api/client";
import PlaceForm from "./PlaceForm";

const school = { id: "i1", name: "University of Lagos", isActive: true } as never;
const place = { id: "p1", name: "Moremi Hall", isActive: true, institution: { id: "i1", name: "University of Lagos", isActive: true }, orderCount: 0 };

describe("PlaceForm", () => {
  beforeEach(() => {
    create.mutateAsync.mockReset();
    update.mutateAsync.mockReset();
  });
  afterEach(cleanup);

  it("adds a place at the only school, trimmed", async () => {
    create.mutateAsync.mockResolvedValue(place);
    const onSaved = vi.fn();
    render(<PlaceForm isOpen institutions={[school]} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Add place" }));
    expect(await screen.findByText(/Name the place the way students say it/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "  Moremi Hall " } });
    fireEvent.click(screen.getByRole("button", { name: "Add place" }));
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledWith({ institutionId: "i1", name: "Moremi Hall" }));
    expect(onSaved).toHaveBeenCalledWith(place, "created");
  });

  it("renames without changing the school, and shows a name clash", async () => {
    update.mutateAsync.mockRejectedValue(new ApiError(409, "CONFLICT", 'University of Lagos already has a place called "Moremi Hall"'));
    render(<PlaceForm isOpen place={place} institutions={[school]} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText("Institution")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/already has a place called/)).toBeTruthy();
    expect(update.mutateAsync).toHaveBeenCalledWith({ id: "p1", body: { name: "Moremi Hall" } });
  });
});
