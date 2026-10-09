"use client";

import {
  Circle,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  Trash2,
  Heart,
} from "lucide-react";
import { useCartStore, selectTotalPrice } from "../store/useCartStore";
import { useFavouritesStore } from "../store/useFavouritesStore";
import Image from "next/image";
import CheckoutNav from "../components/checkoutNav";
import PageHeader from "../components/PageHeader";
import { useEffect, useState } from "react";
import SectionHeader from "../components/SectionHeader";
import ProductCarousel from "../components/ProductCarousel";
import ListingsCarousel from "../components/ListingsCarousel";
import Nav from "../components/nav";
import { formatNaira } from "@/lib/labels";

import { AnimatePresence, motion } from "framer-motion";
import SwipeToDismiss from "../components/SwipeToDismiss";

export default function Cart() {
  const { cart, increaseQty, decreaseQty, removeFromCart, removeMultipleFromCart } = useCartStore();
  const { addFavourite, favourites } = useFavouritesStore();
  const totalPrice = useCartStore(selectTotalPrice);

  const [mounted, setMounted] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const toggleSelection = (key: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedItems(newSet);
  };

  const handleDeleteSelected = () => {
    removeMultipleFromCart(Array.from(selectedItems));
    setSelectedItems(new Set());
  };

  const handleFavoriteSelected = () => {
    selectedItems.forEach((key) => {
      const [idStr, size] = key.split('|');
      const item = cart.find((i) => i.id === idStr && i.size === size);
      if (item) {
        addFavourite({
          id: item.id,
          title: item.name,
          minPriceKobo: item.priceKobo,
          maxPriceKobo: item.priceKobo,
          imageUrl: item.image,
          categoryLabel: item.category,
        });
      }
    });
    setSelectedItems(new Set());
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <main className="pb-28 pt-8">
        {/* ── Page header ── */}
        <div className="flex flex-col gap-2 pb-4">
          <div className="px-4 sm:px-6">
            <PageHeader 
              title={`My Cart (${cart.length})`}
              rightItems={
                selectedItems.size > 0 ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleFavoriteSelected}
                      className="size-8 bg-card rounded-full border border-border-default flex justify-center items-center shadow-lg hover:bg-surface-muted transition shrink-0"
                    >
                      <Heart size={16} />
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      className="size-8 bg-card rounded-full border border-border-default flex justify-center items-center shadow-lg hover:bg-surface-muted transition shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : undefined
              }
            />
          </div>
          <div className="w-full h-0.5 rounded-full bg-neutral-200" />
        </div>

        <div className="flex flex-col gap-8">

          {/* LEFT — Cart items */}
          <div className="flex flex-col gap-4">
            {cart.length === 0 && (
              <p className="text-sm text-center px-4 sm:px-6">Your cart is empty</p>
            )}

            <div className="flex flex-col gap-4 px-4 sm:px-6">
              <AnimatePresence>
                {cart.map((item) => (
                  <motion.div 
                    key={`${item.id}-${item.size}`}
                    layout
                    initial={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.3 } }}
                    className="flex flex-col gap-4 bg-card"
                  >
                    <SwipeToDismiss 
                      onDismiss={() => removeFromCart(item.id, item.size)}
                    >
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            className="text-main"
                            onClick={() => toggleSelection(`${item.id}|${item.size}`)}
                          >
                            {selectedItems.has(`${item.id}|${item.size}`) ? (
                              <CircleCheck size={19} fill="#ff681f" color="white" />
                            ) : (
                              <Circle size={19} />
                            )}
                          </button>

                          <div className="size-24 relative overflow-hidden rounded-sm bg-surface-muted">
                            {item.image && (
                              <Image
                                src={item.image}
                                alt={item.name}
                                fill
                                className="object-cover"
                              />
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col justify-between flex-1 pr-4">
                          <p className="text-xs text-foreground">{item.category}</p>
                          <h2 className="font-medium text-sm leading-tight">{item.name}</h2>

                          {item.variantId && (
                            <p className="text-xs text-foreground">Option: {item.size}</p>
                          )}

                          <div className="flex justify-between items-end">
                            <p className="text-main text-lg font-bold">{formatNaira(item.priceKobo)}</p>

                            <div className="w-21 px-2 h-7 rounded-full border-[1.9px] bg-card border-neutral-400 flex justify-between items-center">
                              <button onClick={() => decreaseQty(item.id, item.size)}>
                                {item.quantity === 1 ? (
                                  <Trash2 size={15} color="#737373" strokeWidth={2.5} />
                                ) : (
                                  <CircleMinus size={15} color="#737373" strokeWidth={2.5} />
                                )}
                              </button>
                              <p className="font-medium text-sm">{item.quantity}</p>
                              <button onClick={() => increaseQty(item.id, item.size)}>
                                <CirclePlus size={15} color="#737373" strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </SwipeToDismiss>
                    <div className="w-full h-0.5 rounded-full bg-border-default" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Suggestions — full-width inside the left column */}
            <section className="flex flex-col gap-3 bg-card py-1">
              <SectionHeader title="New in Stock" href="/new" />
              <ListingsCarousel filters={{ sort: "newest" }} />
            </section>

            <section className="flex flex-col gap-3 bg-card py-1">
              <SectionHeader title="Favorites" href="/favourites" />
              <ProductCarousel items={favourites} emptyText="Tap the heart on a product to save it here." />
            </section>
          </div>

          {/* RIGHT - Summary */}
          <div className="w-full mt-4">
            <CheckoutNav text="Checkout" link="checkout" />
          </div>

        </div>
      </main>

      {/* <Nav /> */}
    </>
  );
}
