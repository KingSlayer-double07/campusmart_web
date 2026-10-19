"use client";

import { CircleMinus, CirclePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import type { Listing, ListingVariant } from "@/lib/api/listings";
import { quantityInCart, useCart, useCartActions } from "@/lib/api/hooks/useCart";
import BottomFloatingBar, { BottomFloatingBarContainer } from "./BottomFloatingBar";

// The product page's bottom bar: choose an option, add to cart, then adjust the quantity up to
// what's in stock. Works on the server cart when signed in, else the guest cart (guide 4.3.1).
// The seller sees a link to edit their own listing instead.
export default function AddCartNav({
  listing,
  variant,
  onError,
}: {
  listing: Listing;
  variant: ListingVariant | null;
  /** Why the cart refused, e.g. "Only 1 left" */
  onError?: (message: string) => void;
}) {
  const cart = useCart();
  const actions = useCartActions();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);

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
  const stock = variant ? variant.stock : listing.stock;
  const variantId = variant?.id ?? null;
  const quantity = quantityInCart(cart, listing.id, variantId);
  const soldOut = !needsOption && stock <= 0;
  const line = { listingId: listing.id, variantId, variantLabel: variant?.label ?? null };

  const run = async (change: () => Promise<void>) => {
    setBusy(true);
    try {
      await change();
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : "Couldn't update your cart. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomFloatingBar>
      <BottomFloatingBarContainer>
        {quantity === 0 ? (
          <button
            type="button"
            disabled={needsOption || soldOut || busy}
            className="w-full h-10 rounded-full bg-main disabled:opacity-60 border border-border-default transition-all duration-300"
            onClick={() => run(() => actions.add(listing, variant, quantity))}
          >
            <p className="font-medium text-sm text-white">
              {needsOption ? "Choose an option" : soldOut ? "Out of stock" : busy ? "Adding…" : "Add to Cart"}
            </p>
          </button>
        ) : (
          <div className="w-full flex gap-4">
            <div className="w-28 px-2 h-10 rounded-full border bg-card border-main flex justify-between items-center">
              <button
                type="button"
                aria-label="One fewer"
                disabled={busy}
                className="disabled:opacity-40"
                onClick={() => run(() => actions.setQuantity(line, quantity - 1))}
              >
                <CircleMinus color="#ff681f" size={18} />
              </button>
              <p className="font-medium text-main">{quantity}</p>
              <button
                type="button"
                aria-label="One more"
                disabled={busy || quantity >= stock}
                className="disabled:opacity-40"
                onClick={() => run(() => actions.setQuantity(line, quantity + 1))}
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
