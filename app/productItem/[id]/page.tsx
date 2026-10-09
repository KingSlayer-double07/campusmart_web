"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, Heart, HeartPlus, ImageOff, Search, Share2, Star } from "lucide-react";
import AddCartNav from "@/app/components/addCartNav";
import PageHeader from "@/app/components/PageHeader";
import ProductsCard, { ProductsCardSkeleton, toCardItem } from "@/app/components/ProductsCard";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { useFavouritesStore } from "@/app/store/useFavouritesStore";
import type { Listing, ListingVariant } from "@/lib/api/listings";
import { ApiError } from "@/lib/api/client";
import { useListing, useRelatedListings } from "@/lib/api/hooks/useListings";
import { shareLink } from "@/lib/share";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  LISTING_STATUS_LABELS,
  formatNaira,
  formatPriceRange,
} from "@/lib/labels";

const iconButton =
  "size-8 bg-card rounded-full border border-border-default flex justify-center items-center shadow-lg hover:bg-surface-muted transition";

function Gallery({ listing }: { listing: Listing }) {
  const [index, setIndex] = useState(0);
  if (listing.images.length === 0) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center bg-surface-muted text-foreground-muted">
        <ImageOff size={32} />
      </div>
    );
  }
  return (
    <div className="relative w-full h-[50vh]">
      <div
        className="flex h-full overflow-x-auto snap-x snap-mandatory no-scrollbar"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {listing.images.map((image, i) => (
          <div key={image.id} className="relative h-full w-full shrink-0 snap-center">
            <Image
              src={image.url}
              alt={`${listing.title}, photo ${i + 1}`}
              fill
              priority={i === 0}
              sizes="(max-width: 448px) 100vw, 448px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {listing.images.length > 1 && (
        <span className="absolute bottom-3 right-4 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white">
          {index + 1}/{listing.images.length}
        </span>
      )}
    </div>
  );
}

