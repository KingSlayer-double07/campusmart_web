"use client";

import { CircleMinus, CirclePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Listing, ListingVariant } from "@/lib/api/listings";
import { CATEGORY_LABELS } from "@/lib/labels";
import { useCartStore } from "@/app/store/useCartStore";
import BottomFloatingBar, { BottomFloatingBarContainer } from "./BottomFloatingBar";

// The product page's bottom bar: choose an option, add to cart, then adjust the quantity up to
// what's in stock. The seller sees a link to edit their own listing instead.
export default function AddCartNav({ listing, variant }: { listing: Listing; variant: ListingVariant | null }) {
  const { addToCart, increaseQty, decreaseQty, getItemById } = useCartStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  if (listing.isOwner) {
    return (
      <BottomFloatingBar>
        <BottomFloatingBarContainer>
          <Link
            href={`/sellers/products/${listing.id}/edit`}
            className="w-full h-10 rounded-full bg-seller-main flex items-center justify-center text-sm font-medium text-white"
          >
            This is your listing · Edit
          </Link>
        </BottomFloatingBarContainer>
      </BottomFloatingBar>
    );
  }

  const needsOption = listing.hasVariants && !variant;
  const size = variant?.label ?? "default";
  const stock = variant ? variant.stock : listing.stock;
  const cartItem = getItemById(listing.id, size);
  const quantity = cartItem?.quantity ?? 0;
  const soldOut = !needsOption && stock <= 0;

  return (
    <BottomFloatingBar>
      <BottomFloatingBarContainer>
        {!cartItem ? (
          <button
            type="button"
            disabled={needsOption || soldOut}
            className="w-full h-10 rounded-full bg-main disabled:opacity-60 border border-border-default transition-all duration-300"
            onClick={() =>
              addToCart({
                id: listing.id,
                variantId: variant?.id ?? null,
                name: listing.title,
                priceKobo: variant?.priceKobo ?? listing.priceKobo,
                image: listing.imageUrl,
                quantity: 1,
                category: CATEGORY_LABELS[listing.category],
                size,
                stockCount: stock,
              })
            }
          >
            <p className="font-medium text-sm text-white">
              {needsOption ? "Choose an option" : soldOut ? "Out of stock" : "Add to Cart"}
            </p>
          </button>
        ) : (
          <div className="w-full flex gap-4">
            <div className="w-28 px-2 h-10 rounded-full border bg-card border-main flex justify-between items-center">
              <button type="button" aria-label="One fewer" onClick={() => decreaseQty(listing.id, size)}>
                <CircleMinus color="#ff681f" size={18} />
              </button>
              <p className="font-medium text-main">{quantity}</p>
              <button
                type="button"
                aria-label="One more"
                disabled={quantity >= stock}
                className="disabled:opacity-40"
                onClick={() => increaseQty(listing.id, size)}
              >
                <CirclePlus color="#ff681f" size={18} />
              </button>
            </div>

            <button
              type="button"
              className="w-full h-10 rounded-full border bg-main border-border-default"
              onClick={() => router.push("/cart")}
            >
              <p className="font-medium text-sm text-white">View cart</p>
            </button>
          </div>
        )}
      </BottomFloatingBarContainer>
    </BottomFloatingBar>
  );
}
