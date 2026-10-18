"use client";

import { useFeaturedStores } from "@/lib/api/hooks/useStores";
import FeaturedStoreCard from "./FeaturedStoreCard";

// Guide 8.2: GET /stores?featured=true, best first
export default function FeaturedStoresRow() {
  const stores = useFeaturedStores();
  if (stores.isPending) {
    return (
      <div className="flex gap-3 overflow-hidden px-4 sm:px-6" aria-label="Loading stores">
        {[0, 1].map((i) => (
          <div key={i} className="h-36 w-60 shrink-0 animate-pulse rounded-xl bg-surface-muted" />
        ))}
      </div>
    );
  }
  if (stores.isError) {
    return (
      <p className="px-4 text-sm text-foreground-muted sm:px-6">
        We couldn&apos;t load stores.{" "}
        <button type="button" onClick={() => stores.refetch()} className="font-semibold text-main">
          Try again
        </button>
      </p>
    );
  }
  if (stores.data.items.length === 0) {
    return <p className="px-4 text-sm text-foreground-muted sm:px-6">No stores at your school yet. Check back soon.</p>;
  }
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-scroll px-4 sm:px-6">
      {stores.data.items.map((store) => (
        <FeaturedStoreCard key={store.sellerId} store={store} />
      ))}
    </div>
  );
}
