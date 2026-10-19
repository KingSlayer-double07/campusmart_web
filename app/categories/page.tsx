"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import type { ListingCategory } from "@/lib/labels";
import { CATEGORY_LABELS } from "@/lib/labels";
import { useListings } from "@/lib/api/hooks/useListings";
import Nav from "../components/nav";
import ProductsCard, { ProductsCardSkeleton, toCardItem } from "../components/ProductsCard";
import CategoryItem from "../components/CategoryItem";
import { CATEGORY_ITEMS } from "../components/categoryIcons";
import SearchBar from "../components/SearchBar";
import { DEFAULT_SORT, parseSort, SORT_OPTIONS } from "../utils/sortOptions";

const CATEGORY_VALUES = Object.keys(CATEGORY_LABELS) as ListingCategory[];

// Guide 3.2.5: category, q and sort live in the URL, so a search can be shared or reloaded
function CategoriesScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const categoryParam = params.get("category");
  const category = CATEGORY_VALUES.includes(categoryParam as ListingCategory)
    ? (categoryParam as ListingCategory)
    : undefined;
  const sort = parseSort(params.get("sort"));

  const listings = useListings({ q: q || undefined, category, sort });
  const items = listings.data?.pages.flatMap((p) => p.items) ?? [];

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const filtered = !!(q || category || sort !== DEFAULT_SORT);

  return (
    <>
      <main className="pb-28 pt-8">
        <div className="flex flex-col gap-4 px-4 sm:px-6">
          <SearchBar />

          {/* Categories filter */}
          <div className="flex justify-between pb-2 px-1">
            {CATEGORY_ITEMS.map((item) => (
              <CategoryItem
                key={item.value}
                category={item}
                isActive={category === item.value}
                onClick={() => setParam({ category: category === item.value ? null : item.value })}
              />
            ))}
          </div>
        </div>

        {/* Sorting options */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar px-4 sm:px-6">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sort === option.value}
              onClick={() => setParam({ sort: option.value === DEFAULT_SORT ? null : option.value })}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition border ${
                sort === option.value
                  ? "bg-main text-white border-main"
                  : "bg-card border-border-default text-foreground hover:border-border-default"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Results info */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-2">
          <p className="text-sm text-foreground-muted">
            {category ? CATEGORY_LABELS[category] : "All categories"}
            {q && ` · "${q}"`}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => router.replace(pathname, { scroll: false })}
              className="text-xs text-main font-medium hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {listings.isPending ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-4 sm:px-6" aria-busy="true" aria-label="Loading products">
            {[0, 1, 2, 3].map((i) => (
              <ProductsCardSkeleton key={i} />
            ))}
          </div>
        ) : listings.isError ? (
          <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
            <p className="text-sm text-foreground-muted">We couldn&apos;t load products.</p>
            <button type="button" onClick={() => listings.refetch()} className="text-sm font-semibold text-main">
              Try again
            </button>
          </div>
        ) : items.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-4 sm:px-6">
              {items.map((listing) => (
                <ProductsCard key={listing.id} item={toCardItem(listing)} />
              ))}
            </div>
            {listings.hasNextPage && (
              <div className="flex justify-center pt-6">
                <button
                  type="button"
                  onClick={() => listings.fetchNextPage()}
                  disabled={listings.isFetchingNextPage}
                  className="rounded-full border border-border-default px-5 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {listings.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-4 px-4">
            <div className="size-16 rounded-full bg-surface-muted flex items-center justify-center">
              <SearchIcon size={32} className="text-foreground-muted" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">No products found</p>
              <p className="text-sm text-foreground-muted">
                {filtered ? "Try other words or another category" : "Nothing is listed at your school yet"}
              </p>
            </div>
          </div>
        )}
      </main>
      <Nav />
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <CategoriesScreen />
    </Suspense>
  );
}
