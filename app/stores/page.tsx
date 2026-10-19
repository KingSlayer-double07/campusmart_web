"use client";

import FeaturedStoreCard from "../components/FeaturedStoreCard";
import Nav from "../components/nav";
import PageHeader from "../components/PageHeader";
import { useRequireAuth } from "../hooks/useRequireAuth";
import { useStores } from "@/lib/api/hooks/useStores";

// Guide 8.2: every store at your school, best rated first (R3)
export default function StoresPage() {
  useRequireAuth();
  const stores = useStores();
  const items = stores.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <main className="flex flex-col gap-4 pb-28 pt-8">
        <div className="px-5">
          <PageHeader title="Stores" />
        </div>
        {stores.isPending ? (
          <div className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2" aria-label="Loading stores">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-muted" />
            ))}
          </div>
        ) : stores.isError ? (
          <p role="alert" className="px-5 py-10 text-center text-sm text-foreground-muted">
            We couldn&apos;t load stores.{" "}
            <button type="button" onClick={() => stores.refetch()} className="font-semibold text-main">
              Try again
            </button>
          </p>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-foreground-muted">No stores at your school yet. Check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2">
            {items.map((store) => (
              <FeaturedStoreCard key={store.sellerId} store={store} className="w-full" />
            ))}
          </div>
        )}
        {stores.hasNextPage && (
          <button
            type="button"
            onClick={() => stores.fetchNextPage()}
            disabled={stores.isFetchingNextPage}
            className="self-center py-2 text-sm font-semibold text-main disabled:opacity-50"
          >
            {stores.isFetchingNextPage ? "Loading…" : "Show more stores"}
          </button>
        )}
      </main>
      <Nav />
    </>
  );
}
