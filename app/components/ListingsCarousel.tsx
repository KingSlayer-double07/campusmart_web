"use client";

import type { ListingFilters } from "@/lib/api/listings";
import { useListings } from "@/lib/api/hooks/useListings";
import ProductCarousel from "./ProductCarousel";
import { toCardItem } from "./ProductsCard";

// A row of real listings for one sort, with loading, empty and error states
export default function ListingsCarousel({ filters, emptyText }: { filters: ListingFilters; emptyText?: string }) {
  const query = useListings({ limit: 10, ...filters });
  return (
    <ProductCarousel
      items={query.data?.pages[0]?.items.map(toCardItem)}
      isLoading={query.isPending}
      isError={query.isError}
      onRetry={() => query.refetch()}
      emptyText={emptyText}
    />
  );
}
