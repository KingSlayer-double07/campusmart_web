"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { useSellerListings } from "@/lib/api/hooks/useListings";
import { LISTING_STATUS_LABELS, type ListingStatus } from "@/lib/labels";
import SellerProductCard from "@/app/sellers/components/SellerProductCard";
import { useListingActions } from "@/app/sellers/components/useListingActions";

// ─── Filter tabs (guide 3.2.7) ────────────────────────────────────────────────

type FilterTab = "ALL" | Exclude<ListingStatus, "FLAGGED">;

const TABS: FilterTab[] = ["ALL", "ACTIVE", "SOLDOUT", "DRAFT", "ARCHIVED"];
const tabLabel = (tab: FilterTab) => (tab === "ALL" ? "All" : LISTING_STATUS_LABELS[tab]);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");
  const query = useSellerListings(activeTab === "ALL" ? undefined : activeTab);
  const products = query.data?.pages.flatMap((p) => p.items) ?? [];
  const { actions, dialogs } = useListingActions();

  return (
    <main className="flex flex-col max-w-md w-full pb-32">
      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-10 bg-card pt-10 pb-3 px-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tighter">Products</h1>
          <Link
            href="/sellers/addProduct"
            className="flex items-center gap-1 rounded-full bg-seller-main px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus size={16} />
            Add product
          </Link>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Status">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                activeTab === tab
                  ? "bg-seller-main text-white border-seller-main"
                  : "bg-card text-foreground-muted border-border-default"
              }`}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Product list ── */}
      <div className="flex flex-col gap-3 px-4 pt-1 mt-2">
        {query.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading products">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 rounded-lg bg-card animate-pulse" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-foreground-muted">We couldn&apos;t load your products.</p>
            <button type="button" onClick={() => query.refetch()} className="text-sm font-semibold text-seller-main">
              Try again
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-card">
              <Package size={22} className="text-seller-main" />
            </div>
            <p className="text-sm text-foreground-muted">
              {activeTab === "ALL" ? "You haven't listed anything yet." : `Nothing in "${tabLabel(activeTab)}".`}
            </p>
            {activeTab === "ALL" && (
              <Link href="/sellers/addProduct" className="text-sm font-semibold text-seller-main">
                List your first product
              </Link>
            )}
          </div>
        ) : (
          <>
            {products.map((product) => (
              <Link key={product.id} href={`/sellers/products/${product.id}`}>
                <SellerProductCard product={product} actions={actions} />
              </Link>
            ))}
            {query.hasNextPage && (
              <button
                type="button"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="self-center rounded-full border border-border-default bg-card px-5 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>

      {dialogs}
    </main>
  );
}
