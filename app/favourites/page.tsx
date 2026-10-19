"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useWishlist, useWishlistPage } from "@/lib/api/hooks/useWishlist";
import { CATEGORY_LABELS, formatPriceRange } from "@/lib/labels";
import ListingsCarousel from "../components/ListingsCarousel";
import Nav from "../components/nav";
import PageHeader from "../components/PageHeader";
import SectionHeader from "../components/SectionHeader";
import SwipeToDismiss from "../components/SwipeToDismiss";
import { ToastContainer, useToast } from "../components/Toast";

function Empty({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-5">
      <div className="size-20 rounded-full bg-orange-50 flex items-center justify-center">
        <Heart size={36} className="text-main" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <p className="font-semibold text-foreground">{signedIn ? "No favourites yet" : "Sign in to see your favourites"}</p>
        <p className="text-sm text-foreground-muted mt-1">
          {signedIn ? "Heart items you love and they'll appear here." : "They stay with your account on every device."}
        </p>
      </div>
      <Link
        href={signedIn ? "/" : "/onboarding/buyers/sign-in"}
        className="mt-2 px-6 py-2.5 rounded-full bg-main text-white text-sm font-semibold hover:brightness-105 transition"
      >
        {signedIn ? "Explore Products" : "Sign in"}
      </Link>
    </div>
  );
}

// Guide 8.1: the account's favourites, newest first. Ones no longer on sale stay until removed.
export default function Favourites() {
  const wishlist = useWishlist();
  const page = useWishlistPage();
  const toast = useToast();
  // Hidden at once on removal; the list refreshes behind it
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const items = (page.data?.pages.flatMap((p) => p.items) ?? []).filter((i) => !removed.has(i.id));
  const total = wishlist.canSave ? wishlist.count : 0;

  const remove = async (id: string) => {
    setRemoved((r) => new Set(r).add(id));
    try {
      if (wishlist.isSaved(id)) await wishlist.toggle(id);
    } catch (err) {
      setRemoved((r) => {
        const next = new Set(r);
        next.delete(id);
        return next;
      });
      toast.error("Couldn't remove it", err instanceof ApiError ? err.message : "Please try again");
    }
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main className="pb-0 pt-8">
        {/* ── Page header ── */}
        <div className="flex flex-col gap-2 pb-4">
          <div className="px-5">
            <PageHeader title={`My Favourites (${total})`} />
          </div>
          <div className="w-full h-0.5 rounded-full bg-neutral-200" />
        </div>

        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            {!wishlist.canSave ? (
              <Empty signedIn={false} />
            ) : page.isPending ? (
              <div className="flex flex-col gap-4 px-5" aria-label="Loading">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-sm bg-surface-muted" />
                ))}
              </div>
            ) : page.isError ? (
              <p role="alert" className="px-5 py-10 text-center text-sm text-foreground-muted">
                Couldn&apos;t load your favourites.{" "}
                <button type="button" onClick={() => page.refetch()} className="font-semibold text-main">
                  Try again
                </button>
              </p>
            ) : items.length === 0 ? (
              <Empty signedIn />
            ) : (
              <div className="flex flex-col gap-4 px-5">
                <AnimatePresence>
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.3 } }}
                      className="flex flex-col gap-4 bg-card"
                    >
                      <SwipeToDismiss onDismiss={() => remove(item.id)}>
                        <div className="flex gap-4">
                          <Link
                            href={`/productItem/${item.id}`}
                            className={`size-24 relative overflow-hidden rounded-sm shrink-0 bg-surface-muted ${item.available ? "" : "opacity-50"}`}
                          >
                            {item.imageUrl && <Image src={item.imageUrl} alt={item.title} fill sizes="96px" className="object-cover" />}
                          </Link>

                          <div className="flex flex-col justify-between flex-1">
                            <div>
                              <p className="text-xs text-foreground">{CATEGORY_LABELS[item.category]}</p>
                              <Link href={`/productItem/${item.id}`}>
                                <h2 className="font-medium text-sm leading-tight hover:text-main transition-colors">{item.title}</h2>
                              </Link>
                              {!item.available && <p className="mt-1 text-xs font-semibold text-red-500">No longer available</p>}
                            </div>

                            <div className="flex justify-between items-end">
                              <p className={`text-lg font-bold ${item.available ? "text-main" : "text-foreground-muted"}`}>
                                {formatPriceRange(item.minPriceKobo, item.maxPriceKobo)}
                              </p>
                              <button
                                type="button"
                                onClick={() => remove(item.id)}
                                aria-label={`Remove ${item.title} from favourites`}
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
                {page.hasNextPage && (
                  <button
                    type="button"
                    onClick={() => page.fetchNextPage()}
                    disabled={page.isFetchingNextPage}
                    className="self-center py-2 text-sm font-semibold text-main disabled:opacity-50"
                  >
                    {page.isFetchingNextPage ? "Loading…" : "Show more"}
                  </button>
                )}
              </div>
            )}

            {/* Suggestions */}
            <section className="flex flex-col gap-3 bg-card py-1">
              <SectionHeader title="New in Stock" href="/browse?sort=newest" />
              <ListingsCarousel filters={{ sort: "newest" }} />
            </section>
          </div>
        </div>
      </main>

      <Nav />
    </>
  );
}
