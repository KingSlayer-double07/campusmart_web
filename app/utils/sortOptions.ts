import type { ListingSort } from "@/lib/api/listings";

/**
 * Sort options for the categories page, in the API's own sort values (guide 3.2.5).
 */
export interface SortLabel {
  value: ListingSort;
  label: string;
}

export const DEFAULT_SORT: ListingSort = "newest";

export const SORT_OPTIONS: SortLabel[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

// Anything unknown in the URL falls back to the default
export const parseSort = (value: string | null): ListingSort =>
  SORT_OPTIONS.some((o) => o.value === value) ? (value as ListingSort) : DEFAULT_SORT;

export const getSortLabel = (sortBy: ListingSort): string =>
  SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label ?? "Newest";
