"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ImageOff, Package } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { useBuyerOrders } from "@/lib/api/hooks/useBuyerOrders";
import { FULFILLMENT_STATUS_LABELS, formatNaira } from "@/lib/labels";
import OrderStatusBadge from "./OrderStatusBadge";

const placedOn = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

// Guide 4.3.6: the buyer's orders, newest first
export default function OrdersPage() {
  const query = useBuyerOrders();
  const orders = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <main className="flex flex-col gap-4 pb-28 pt-8">
      <div className="flex flex-col gap-2">
        <div className="px-5">
          <PageHeader title="My Orders" />
        </div>
        <div className="w-full h-0.5 rounded-full bg-neutral-200" />
      </div>

      <div className="flex flex-col gap-3 px-5">
        {query.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your orders">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-muted" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="font-medium">We couldn&apos;t load your orders</p>
            <button type="button" onClick={() => query.refetch()} className="text-sm font-semibold text-main">
              Try again
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-main-subtle">
              <Package size={24} className="text-main" />
            </div>
            <p className="font-medium">No orders yet</p>
            <p className="text-sm text-foreground-muted">When you check out, your orders show up here.</p>
            <Link href="/categories" className="text-sm font-semibold text-main">
              Start shopping
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-3" aria-label="Orders">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="flex flex-col gap-3 rounded-2xl border border-border-default bg-card p-4 transition hover:border-main/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{formatNaira(order.totalKobo)}</p>
                        <p className="text-xs text-foreground-muted">
                          {placedOn.format(new Date(order.createdAt))} · {order.pickupStation.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <OrderStatusBadge status={order.status} />
                        <ChevronRight size={16} className="text-foreground-muted" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {order.sellerOrders.map((so) => (
                        <div key={so.id} className="flex items-center gap-3">
                          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface-muted flex items-center justify-center text-foreground-muted">
                            {so.imageUrl ? <Image src={so.imageUrl} alt="" fill sizes="40px" className="object-cover" /> : <ImageOff size={14} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{so.seller.storeName}</p>
                            <p className="text-xs text-foreground-muted">
                              {so.itemCount} item{so.itemCount === 1 ? "" : "s"}
                              {order.status === "PAID" && ` · ${FULFILLMENT_STATUS_LABELS[so.fulfillmentStatus]}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {query.hasNextPage && (
              <button
                type="button"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
                className="self-center rounded-full border border-border-default px-5 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