function VariantPicker({
  variants,
  selected,
  onSelect,
}: {
  variants: ListingVariant[];
  selected: ListingVariant | null;
  onSelect: (variant: ListingVariant | null) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm">Choose an option</p>
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Options">
        {variants.map((variant) => {
          const isActive = selected?.id === variant.id;
          const soldOut = variant.stock <= 0;
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={soldOut}
              onClick={() => onSelect(isActive ? null : variant)}
              className={`min-w-10 h-9 px-3 rounded-md border shadow-md/5 text-xs font-medium tracking-tight transition-all duration-300 disabled:opacity-40 disabled:line-through ${
                isActive ? "bg-blue-950 border-main text-white" : "bg-card border-border-default text-foreground"
              }`}
            >
              {variant.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProductSkeleton() {
  return (
    <main className="flex flex-col gap-4 pb-28 animate-pulse" aria-busy="true" aria-label="Loading product">
      <div className="w-full h-[50vh] bg-surface-muted" />
      <div className="flex flex-col gap-3 px-6">
        <div className="h-5 w-2/3 rounded bg-surface-muted" />
        <div className="h-3 w-full rounded bg-surface-muted" />
        <div className="h-6 w-1/3 rounded bg-surface-muted" />
      </div>
    </main>
  );
}

export default function ProductItem() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: listing, isPending, isError, error, refetch } = useListing(id);
  const related = useRelatedListings(listing ? id : undefined);
  const [variant, setVariant] = useState<ListingVariant | null>(null);
  const isHearted = useFavouritesStore((s) => s.favourites.some((f) => f.id === id));
  const toggleFavourite = useFavouritesStore((s) => s.toggleFavourite);

  if (isPending) return <ProductSkeleton />;

  if (isError || !listing) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <main className="flex flex-col gap-6 px-6 pt-8 pb-28">
        <PageHeader title="Product" />
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium text-foreground">
            {missing ? "This item isn't available" : "We couldn't load this item"}
          </p>
          <p className="text-sm text-foreground-muted">
            {missing ? "It may have sold out or been taken down." : "Check your connection and try again."}
          </p>
          {missing ? (
            <Link href="/categories" className="text-sm font-semibold text-main">
              Browse other items
            </Link>
          ) : (
            <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-main">
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  const share = async () => {
    const result = await shareLink(listing.title, window.location.href).catch(() => "failed" as const);
    if (result === "copied") toast.success("Link copied", "Paste it anywhere to share this item");
    if (result === "failed") toast.error("Couldn't share", "Copy the link from your browser instead");
  };

  const price = variant
    ? formatNaira(variant.priceKobo ?? listing.priceKobo)
    : formatPriceRange(listing.minPriceKobo, listing.maxPriceKobo);
  const stock = variant ? variant.stock : listing.stock;

  const rightItems = (
    <div className="flex gap-3">
      <Link href="/categories" aria-label="Search" className={iconButton}>
        <Search size={16} />
      </Link>
      <button type="button" onClick={share} aria-label="Share" className={iconButton}>
        <Share2 size={16} />
      </button>
      <button
        type="button"
        aria-label={isHearted ? "Remove from favourites" : "Add to favourites"}
        onClick={() => toggleFavourite(toCardItem(listing))}
        className={iconButton}
      >
        {isHearted ? <Heart size={16} fill="#ff681f" color="#ff681f" /> : <HeartPlus size={16} />}
      </button>
    </div>
  );

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main className="flex flex-col gap-2 pb-28">
        <div className="fixed top-0 z-50 pt-8 px-6 pb-2 w-full max-w-md">
          <PageHeader rightItems={rightItems} />
        </div>

        <Gallery listing={listing} />

        <div className="flex flex-col gap-2 px-6 pt-6">
          {listing.isOwner && listing.status !== "ACTIVE" && (
            <p className="self-start rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-foreground-muted">
              {LISTING_STATUS_LABELS[listing.status]}: buyers can&apos;t see this yet
            </p>
          )}
          <p className="text-xs text-foreground-muted">
            {CATEGORY_LABELS[listing.category]} · {CONDITION_LABELS[listing.condition]}
          </p>
          <p className="text-lg font-semibold">{listing.title}</p>
          {listing.description && (
            <p className="text-foreground/60 text-sm leading-5 whitespace-pre-line">{listing.description}</p>
          )}
          <div className="flex gap-2 text-sm text-foreground-muted">
            <div className="flex gap-0.5 items-center">
              <Star fill="#ff681f" color="#ff681f" size={14} />
              <p>{listing.ratingCount > 0 ? listing.ratingAvg.toFixed(1) : "New"}</p>
            </div>
            <div className="h-5 rounded w-0.5 bg-neutral-200" />
            <p>
              {listing.ratingCount} rating{listing.ratingCount === 1 ? "" : "s"}
            </p>
          </div>
          <p className="text-main text-xl font-bold">{price}</p>
          {stock > 0 && stock <= 3 && <p className="text-xs font-semibold text-main">Only {stock} left</p>}

          {/* Options: hidden when the listing has none */}
          {listing.variants.length > 0 && (
            <VariantPicker variants={listing.variants} selected={variant} onSelect={setVariant} />
          )}

          {/* Reviews (the list arrives with Phase 8) */}
          <div className="w-full flex justify-between mt-4">
            <p className="text-sm font-medium">Reviews</p>
          </div>
          <p className="text-sm text-foreground-muted">
            {listing.ratingCount === 0
              ? "No reviews yet. Buyers can review after they collect."
              : `Rated ${listing.ratingAvg.toFixed(1)} out of 5 by ${listing.ratingCount} buyer${listing.ratingCount === 1 ? "" : "s"}.`}
          </p>

          <div className="w-full flex justify-between mt-4">
            <p className="text-sm font-medium">Seller Info</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-surface-muted">
              {listing.seller.logoUrl && (
                <Image src={listing.seller.logoUrl} alt="" fill sizes="36px" className="object-cover" />
              )}
            </div>
            <div>
              <div className="flex gap-1.5 items-center">
                <p className="text-sm font-medium">{listing.seller.displayName}</p>
                {listing.seller.verified && <BadgeCheck color="#ff681f" strokeWidth={3} size={16} aria-label="Verified seller" />}
              </div>
              <div className="flex gap-1.5 text-xs text-foreground/70 items-center">
                <p>
                  {listing.seller.ratingCount > 0
                    ? `★ ${listing.seller.ratingAvg.toFixed(1)} (${listing.seller.ratingCount})`
                    : "New seller"}
                </p>
                {listing.seller.isOnline && (
                  <>
                    <div className="h-3.5 rounded w-0.5 bg-neutral-200" />
                    <p className="text-green-600">Online</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="w-full flex justify-between mt-4">
            <p className="text-sm font-medium">More like this</p>
          </div>
          {related.isPending ? (
            <div className="grid grid-cols-2 gap-4">
              <ProductsCardSkeleton />
              <ProductsCardSkeleton />
            </div>
          ) : related.data && related.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {related.data.map((item) => (
                <ProductsCard key={item.id} item={toCardItem(item)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">
              {related.isError ? "We couldn't load similar items." : "Nothing similar yet."}
            </p>
          )}
        </div>
      </main>

      <AddCartNav listing={listing} variant={variant} />
    </>
  );
}
