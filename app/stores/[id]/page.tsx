"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, MapPin, Store as StoreIcon } from "lucide-react";
import Nav from "@/app/components/nav";
import PageHeader from "@/app/components/PageHeader";
import ProductsCard, { ProductsCardSkeleton, toCardItem } from "@/app/components/ProductsCard";
import ReviewList, { Stars } from "@/app/components/ReviewList";
import TrustedBadge from "@/app/components/TrustedBadge";
import { useRequireAuth } from "@/app/hooks/useRequireAuth";
import { ApiError } from "@/lib/api/client";
import { useStoreReviews } from "@/lib/api/hooks/useReviews";
import { useStore, useStoreListings } from "@/lib/api/hooks/useStores";

const joined = new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "Africa/Lagos" });

// Guide 8.2: a store's header, its live listings and its reviews
export default function StorePage() {
  useRequireAuth();
  const { id } = useParams<{ id: string }>();
  const store = useStore(id);
  const listings = useStoreListings(store.data ? id : undefined);
  const reviews = useStoreReviews(store.data && store.data.ratingCount > 0 ? id : undefined);
  const [tab, setTab] = useState<"items" | "reviews">("items");

  if (store.isPending) {
    return (
      <main className="flex flex-col gap-4 px-5 pt-8 pb-28" aria-label="Loading store">
        <div className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
      </main>
    );
  }
  if (store.isError) {
    const missing = store.error instanceof ApiError && store.error.status === 404;
    return (
      <main className="flex flex-col gap-6 px-6 pt-8 pb-28">
        <PageHeader title="Store" />
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium text-foreground">{missing ? "This store isn't at your school" : "We couldn't load this store"}</p>
          {missing ? (
            <Link href="/stores" className="text-sm font-semibold text-main">
              See stores at your school
            </Link>
          ) : (
            <button type="button" onClick={() => store.refetch()} className="text-sm font-semibold text-main">
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  const s = store.data;
  const items = listings.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <main className="flex flex-col gap-5 pb-28 pt-8">
        <div className="px-5">
          <PageHeader title="Store" />
        </div>

        <section aria-label={s.storeName} className="mx-4 flex flex-col gap-3 rounded-2xl border border-border-default bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200">
              {s.logoUrl ? <Image src={s.logoUrl} alt="" fill sizes="56px" className="object-cover" /> : <StoreIcon size={22} className="text-foreground-muted" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-lg font-bold text-foreground">{s.storeName}</h1>
                {s.verified && <BadgeCheck color="#ff681f" strokeWidth={3} size={18} aria-label="Verified seller" />}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-foreground-muted">
                {s.ratingCount > 0 ? (
                  <>
                    <Stars rating={s.ratingAvg} size={12} />
                    {s.ratingAvg.toFixed(1)} ({s.ratingCount} {s.ratingCount === 1 ? "review" : "reviews"})
                  </>
                ) : (
                  "No reviews yet"
                )}
                {s.isOnline && <span className="text-green-600">· Online</span>}
              </p>
            </div>
          </div>
          {s.trusted && (
            <span>
              <TrustedBadge size="md" />
            </span>
          )}
          {s.bio && <p className="text-sm text-foreground">{s.bio}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
            {s.pickupArea && (
              <span className="flex items-center gap-1">
                <MapPin size={12} aria-hidden />
                Pick up near {s.pickupArea}
              </span>
            )}
            <span>On CampusMart since {joined.format(new Date(s.joinedAt))}</span>
          </div>
        </section>

        <div role="tablist" aria-label="Store" className="mx-4 flex gap-2">
          {(
            [
              ["items", `Items (${s.listingCount})`],
              ["reviews", `Reviews (${s.ratingCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === value ? "bg-main text-white" : "bg-surface-muted text-foreground-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "items" ? (
          <div className="px-4">
            {listings.isPending ? (
              <div className="grid grid-cols-2 gap-4">
                <ProductsCardSkeleton />
                <ProductsCardSkeleton />
              </div>
            ) : listings.isError ? (
              <p className="text-sm text-foreground-muted">
                Couldn&apos;t load the items.{" "}
                <button type="button" onClick={() => listings.refetch()} className="font-semibold text-main">
                  Try again
                </button>
              </p>
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-sm text-foreground-muted">Nothing on sale right now.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {items.map((item) => (
                  <ProductsCard key={item.id} item={toCardItem(item)} />
                ))}
              </div>
            )}
            {listings.hasNextPage && (
              <button
                type="button"
                onClick={() => listings.fetchNextPage()}
                disabled={listings.isFetchingNextPage}
                className="mt-4 w-full py-2 text-sm font-semibold text-main disabled:opacity-50"
              >
                {listings.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        ) : (
          <div className="px-5">
            {s.ratingCount === 0 ? (
              <p className="py-6 text-center text-sm text-foreground-muted">No reviews yet. Buyers can review once they receive their order.</p>
            ) : reviews.isError ? (
              <p className="text-sm text-foreground-muted">
                Couldn&apos;t load the reviews.{" "}
                <button type="button" onClick={() => reviews.refetch()} className="font-semibold text-main">
                  Try again
                </button>
              </p>
            ) : !reviews.data ? (
              <div className="h-24 animate-pulse rounded-lg bg-surface-muted" aria-label="Loading" />
            ) : (
              <ReviewList
                reviews={reviews.data.pages.flatMap((p) => p.items)}
                showListing
                hasMore={reviews.hasNextPage}
                loadingMore={reviews.isFetchingNextPage}
                onMore={() => reviews.fetchNextPage()}
              />
            )}
          </div>
        )}
      </main>
      <Nav />
    </>
  );
}
