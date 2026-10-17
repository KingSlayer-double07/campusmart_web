"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ClipboardList } from "lucide-react";
import { useAuthStore } from "@/app/store/useAuthStore";
import OrderCard from "@/app/sellers/components/OrderCard";
import type { SellerOrderTab } from "@/lib/api/dispatch";
import { useSellerOrderCounts, useSellerOrders } from "@/lib/api/hooks/useSellerOrders";

const TABS: { id: SellerOrderTab; label: string; empty: string }[] = [
  { id: "TO_PREPARE", label: "To prepare", empty: "Paid orders waiting for you or a rider show here." },
  { id: "ON_THE_WAY", label: "On the way", empty: "Orders a rider is carrying show here." },
  { id: "DONE", label: "Handed over", empty: "Orders that reached the buyer show here." },
  { id: "PROBLEMS", label: "Problems", empty: "Orders a buyer reported a problem with show here." },
  { id: "CANCELLED", label: "Cancelled", empty: "Cancelled and refunded orders show here." },
];

// Guide 6.6, rebuilt for delivery (Phase 6): the seller's orders by what happens next
export default function OrdersPage() {
  const { user } = useAuthStore();
  const sellerName = user?.firstName || user?.email?.split("@")[0] || "Seller";
  const [tab, setTab] = useState<SellerOrderTab>("TO_PREPARE");
  const orders = useSellerOrders(tab);
  const counts = useSellerOrderCounts();
  const rows = orders.data?.pages.flatMap((p) => p.items) ?? [];
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <main className="flex w-full max-w-md flex-col pb-32">
      <div className="flex flex-col gap-4 bg-card px-4 pb-4 pt-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold">Hi {sellerName} 👋</p>
            <p className="mt-0.5 text-sm text-foreground-muted">Track all your orders easily</p>
          </div>
          <Link
            href="/sellers/notifications"
            aria-label="Notifications"
            className="flex size-9 items-center justify-center rounded-full border border-border-default transition hover:bg-surface-muted"
          >
            <Bell size={18} />
          </Link>
        </div>
        <div role="tablist" aria-label="Orders" className="no-scrollbar flex gap-2 overflow-x-auto">
          {TABS.map((t) => {
            const n = counts.data?.[t.id];
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  tab === t.id ? "bg-seller-main text-white" : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {t.label}
                {n ? ` (${n})` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-3 px-4 pt-4">
        {orders.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading orders">
            <div className="h-32 animate-pulse rounded-lg bg-card" />
            <div className="h-32 animate-pulse rounded-lg bg-card" />
          </div>
        ) : orders.isError ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="text-sm font-medium">We couldn&apos;t load your orders</p>
            <button type="button" onClick={() => orders.refetch()} className="text-sm font-semibold text-seller-main">
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center text-foreground-muted">
            <ClipboardList size={28} className="text-seller-main" />
            <p className="text-sm font-medium text-foreground">Nothing here</p>
            <p className="text-xs">{current.empty}</p>
          </div>
        ) : (
          <>
            {rows.map((order) => (
              <Link key={order.id} href={`/sellers/orders/${order.id}`}>
                <OrderCard order={order} />
              </Link>
            ))}
            {orders.hasNextPage && (
              <button
                type="button"
                onClick={() => orders.fetchNextPage()}
                disabled={orders.isFetchingNextPage}
                className="self-center text-sm font-semibold text-seller-main disabled:opacity-50"
              >
                {orders.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
