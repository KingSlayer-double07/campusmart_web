import { describe, expect, it } from "vitest";
import { emptyValues, validateListingForm, valuesFromListing, type ListingFormValues } from "./listingFormModel";

const photo = { key: "p1", kind: "existing" as const, url: "https://res.cloudinary.com/x/a.jpg", publicId: "a" };

const filled = (overrides: Partial<ListingFormValues> = {}): ListingFormValues => ({
  ...emptyValues(),
  photos: [photo],
  title: "  Desk lamp ",
  description: "Warm light",
  price: "4,500.50",
  stock: "3",
  category: "TECH",
  condition: "USED_GOOD",
  ...overrides,
});

describe("validateListingForm", () => {
  it("builds the API body with the price in kobo (Math.round(price * 100))", () => {
    expect(validateListingForm(filled())).toEqual({
      errors: {},
      fields: {
        title: "Desk lamp",
        description: "Warm light",
        priceKobo: 450_050,
        category: "TECH",
        condition: "USED_GOOD",
        stock: 3,
      },
    });
  });

  it("sends options instead of stock, with optional price overrides", () => {
    const { fields } = validateListingForm(
      filled({
        hasOptions: true,
        options: [
          { key: "a", label: "M", price: "", stock: "2" },
          { key: "b", label: "L", price: "5000", stock: "0" },
          { key: "c", label: "", price: "", stock: "" }, // a blank row is ignored
        ],
      }),
    );
    expect(fields).toMatchObject({
      variants: [
        { label: "M", stock: 2 },
        { label: "L", stock: 0, priceKobo: 500_000 },
      ],
    });
    expect(fields).not.toHaveProperty("stock");
  });

  it("explains each mistake next to its field", () => {
    const { errors, fields } = validateListingForm({
      ...emptyValues(),
      title: "ab",
      price: "0.5",
      stock: "two",
    });
    expect(fields).toBeNull();
    expect(errors).toMatchObject({
      photos: "Add at least one photo",
      title: "The name must be 3 to 120 characters",
      price: "The price must be at least ₦1",
      stock: "Enter how many you have",
      category: "Choose a category",
      condition: "Choose a condition",
    });
  });

  it("flags option rows that repeat a name or have no stock", () => {
    const { errors } = validateListingForm(
      filled({
        hasOptions: true,
        options: [
          { key: "a", label: "M", price: "", stock: "1" },
          { key: "b", label: "m", price: "", stock: "1" },
          { key: "c", label: "XL", price: "", stock: "" },
        ],
      }),
    );
    expect(errors.optionRows).toEqual({ b: '"m" is listed twice', c: "Enter how many of this option you have" });
  });

  it("needs at least one option when options are on", () => {
    const { errors } = validateListingForm(filled({ hasOptions: true, options: [{ key: "a", label: "", price: "", stock: "" }] }));
    expect(errors.options).toBe("Add at least one option, or switch options off");
  });
});

describe("valuesFromListing", () => {
  it("puts saved prices back in naira for editing", () => {
    const values = valuesFromListing({
      id: "l1",
      title: "Pants",
      description: "",
      priceKobo: 1_450_050,
      stock: 3,
      category: "FASHION",
      condition: "NEW",
      images: [{ id: "i1", url: "https://res.cloudinary.com/x/a.jpg", publicId: "a", position: 0 }],
      variants: [{ id: "v1", label: "M", priceKobo: null, stock: 3, isActive: true }],
    } as never);
    expect(values.price).toBe("14500.5");
    expect(values.hasOptions).toBe(true);
    expect(values.options[0]).toMatchObject({ key: "v1", label: "M", price: "", stock: "3" });
    expect(values.photos[0]).toMatchObject({ kind: "existing", publicId: "a" });
  });
});
