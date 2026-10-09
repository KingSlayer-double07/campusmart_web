"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Circle, CircleCheck, CircleMinus, CirclePlus, Heart, ImageOff, ShoppingBag, Store, Trash2 } from "lucide-react";
import CheckoutNav from "../components/checkoutNav";
import InfoBanner from "../components/InfoBanner";
import ListingsCarousel from "../components/ListingsCarousel";
import PageHeader from "../components/PageHeader";
import ProductCarousel from "../components/ProductCarousel";
import SectionHeader from "../components/SectionHeader";
import SwipeToDismiss from "../components/SwipeToDismiss";
import { ToastContainer, useToast } from "../components/Toast";
import { useFavouritesStore } from "../store/useFavouritesStore";
import { ApiError } from "@/lib/api/client";
import { blockingIssues, useCart, useCartActions, type CartLine } from "@/lib/api/hooks/useCart";
import { formatNaira } from "@/lib/labels";

const ISSUE_STYLES = {
  UNAVAILABLE: "text-red-500",
  OUT_OF_STOCK: "text-red-500",
  LOW_STOCK: "text-main",
  PRICE_CHANGED: "text-main",
} as const;

function CartLineRow({
  line,
  selected,
  onToggle,
  onQuantity,
  onRemove,
  busy,
}: {
  line: CartLine;
  selected: boolean;
  onToggle: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const issue = line.issue;
  return (
    <div className={`flex gap-4 ${line.available ? "" : "opacity-70"}`}>
      <div className="flex items-center gap-2">
        <button type="button" className="text-main" aria-label={`Select ${line.title}`} aria-pressed={selected} onClick={onToggle}>
          {selected ? <CircleCheck size={19} fill="#ff681f" color="white" /> : <Circle size={19} />}
        </button>
        <Link href={`/productItem/${line.listingId}`} className="size-24 relative overflow-hidden rounded-sm bg-surface-muted flex items-center justify-center text-foreground-muted">
          {line.imageUrl ? <Image src={line.imageUrl} alt={line.title} fill sizes="96px" className="object-cover" /> : <ImageOff size={18} />}
        </Link>
      </div>

      <div className="flex flex-col justify-between flex-1 min-w-0 pr-4 gap-1">
        <p className="text-xs text-foreground">{line.categoryLabel}</p>
        <h2 className="font-medium text-sm leading-tight">{line.title}</h2>
        {line.variantLabel && <p className="text-xs text-foreground">Option: {line.variantLabel}</p>}
        {issue && (
          <div className="flex flex-wrap items-center gap-x-2 text-xs font-semibold">
            <p className={ISSUE_STYLES[issue.type]}>{issue.message}</p>
            {issue.type === "LOW_STOCK" && issue.available !== null && issue.available > 0 && (
              <button type="button" disabled={busy} className="text-blue-600 underline disabled:opacity-50" onClick={() => onQuantity(issue.available!)}>
                Change to {issue.available}
              </button>
            )}
            {issue.type === "PRICE_CHANGED" && (
              <button type="button" disabled={busy} className="text-blue-600 underline disabled:opacity-50" onClick={() => onQuantity(line.quantity)}>
                OK
              </button>
            )}
          </div>
        )}

        <div className="flex justify-between items-end">
          <p className="text-main text-lg font-bold">{formatNaira(line.unitPriceKobo)}</p>
          {line.available ? (
            <div className="w-24 px-2 h-7 rounded-full border-[1.9px] bg-card border-neutral-400 flex justify-between items-center">
              <button type="button" aria-label={line.quantity === 1 ? `Remove ${line.title}` : "One fewer"} disabled={busy} className="disabled:opacity-40" onClick={() => (line.quantity === 1 ? onRemove() : onQuantity(line.quantity - 1))}>
                {line.quantity === 1 ? <Trash2 size={15} color="#737373" strokeWidth={2.5} /> : <CircleMinus size={15} color="#737373" strokeWidth={2.5} />}
              </button>
              <p className="font-medium text-sm" aria-label="Quantity">{line.quantity}</p>
              <button type="button" aria-label="One more" disabled={busy || line.quantity >= line.maxQuantity} className="disabled:opacity-40" onClick={() => onQuantity(line.quantity + 1)}>
                <CirclePlus size={15} color="#737373" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={onRemove} className="rounded-full border border-border-default px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-50">
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Guide 4.3.2: the cart grouped by store, with a subtotal per store and issues shown inline
export default function CartPage() {
  const cart = useCart();
  const actions = useCartActions();
  const toast = useToast();
  const { addFavourite, favourites } = useFavouritesStore();
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const lines = cart.groups.flatMap((g) => g.lines);
  const blocking = blockingIssues(cart);

  const change = async (line: CartLine, update: () => Promise<void>) => {
    setBusyKey(line.key);
    try {
      await update();
    } catch (err) {
      toast.error("Couldn't update your cart", err instanceof ApiError ? err.message : "Please try again");
    } finally {
      setBusyKey(null);
    }
  };

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const removeSelected = async () => {
    for (const line of lines.filter((l) => selected.has(l.key))) {
      await change(line, () => actions.remove(line));
    }
    setSelected(new Set());
  };

  const favouriteSelected = () => {
    for (const line of lines.filter((l) => selected.has(l.key))) {
      addFavourite({
        id: line.listingId,
        title: line.title,
        minPriceKobo: line.unitPriceKobo,
        maxPriceKobo: line.unitPriceKobo,
        imageUrl: line.imageUrl,
        categoryLabel: line.categoryLabel,
      });
    }
    toast.success("Saved to favourites", `${selected.size} item${selected.size === 1 ? "" : "s"}`);
    setSelected(new Set());
  };

  const iconButton = "size-8 bg-card rounded-full border border-border-default flex justify-center items-center shadow-lg hover:bg-surface-muted transition shrink-0";

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main className="pb-36 pt-8">
        <div className="flex flex-col gap-2 pb-4">
          <div className="px-4 sm:px-6">
            <PageHeader
              title={`My Cart (${cart.itemCount})`}
              rightItems={
                selected.size > 0 ? (
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Save selected to favourites" onClick={favouriteSelected} className={iconButton}>
                      <Heart size={16} />
                    </button>
                    <button type="button" aria-label="Remove selected" onClick={removeSelected} className={iconButton}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : undefined
              }
            />
          </div>
          <div className="w-full h-0.5 rounded-full bg-neutral-200" />
        </div>

        <div className="flex flex-col gap-6">
          {cart.isLoading ? (
            <div className="flex flex-col gap-4 px-4 sm:px-6" aria-busy="true" aria-label="Loading your cart">
              {[0, 1].map((i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="size-24 rounded-sm bg-surface-muted" />
                  <div className="flex flex-1 flex-col gap-2 pt-2">
                    <div className="h-3 w-1/3 rounded bg-surface-muted" />
                    <div className="h-4 w-2/3 rounded bg-surface-muted" />
                    <div className="h-5 w-1/4 rounded bg-surface-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : cart.isError ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <p className="font-medium text-foreground">We couldn&apos;t load your cart</p>
              <p className="text-sm text-foreground-muted">
                {cart.error instanceof ApiError && cart.error.status === 403 ? cart.error.message : "Check your connection and try again."}
              </p>
              <button type="button" onClick={cart.refetch} className="text-sm font-semibold text-main">
                Try again
              </button>
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-main-subtle">
                <ShoppingBag size={24} className="text-main" />
              </div>
              <p className="font-medium text-foreground">Your cart is empty</p>
              <p className="text-sm text-foreground-muted">Items you add from your school&apos;s stores show up here.</p>
              <Link href="/categories" className="text-sm font-semibold text-main">
                Browse products
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-6 px-4 sm:px-6">
              {cart.issues.length > 0 && (
                <InfoBanner
                  title={blocking.length > 0 ? "Some items need your attention" : "A price changed"}
                  text={
                    blocking.length > 0
                      ? "Remove or adjust the items marked below before you check out."
                      : "You'll pay the new price. Tap OK to confirm you've seen it."
                  }
                />
              )}
              {cart.groups.map((group) => (
                <section key={group.sellerId ?? "items"} aria-label={group.storeName ?? "Your items"} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Store size={16} className="text-main" />
                      <h2 className="text-sm font-semibold">{group.storeName ?? "Your items"}</h2>
                    </div>
                    <p className="text-sm text-foreground-muted">
                      Subtotal <span className="font-semibold text-foreground">{formatNaira(group.subtotalKobo)}</span>
                    </p>
                  </div>
                  <AnimatePresence>
                    {group.lines.map((line) => (
                      <motion.div
                        key={line.key}
                        layout
                        initial={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.3 } }}
                        className="flex flex-col gap-4 bg-card"
                      >
                        <SwipeToDismiss onDismiss={() => change(line, () => actions.remove(line))}>
                          <CartLineRow
                            line={line}
                            selected={selected.has(line.key)}
                            onToggle={() => toggle(line.key)}
                            onQuantity={(quantity) => change(line, () => actions.setQuantity(line, quantity))}
                            onRemove={() => change(line, () => actions.remove(line))}
                            busy={busyKey === line.key}
                          />
                        </SwipeToDismiss>
                        <div className="w-full h-0.5 rounded-full bg-border-default" />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </section>
              ))}
            </div>
          )}

          <section className="flex flex-col gap-3 bg-card py-1">
            <SectionHeader title="New in Stock" href="/categories?sort=newest" />
            <ListingsCarousel filters={{ sort: "newest" }} />
          </section>

          <section className="flex flex-col gap-3 bg-card py-1">
            <SectionHeader title="Favorites" href="/favourites" />
            <ProductCarousel items={favourites} emptyText="Tap the heart on a product to save it here." />
          </section>
        </div>
      </main>

      <CheckoutNav
        text="Checkout"
        link="checkout"
        totalKobo={cart.subtotalKobo}
        itemCount={cart.itemCount}
        disabled={cart.isLoading || blocking.length > 0}
        hint={blocking.length > 0 ? "Fix the items marked above to check out" : undefined}
      />
    </>
  );
}
