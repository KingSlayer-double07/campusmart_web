"use client";

import ProductsCard, { ProductsCardSkeleton, type CardItem } from "./ProductsCard";

type Props = {
  items: CardItem[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyText?: string;
};

export default function ProductCarousel({
  items,
  isLoading,
  isError,
  onRetry,
  emptyText = "Nothing here yet. Check back soon.",
}: Props) {
  if (isLoading) {
    return (
      <div className="flex gap-3 sm:gap-4 px-4 sm:px-6 overflow-hidden" aria-busy="true" aria-label="Loading products">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shrink-0 w-38 sm:w-44 md:w-56">
            <ProductsCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 px-4 sm:px-6 text-sm text-foreground-muted">
        <p>We couldn&apos;t load these.</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-semibold text-main">
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return <p className="px-4 sm:px-6 text-sm text-foreground-muted">{emptyText}</p>;
  }

  return (
    <div className="flex gap-3 sm:gap-4 px-4 sm:px-6 overflow-x-scroll no-scrollbar">
      {items.map((item) => (
        <div key={item.id} className="shrink-0 w-38 sm:w-44 md:w-56">
          <ProductsCard item={item} />
        </div>
      ))}
    </div>
  );
}
