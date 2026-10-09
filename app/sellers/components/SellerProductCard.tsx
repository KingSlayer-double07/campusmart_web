"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageOff, MoreVertical } from "lucide-react";
import type { ListingCard, OwnerListingStatus } from "@/lib/api/listings";
import { CATEGORY_LABELS, LISTING_STATUS_LABELS, formatPriceRange, type ListingStatus } from "@/lib/labels";

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ListingStatus, string> = {
  ACTIVE: "border-green-500 text-green-600",
  SOLDOUT: "border-red-400 text-red-500",
  DRAFT: "border-neutral-400 text-foreground-muted",
  ARCHIVED: "border-neutral-300 text-foreground-muted",
  FLAGGED: "border-amber-400 text-amber-600",
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status]} whitespace-nowrap`}>
      {LISTING_STATUS_LABELS[status]}
    </span>
  );
}

// Guide 3.2.7: the SKU is the last 6 characters of the ID
export const skuOf = (id: string) => id.replace(/-/g, "").slice(-6).toUpperCase();

export interface ProductCardActions {
  onStatus: (listing: ListingCard, status: OwnerListingStatus) => void;
  onAdjustStock: (listing: ListingCard) => void;
  onDelete: (listing: ListingCard) => void;
}

// Which status moves make sense from here. A listing under review can't change status, and only
// an admin-verified seller can publish.
export function statusActions(
  status: ListingStatus,
  canPublish = true,
): { label: string; status: OwnerListingStatus }[] {
  if (status === "FLAGGED") return [];
  const actions: { label: string; status: OwnerListingStatus }[] = [];
  if (canPublish && (status === "DRAFT" || status === "ARCHIVED")) actions.push({ label: "Publish", status: "ACTIVE" });
  if (status !== "DRAFT") actions.push({ label: "Move to draft", status: "DRAFT" });
  if (status !== "ARCHIVED") actions.push({ label: "Archive", status: "ARCHIVED" });
  return actions;
}

// ─── Product Card ─────────────────────────────────────────────────────────────

export default function SellerProductCard({
  product,
  actions,
  canPublish = true,
}: {
  product: ListingCard;
  actions: ProductCardActions;
  canPublish?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const run = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    action();
  };

  const menu = [
    ...statusActions(product.status, canPublish).map((a) => ({ label: a.label, action: () => actions.onStatus(product, a.status) })),
    { label: "Adjust stock", action: () => actions.onAdjustStock(product) },
  ];

  return (
    <div className="bg-card rounded-lg px-3 py-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-surface-muted flex items-center justify-center text-foreground-muted">
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.title} fill sizes="56px" className="object-cover" />
          ) : (
            <ImageOff size={18} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{product.title}</p>
          <p className="text-[11px] text-foreground-muted mt-0.5">SKU {skuOf(product.id)}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <StatusBadge status={product.status} />
          <div className="relative">
            <button
              type="button"
              aria-label={`Actions for ${product.title}`}
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              className="p-1 rounded-full hover:bg-surface-muted transition-all duration-150 active:scale-90 active:opacity-80"
            >
              <MoreVertical size={20} />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                />
                <div role="menu" className="absolute right-0 top-7 z-20 bg-card rounded-xl shadow-xl border border-border-default py-1 w-44 overflow-hidden">
                  {menu.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={run(item.action)}
                      className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-surface-muted"
                    >
                      {item.label}
                    </button>
                  ))}
                  <Link
                    role="menuitem"
                    href={`/sellers/products/${product.id}/edit`}
                    onClick={(e) => e.stopPropagation()}
                    className="block w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-surface-muted"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={run(() => actions.onDelete(product))}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-surface-muted"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border-default">
        <div>
          <p className="text-[10px] text-foreground-muted">Category</p>
          <p className="text-xs font-semibold text-foreground mt-0.5">{CATEGORY_LABELS[product.category]}</p>
        </div>
        <div>
          <p className="text-[10px] text-foreground-muted">Price</p>
          <p className="text-xs font-semibold text-foreground mt-0.5">{formatPriceRange(product.minPriceKobo, product.maxPriceKobo)}</p>
        </div>
        <div>
          <p className="text-[10px] text-foreground-muted">In stock</p>
          <p className="text-xs font-semibold text-foreground mt-0.5">{product.stock}</p>
        </div>
      </div>
    </div>
  );
}
