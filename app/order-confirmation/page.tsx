"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import PageHeader from "../components/PageHeader";
import SectionHeader from "../components/SectionHeader";
import ProductCarousel from "../components/ProductCarousel";
import ListingsCarousel from "../components/ListingsCarousel";
import { useFavouritesStore } from "../store/useFavouritesStore";

// Generate a random order number once per session
function generateOrderNo() {
  return Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join("");
}

export default function OrderConfirmationPage() {
  const [mounted, setMounted] = useState(false);
  const [orderNo] = useState(generateOrderNo);
  const { favourites } = useFavouritesStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <main className="pb-28 pt-8">
      {/* Page header */}
      <div className="flex flex-col gap-2 pb-6">
        <div className="px-5">
          <PageHeader title="Order Completed" />
        </div>
        <div className="w-full h-0.5 rounded-full bg-neutral-200" />
      </div>

      {/* ── Success hero ── */}
      <div className="flex flex-col items-center gap-3 px-5 pb-8">
        {/* Green circle checkmark */}
        <div className="size-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-200">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-8"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-bold text-xl tracking-tight">
            Order placed successfully!
          </h1>
          <p className="text-xs text-foreground-muted">
            Order no: {orderNo}
          </p>
        </div>

        <p className="text-sm text-foreground-muted text-center">
          You will be notified when your package is ready for pick up
        </p>

        {/* Return policy notice */}
        <div className="w-full flex gap-2 items-center rounded-full border border-orange-200 bg-orange-50 px-4 py-2.5 mt-1">
          <Info size={15} color="#ff681f" className="shrink-0" />
          <p className="text-xs text-foreground/70 leading-relaxed">
            Items can only be returned within{" "}
            <span className="text-main font-semibold">24 hours</span>{" "}
            of picking up
          </p>
        </div>
      </div>

      <div className="w-full h-0.5 rounded-full bg-neutral-200" />

      {/* ── Continue Shopping ── */}
      <section className="flex flex-col gap-3 pt-5 pb-2">
        <SectionHeader title="Continue Shopping" href="/" linkText="See all" />
        <ListingsCarousel filters={{ sort: "newest" }} />
      </section>

      {/* ── Favourites ── */}
      <section className="flex flex-col gap-3 pt-3 pb-6">
        <SectionHeader title="Favourites" href="/favourites" linkText="See all" />
        <ProductCarousel items={favourites} emptyText="Tap the heart on a product to save it here." />
      </section>
    </main>
  );
}
