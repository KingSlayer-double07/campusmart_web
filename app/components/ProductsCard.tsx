"use client";

import { Heart, HeartPlus, ImageOff, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ListingCard } from "@/lib/api/listings";
import { CATEGORY_LABELS, formatPriceRange } from "@/lib/labels";
import { useFavouritesStore, type FavouriteItem } from "../store/useFavouritesStore";

// What a product card shows. Built from a listing, or from a saved favourite.
export type CardItem = FavouriteItem;

export function toCardItem(listing: ListingCard): CardItem {
  return {
    id: listing.id,
    title: listing.title,
    minPriceKobo: listing.minPriceKobo,
    maxPriceKobo: listing.maxPriceKobo,
    imageUrl: listing.imageUrl,
    categoryLabel: CATEGORY_LABELS[listing.category],
  };
}

export default function ProductsCard({ item }: { item: CardItem }) {
  const router = useRouter();

  // Precise selectors avoid re-rendering every card when one heart changes
  const isHearted = useFavouritesStore((state) => state.favourites.some((f) => f.id === item.id));
  const toggleFavourite = useFavouritesStore((state) => state.toggleFavourite);

  const open = () => router.push(`/productItem/${item.id}`);

  const handleHeart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavourite(item);
  };

  return (
    <div
      onClick={open}
      className="flex justify-center w-full cursor-pointer transition-all duration-150 active:scale-95 active:opacity-80"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && open()}
    >
      <main className="w-full flex flex-col gap-2">
        <div className="relative overflow-hidden w-full h-28 rounded-lg bg-surface-muted">
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt={item.title} fill sizes="(max-width: 640px) 50vw, 224px" className="object-cover w-full h-full" />
          ) : (
            <div className="flex h-full items-center justify-center text-foreground-muted">
              <ImageOff size={22} />
            </div>
          )}

          <button
            type="button"
            onClick={handleHeart}
            aria-label={isHearted ? `Remove ${item.title} from favourites` : `Add ${item.title} to favourites`}
            className="absolute -bottom-1 -right-1 bg-card size-8 rounded-full text-main flex justify-center items-center shadow-lg border border-border-default transition-all duration-150 active:scale-90"
          >
            {isHearted ? <Heart size={18} fill="#ff681f" stroke="#ff681f" color="white" /> : <HeartPlus size={18} />}
          </button>
        </div>

        <div className="flex flex-col gap-0.5 w-full">
          <p className="text-xs font-dmSans tracking-tight text-foreground-muted">{item.categoryLabel}</p>
          <p className="font-dmSans tracking-tight text-sm font-normal leading-3.5 line-clamp-1">{item.title}</p>
          <div className="flex-1 flex justify-between items-center">
            <p className="font-dmSans tracking-tight text-main font-semibold">
              {formatPriceRange(item.minPriceKobo, item.maxPriceKobo)}
            </p>
            <ShoppingCart size={15} />
          </div>
        </div>
      </main>
    </div>
  );
}

// Same footprint as a card, for loading states
export function ProductsCardSkeleton() {
  return (
    <div className="w-full flex flex-col gap-2 animate-pulse" aria-hidden="true">
      <div className="w-full h-28 rounded-lg bg-surface-muted" />
      <div className="h-3 w-1/3 rounded bg-surface-muted" />
      <div className="h-3 w-3/4 rounded bg-surface-muted" />
      <div className="h-4 w-1/2 rounded bg-surface-muted" />
    </div>
  );
}
