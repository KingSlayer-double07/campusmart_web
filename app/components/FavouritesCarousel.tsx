"use client";

import { useWishlist, useWishlistPage } from "@/lib/api/hooks/useWishlist";
import ProductCarousel from "./ProductCarousel";
import { toCardItem } from "./ProductsCard";

// The account's favourites in a row (guide 8.1)
export default function FavouritesCarousel() {
  const { canSave } = useWishlist();
  const page = useWishlistPage(10);
  if (!canSave) return <ProductCarousel items={[]} emptyText="Sign in to see your favourites here." />;
  return (
    <ProductCarousel
      items={page.data?.pages[0]?.items.map(toCardItem)}
      isLoading={page.isPending}
      isError={page.isError}
      onRetry={() => page.refetch()}
      emptyText="Tap the heart on a product to save it here."
    />
  );
}
