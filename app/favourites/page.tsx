"use client";

import { AnimatePresence, motion } from "framer-motion";
import SwipeToDismiss from "../components/SwipeToDismiss";

import { Trash2 } from "lucide-react";
import { useFavouritesStore } from "../store/useFavouritesStore";
import Image from "next/image";
import PageHeader from "../components/PageHeader";
import { useEffect, useState } from "react";
import SectionHeader from "../components/SectionHeader";
import ListingsCarousel from "../components/ListingsCarousel";
import Nav from "../components/nav";
import { formatPriceRange } from "@/lib/labels";
import Link from "next/link";
import { Heart } from "lucide-react";

export default function Favourites() {
  const { favourites, removeFavourite } = useFavouritesStore();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <main className="pb-0 pt-8">
        {/* ── Page header ── */}
        <div className="flex flex-col gap-2 pb-4">
          <div className="px-5">
            <PageHeader title={`My Favourites (${favourites.length})`} />
          </div>
          <div className="w-full h-0.5 rounded-full bg-neutral-200" />
        </div>

        {/* ── Two-column on lg+ ── */}
        <div className="flex flex-col gap-8">

          {/* LEFT — Favourite items */}
          <div className="flex flex-col gap-4">
            {favourites.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-5">
                <div className="size-20 rounded-full bg-orange-50 flex items-center justify-center">
                  <Heart size={36} className="text-main" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">No favourites yet</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    Heart items you love and they&apos;ll appear here.
                  </p>
                </div>
                <Link
                  href="/"
                  className="mt-2 px-6 py-2.5 rounded-full bg-main text-white text-sm font-semibold hover:brightness-105 transition"
                >
                  Explore Products
                </Link>
              </div>
            )}

            <div className="flex flex-col gap-4 px-5">
              <AnimatePresence>
                {Array.from(new Map(favourites.map(item => [String(item.id), item])).values()).map((item) => (
                  <motion.div
                    key={String(item.id)}
                    layout
                    initial={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.3 } }}
                    className="flex flex-col gap-4 bg-card"
                  >
                    <SwipeToDismiss onDismiss={() => removeFavourite(item.id)}>
                      <div className="flex gap-4">
                        <Link
                          href={`/productItem/${item.id}`}
                          className="size-24 relative overflow-hidden rounded-sm shrink-0 bg-surface-muted"
                        >
                          {item.imageUrl && (
                            <Image
                              src={item.imageUrl}
                              alt={item.title}
                              fill
                              className="object-cover"
                            />
                          )}
                        </Link>

                        <div className="flex flex-col justify-between flex-1">
                          <div>
                            <p className="text-xs text-foreground">{item.categoryLabel}</p>
                            <Link href={`/productItem/${item.id}`}>
                              <h2 className="font-medium text-sm leading-tight hover:text-main transition-colors">
                                {item.title}
                              </h2>
                            </Link>
                          </div>

                          <div className="flex justify-between items-end">
                            <p className="text-main text-lg font-bold">{formatPriceRange(item.minPriceKobo, item.maxPriceKobo)}</p>

                            <button
                              onClick={() => removeFavourite(item.id)}
                              className="flex items-center gap-1.5 text-xs text-foreground-muted hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={15} strokeWidth={2} />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </SwipeToDismiss>
                    <div className="w-full h-0.5 rounded-full bg-neutral-200" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Suggestions */}
            <section className="flex flex-col gap-3 bg-card py-1">
              <SectionHeader title="New in Stock" href="/new" />
              <ListingsCarousel filters={{ sort: "newest" }} />
            </section>
          </div>

        </div>
      </main>

      <Nav />
    </>
  );
}
