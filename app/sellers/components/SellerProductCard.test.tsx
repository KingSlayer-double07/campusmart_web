import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SellerProductCard, { skuOf, statusActions } from "./SellerProductCard";

const listing = {
  id: "3f8a1c9e-2b7d-4e5f-8a6b-1c2d3eabc123",
  title: "Desk lamp",
  priceKobo: 450_000,
  minPriceKobo: 450_000,
  maxPriceKobo: 450_000,
  imageUrl: null,
  category: "TECH",
  condition: "USED_GOOD",
  status: "DRAFT",
  stock: 2,
  ratingAvg: 0,
  ratingCount: 0,
  hasVariants: false,
  createdAt: "2026-10-09T00:00:00.000Z",
  seller: { id: "s1", displayName: "Ada", verified: false },
} as const;

describe("SellerProductCard", () => {
  afterEach(cleanup);

  it("shows the SKU as the last 6 characters of the ID, the label and the price", () => {
    expect(skuOf(listing.id)).toBe("ABC123");
    render(<SellerProductCard product={listing as never} actions={{ onStatus: vi.fn(), onAdjustStock: vi.fn(), onDelete: vi.fn() }} />);
    expect(screen.getByText("SKU ABC123")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("₦4,500")).toBeTruthy();
  });

  it("offers status moves that fit the current status", () => {
    expect(statusActions("DRAFT").map((a) => a.label)).toEqual(["Publish", "Archive"]);
    expect(statusActions("ACTIVE").map((a) => a.label)).toEqual(["Move to draft", "Archive"]);
    expect(statusActions("SOLDOUT").map((a) => a.label)).toEqual(["Move to draft", "Archive"]);
    expect(statusActions("ARCHIVED").map((a) => a.label)).toEqual(["Publish", "Move to draft"]);
    expect(statusActions("FLAGGED")).toEqual([]);
  });

  it("runs the menu's actions", () => {
    const actions = { onStatus: vi.fn(), onAdjustStock: vi.fn(), onDelete: vi.fn() };
    render(<SellerProductCard product={listing as never} actions={actions} />);
    const open = () => fireEvent.click(screen.getByRole("button", { name: "Actions for Desk lamp" }));

    open();
    expect(screen.getByRole("menuitem", { name: "Edit" }).getAttribute("href")).toBe(`/sellers/products/${listing.id}/edit`);
    fireEvent.click(screen.getByRole("menuitem", { name: "Publish" }));
    expect(actions.onStatus).toHaveBeenCalledWith(listing, "ACTIVE");

    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Adjust stock" }));
    expect(actions.onAdjustStock).toHaveBeenCalledWith(listing);

    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(actions.onDelete).toHaveBeenCalledWith(listing);
  });
});
