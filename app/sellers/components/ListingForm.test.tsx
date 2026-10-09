import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const uploadImages = vi.hoisted(() => vi.fn());
vi.mock("@/lib/uploads", () => ({ uploadImages }));

import { ApiError } from "@/lib/api/client";
import ListingForm from "./ListingForm";
import { emptyValues } from "./listingFormModel";

const existing = {
  key: "p1",
  kind: "existing" as const,
  url: "https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/listings/u1/a.jpg",
  publicId: "campusmart/listings/u1/a",
};

function fillBasics() {
  fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Desk lamp" } });
  fireEvent.change(screen.getByLabelText("Price"), { target: { value: "4500" } });
  fireEvent.change(screen.getByLabelText("Quantity in stock"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "TECH" } });
  fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "USED_GOOD" } });
}

describe("ListingForm", () => {
  // Braces matter: a function returned from beforeEach runs as a cleanup hook
  beforeEach(() => {
    uploadImages.mockReset();
  });
  afterEach(cleanup);

  it("publishes with the price in kobo and the photos it has", async () => {
    uploadImages.mockResolvedValue([]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ListingForm mode="create" initialValues={{ ...emptyValues(), photos: [existing] }} onSubmit={onSubmit} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [fields, images, intent] = onSubmit.mock.calls[0];
    expect(fields).toEqual({
      title: "Desk lamp",
      description: "",
      priceKobo: 450_000,
      category: "TECH",
      condition: "USED_GOOD",
      stock: 2,
    });
    expect(images).toEqual([{ url: existing.url, publicId: existing.publicId }]);
    expect(intent).toBe("ACTIVE");
  });

  it("saves a draft too", async () => {
    uploadImages.mockResolvedValue([]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ListingForm mode="create" initialValues={{ ...emptyValues(), photos: [existing] }} onSubmit={onSubmit} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(onSubmit.mock.calls[0]?.[2]).toBe("DRAFT"));
  });

  it("shows what's missing and uploads nothing", async () => {
    const onSubmit = vi.fn();
    render(<ListingForm mode="create" initialValues={emptyValues()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Add at least one photo")).toBeTruthy();
    expect(screen.getByText("Choose a category")).toBeTruthy();
    expect(screen.getByText(/Some details need fixing/)).toBeTruthy();
    expect(uploadImages).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("switches stock to per-option rows", async () => {
    uploadImages.mockResolvedValue([]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ListingForm mode="create" initialValues={{ ...emptyValues(), photos: [existing] }} onSubmit={onSubmit} />);
    fillBasics();
    fireEvent.click(screen.getByRole("switch", { name: "This item has sizes or options" }));
    expect(screen.queryByLabelText("Quantity in stock")).toBeNull();
    fireEvent.change(screen.getByLabelText("Option 1 name"), { target: { value: "M" } });
    fireEvent.change(screen.getByLabelText("Option 1 stock"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    fireEvent.change(screen.getByLabelText("Option 2 name"), { target: { value: "L" } });
    fireEvent.change(screen.getByLabelText("Option 2 price"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("Option 2 stock"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].variants).toEqual([
      { label: "M", stock: 3 },
      { label: "L", stock: 1, priceKobo: 500_000 },
    ]);
  });

  it("explains when uploads aren't set up", async () => {
    uploadImages.mockImplementation(async () => {
      throw new ApiError(503, "UPLOADS_NOT_CONFIGURED", "not set up");
    });
    const file = new File(["x"], "lamp.jpg", { type: "image/jpeg" });
    globalThis.URL.createObjectURL = vi.fn(() => "blob:lamp");
    globalThis.URL.revokeObjectURL = vi.fn();
    render(<ListingForm mode="create" initialValues={emptyValues()} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Choose photos"), { target: { files: [file] } });
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText(/Photo uploads aren't set up yet/)).toBeTruthy();
    expect(uploadImages.mock.calls[0][0]).toEqual([file]);
    expect(uploadImages.mock.calls[0][1]).toBe("LISTING");
  });

  it("offers drafts only until the seller is verified", async () => {
    uploadImages.mockResolvedValue([]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ListingForm mode="create" canPublish={false} initialValues={{ ...emptyValues(), photos: [existing] }} onSubmit={onSubmit} />,
    );
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    fillBasics();
    // Enter in a field submits too, as a draft
    fireEvent.submit(screen.getByLabelText("Product name").closest("form")!);
    await waitFor(() => expect(onSubmit.mock.calls[0]?.[2]).toBe("DRAFT"));
  });
});
