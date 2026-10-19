import type { CreateListingBody, Listing } from "@/lib/api/listings";
import { koboToNairaInput, nairaToKobo, type ListingCategory, type ProductCondition } from "@/lib/labels";

export const MAX_PHOTOS = 8;
export const MAX_OPTIONS = 20;
const MIN_PRICE_KOBO = 100; // ₦1, the API's minimum

export type PhotoSlot =
  | { key: string; kind: "existing"; url: string; publicId: string }
  | { key: string; kind: "new"; file: File; previewUrl: string };

export interface OptionRow {
  key: string;
  label: string;
  price: string; // naira, optional override
  stock: string;
}

export interface ListingFormValues {
  photos: PhotoSlot[];
  title: string;
  description: string;
  price: string; // naira as typed
  stock: string;
  category: ListingCategory | "";
  condition: ProductCondition | "";
  hasOptions: boolean;
  options: OptionRow[];
}

export type ListingFormErrors = Partial<
  Record<"photos" | "title" | "description" | "price" | "stock" | "category" | "condition" | "options", string>
> & { optionRows?: Record<string, string> };

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const emptyOption = (): OptionRow => ({ key: newKey(), label: "", price: "", stock: "" });

export function emptyValues(): ListingFormValues {
  return {
    photos: [],
    title: "",
    description: "",
    price: "",
    stock: "1",
    category: "",
    condition: "",
    hasOptions: false,
    options: [emptyOption()],
  };
}

// The edit form starts from the saved listing (prices back in naira)
export function valuesFromListing(listing: Listing): ListingFormValues {
  return {
    photos: listing.images.map((img) => ({ key: img.id, kind: "existing", url: img.url, publicId: img.publicId })),
    title: listing.title,
    description: listing.description,
    price: koboToNairaInput(listing.priceKobo),
    stock: String(listing.stock),
    category: listing.category,
    condition: listing.condition,
    hasOptions: listing.variants.length > 0,
    options: listing.variants.length
      ? listing.variants.map((v) => ({
          key: v.id,
          label: v.label,
          price: v.priceKobo === null ? "" : koboToNairaInput(v.priceKobo),
          stock: String(v.stock),
        }))
      : [emptyOption()],
  };
}

const wholeNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

export type ListingFields = Omit<CreateListingBody, "images" | "status">;

// Checks everything the API checks, so mistakes show next to the field before any upload starts.
// Returns the request body (without photos and status) when the form is valid.
export function validateListingForm(values: ListingFormValues): { errors: ListingFormErrors; fields: ListingFields | null } {
  const errors: ListingFormErrors = {};

  if (values.photos.length === 0) errors.photos = "Add at least one photo";
  if (values.photos.length > MAX_PHOTOS) errors.photos = `Add up to ${MAX_PHOTOS} photos`;

  const title = values.title.trim();
  if (title.length < 3 || title.length > 120) errors.title = "The name must be 3 to 120 characters";
  if (values.description.trim().length > 2000) errors.description = "The description can be up to 2,000 characters";

  const priceKobo = nairaToKobo(values.price);
  if (priceKobo === null) errors.price = "Enter a price in naira, such as 14500";
  else if (priceKobo < MIN_PRICE_KOBO) errors.price = "The price must be at least ₦1";

  if (!values.category) errors.category = "Choose a category";
  if (!values.condition) errors.condition = "Choose a condition";

  let stock: number | undefined;
  let variants: ListingFields["variants"];
  if (values.hasOptions) {
    const rows = values.options.filter((o) => o.label.trim() || o.price.trim() || o.stock.trim());
    const rowErrors: Record<string, string> = {};
    const seen = new Set<string>();
    variants = [];
    for (const row of rows) {
      const label = row.label.trim();
      const rowStock = wholeNumber(row.stock);
      const rowPrice = row.price.trim() ? nairaToKobo(row.price) : null;
      if (!label || label.length > 40) rowErrors[row.key] = "Give the option a name of up to 40 characters";
      else if (seen.has(label.toLowerCase())) rowErrors[row.key] = `"${label}" is listed twice`;
      else if (rowStock === null) rowErrors[row.key] = "Enter how many of this option you have";
      else if (row.price.trim() && (rowPrice === null || rowPrice < MIN_PRICE_KOBO))
        rowErrors[row.key] = "Leave the price empty or enter at least ₦1";
      seen.add(label.toLowerCase());
      if (!rowErrors[row.key]) {
        variants.push({ label, stock: rowStock!, ...(rowPrice !== null && { priceKobo: rowPrice }) });
      }
    }
    if (rows.length === 0) errors.options = "Add at least one option, or switch options off";
    if (rows.length > MAX_OPTIONS) errors.options = `Add up to ${MAX_OPTIONS} options`;
    if (Object.keys(rowErrors).length) errors.optionRows = rowErrors;
  } else {
    const parsed = wholeNumber(values.stock);
    if (parsed === null) errors.stock = "Enter how many you have";
    else stock = parsed;
  }

  const valid = Object.keys(errors).length === 0;
  return {
    errors,
    fields: valid
      ? {
          title,
          description: values.description.trim(),
          priceKobo: priceKobo!,
          category: values.category as ListingCategory,
          condition: values.condition as ProductCondition,
          ...(values.hasOptions ? { variants } : { stock }),
        }
      : null,
  };
}
