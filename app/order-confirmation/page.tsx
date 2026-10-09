"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clock, Info, Loader2, MapPin, XCircle } from "lucide-react";
import ListingsCarousel from "../components/ListingsCarousel";
import PageHeader from "../components/PageHeader";
import ProductCarousel from "../components/ProductCarousel";
import SectionHeader from "../components/SectionHeader";
import { useFavouritesStore } from "../store/useFavouritesStore";
import type { Order } from "@/lib/api/checkout";
import { useOrder } from "@/lib/api/hooks/useBuyerOrders";
import { formatNaira } from "@/lib/labels";

const POLL_FOR_MS = 60_000;
const time = new Intl.DateTimeFormat("en-NG", { timeStyle: "short" });

function Paid({ order }: { order: Order }) {
  return (
    <>
      <div className="size-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-200">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="size-8" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-bold text-xl tracking-tight">Payment received</h1>
        <p className="text-sm text-foreground-muted">You&apos;ll be told when it&apos;s ready for pickup.</p>
      </div>
      <div className="w-full flex flex-col gap-2 rounded-2xl border border-border-default p-4">
        {order.sellerOrders.map((so) => (
          <div key={so.id} className="flex justify-between gap-3 text-sm">
            <span className="text-foreground-muted truncate">{so.seller.storeName}</span>
            <span className="font-mono font-semibold">{so.code}</span>
          </div>
        ))}
        <div className="mt-1 flex items-start gap-2 border-t border-border-default pt-3 text-sm">
          <MapPin size={16} className="text-main shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{order.pickupStation.name}</p>
            <p className="text-xs text-foreground-muted">{order.pickupStation.address}</p>
          </div>
        </div>
      </div>
      <div className="w-full flex gap-2 items-center rounded-full border border-orange-200 bg-orange-50 px-4 py-2.5">
        <Info size={15} color="#ff681f" className="shrink-0" />
        <p className="text-xs text-foreground/70 leading-relaxed">
          You have <span className="text-main font-semibold">48 hours</span> after collecting to report a problem
        </p>
      </div>
    </>
  );
}

function ConfirmationBody() {
  const params = useSearchParams();
  const orderId = params.get("orderId") ?? undefined;
  // Checkout sends buyers here without a payment page while online payment is switched off
  const paymentUnavailable = params.get("payment") === "unavailable";
  const [pollingSince, setPollingSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const polling = !paymentUnavailable && now - pollingSince < POLL_FOR_MS;
  const query = useOrder(orderId, { poll: polling });
  const order = query.data;
  const waiting = order?.status === "PENDING_PAYMENT";

  // Guide 4.3.5: poll every 3 seconds for up to 60 while the payment is confirmed
  useEffect(() => {
    if (!polling || !waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [polling, waiting]);

  if (!orderId) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-medium">There&apos;s no order to show here</p>
        <Link href="/orders" className="text-sm font-semibold text-main">
          See your orders
        </Link>
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div className="flex flex-col items-center gap-3 py-8" aria-busy="true">
        <Loader2 className="animate-spin text-main" size={28} />
        <p className="text-sm text-foreground-muted">Loading your order…</p>
      </div>
    );
  }
  if (query.isError || !order) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-medium">We couldn&apos;t load your order</p>
        <button type="button" onClick={() => query.refetch()} className="text-sm font-semibold text-main">
          Try again
        </button>
      </div>
    );
  }
  if (order.status === "PAID") return <Paid order={order} />;
  if (order.status === "EXPIRED" || order.status === "CANCELLED") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <XCircle size={40} className="text-red-500" />
        <h1 className="font-bold text-xl tracking-tight">{order.status === "EXPIRED" ? "This order wasn't paid in time" : "This order was cancelled"}</h1>
        <p className="text-sm text-foreground-muted">Its items went back on sale, and you haven&apos;t been charged.</p>
        <Link href="/cart" className="text-sm font-semibold text-main">
          Back to your cart
        </Link>
      </div>
    );
  }
  if (polling && !paymentUnavailable) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" aria-busy="true">
        <Loader2 className="animate-spin text-main" size={28} />
        <h1 className="font-semibold text-lg">Confirming your payment…</h1>
        <p className="text-sm text-foreground-muted">This usually takes a few seconds. Please keep this page open.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Clock size={40} className="text-main" />
      <h1 className="font-bold text-xl tracking-tight">{paymentUnavailable ? "Order placed, waiting for payment" : "We haven't received your payment yet"}</h1>
      <p className="text-sm text-foreground-muted">
        {paymentUnavailable
          ? "Online payment isn't switched on yet, so this order can't be paid. "
          : "If you've paid, this page will catch up once your bank confirms. "}
        Your items ({formatNaira(order.totalKobo)}) are held until {time.format(new Date(order.expiresAt))}, then go back on sale.
      </p>
      <div className="flex gap-4">
        {!paymentUnavailable && (
          <button
            type="button"
            className="text-sm font-semibold text-main"
            onClick={() => {
              setPollingSince(Date.now());
              setNow(Date.now());
            }}
          >
            Check again
          </button>
        )}
        <Link href={`/orders/${order.id}`} className="text-sm font-semibold text-main">
          View order
        </Link>
      </div>
    </div>
  );
}

// Guide 4.3.5: where Paystack returns the buyer after paying
export default function OrderConfirmationPage() {
  const { favourites } = useFavouritesStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <main className="pb-28 pt-8">
      <div className="flex flex-col gap-2 pb-6">
        <div className="px-5">
          <PageHeader title="Your order" />
        </div>
        <div className="w-full h-0.5 rounded-full bg-neutral-200" />
      </div>

      <div className="flex flex-col items-center gap-4 px-5 pb-8">
        <Suspense fallback={null}>
          <ConfirmationBody />
        </Suspense>
      </div>

      <div className="w-full h-0.5 rounded-full bg-neutral-200" />

      <section className="flex flex-col gap-3 pt-5 pb-2">
        <SectionHeader title="Continue Shopping" href="/categories?sort=newest" linkText="See all" />
        <ListingsCarousel filters={{ sort: "newest" }} />
      </section>

      <section className="flex flex-col gap-3 pt-3 pb-6">
        <SectionHeader title="Favourites" href="/favourites" linkText="See all" />
        <ProductCarousel items={favourites} emptyText="Tap the heart on a product to save it here." />
      </section>
    </main>
  );
}
