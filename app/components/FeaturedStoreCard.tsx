"use client";

import { ChevronRight, Star, Store as StoreIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { StoreCard } from "@/lib/api/stores";
import TrustedBadge from "./TrustedBadge";

// Guide 8.2: a store in the home page's Featured Store row and on /stores
export default function FeaturedStoreCard({ store, className = "min-w-60 w-60" }: { store: StoreCard; className?: string }) {
  return (
    <Link
      href={`/stores/${store.sellerId}`}
      aria-label={store.storeName}
      className={`${className} flex flex-col rounded-xl overflow-hidden border border-border-default`}
    >
      <div className="relative h-12 w-full bg-blue-800" />

      <div className="relative bg-card p-4 pt-8 flex flex-col">
        <div className="absolute -top-5 left-4 z-10 flex size-11 items-center justify-center overflow-hidden rounded-full border-3 border-white bg-neutral-200">
          {store.logoUrl ? (
            <Image src={store.logoUrl} alt="" fill sizes="44px" className="object-cover" />
          ) : (
            <StoreIcon size={18} className="text-foreground-muted" aria-hidden />
          )}
        </div>

        <div className="flex justify-between items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="truncate font-bold leading-tight text-foreground">{store.storeName}</h3>
            <p className="flex items-center gap-1 text-xs text-foreground-muted">
              {store.ratingCount > 0 ? (
                <>
                  <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden />
                  {store.ratingAvg.toFixed(1)} ({store.ratingCount})
                </>
              ) : (
                "New store"
              )}
              <span aria-hidden>·</span>
              {store.listingCount} {store.listingCount === 1 ? "item" : "items"}
            </p>
            {store.trusted && (
              <span>
                <TrustedBadge />
              </span>
            )}
          </div>
          <span className="shrink-0 rounded-full p-2 shadow-lg/15">
            <ChevronRight size={18} className="text-foreground" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
