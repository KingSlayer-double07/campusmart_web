"use client";

import {
  ChevronRight,
  CircleMinus,
  CirclePlus,
  CreditCard,
  Info,
  Landmark,
  Store,
  Trash2,
} from "lucide-react";
import { useCartStore, selectTotalPrice } from "../store/useCartStore";
import { usePickupStore } from "../store/usePickupStore";
import Image from "next/image";
import { formatNaira } from "@/lib/labels";
import Link from "next/link";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_OPTIONS } from "@/lib/constants/payments";

// ─── Divider ──────────────────────────────────────────────────────────────────
function Divider() {
  return <div className="w-full h-0.5 rounded-full bg-neutral-200" />;
}

export default function Checkout() {
  const router = useRouter();
  const { cart, increaseQty, decreaseQty, checkout } = useCartStore();
  const totalPrice = useCartStore(selectTotalPrice);
  const { selectedStation } = usePickupStore();
  const [mounted, setMounted] = useState(false);
  const [payMethod, setPayMethod] = useState<number>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);

  const handleCheckout = async () => {
    if (!payMethod) {
      setError("Please select a payment method");
      return;
    }
    
    setIsProcessing(true);
    try {
      await checkout(payMethod, selectedStation?.id?.toString());
      router.push("/order-confirmation");
    } catch (error) {
      console.error(error);
      setError("Checkout failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <main className="pb-0 pt-8">
        {/* Page header */}
        <div className="flex flex-col gap-2 pb-4">
          <div className="px-4 sm:px-6">
            <PageHeader title="Order confirmation" />
          </div>
          <Divider />
        </div>

        <div className="flex flex-col gap-6">

          {/* LEFT — Form content */}
          <div className="flex flex-col gap-6">

            {/* Items thumbnail row */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center px-4 sm:px-6">
                <p className="font-semibold">Items in your order ({cart.length})</p>
                <Link href="/cart" className="flex items-center">
                  <p className="text-xs text-foreground/70 tracking-normal">View all</p>
                  <ChevronRight size={14} strokeWidth={1.5} />
                </Link>
              </div>

              <div className="flex gap-2 overflow-x-scroll px-4 sm:px-6 no-scrollbar">
                {cart.map((cartItem) => (
                  <div key={`${cartItem.id}-${cartItem.size}`} className="flex flex-col items-center gap-1">
                    {/* Thumbnail with optional stock badge */}
                    <div className="relative overflow-hidden rounded-sm size-22 bg-surface-muted">
                      {cartItem.image && (
                        <Image
                          src={cartItem.image}
                          alt={cartItem.name}
                          fill
                          className="w-full h-full object-cover"
                        />
                      )}
                      {/* Stock badge — shown when quantity is low (<10). Real data would drive this. */}
                      {cartItem.stockCount !== undefined && cartItem.stockCount < 10 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-main text-white text-[10px] font-semibold text-center py-0.5">
                          {cartItem.stockCount} Left
                        </div>
                      )}
                    </div>

                    <p className="text-main font-semibold text-sm tracking-normal">
                      {formatNaira(cartItem.priceKobo)}
                    </p>

                    <div className="w-20 px-2 h-6.5 rounded-full border bg-card border-neutral-500 flex justify-between items-center">
                      <button onClick={() => decreaseQty(cartItem.id, cartItem.size)}>
                        {cartItem.quantity === 1 ? (
                          <Trash2 size={15} color="#737373" strokeWidth={2.5} />
                        ) : (
                          <CircleMinus size={15} color="#737373" strokeWidth={2.5} />
                        )}
                      </button>
                      <p className="font-medium text-sm">{cartItem.quantity}</p>
                      <button onClick={() => increaseQty(cartItem.id, cartItem.size)}>
                        <CirclePlus size={15} color="#737373" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Divider />

            <div className="px-4 sm:px-6 flex flex-col gap-2">
              <p className="font-semibold">Order summary</p>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between text-foreground/70">
                  <span>Cost of Items</span>
                  <span className="font-medium text-foreground">{formatNaira(totalPrice)}</span>
                </div>
                <div className="flex justify-between text-foreground/70 items-center">
                  <span>Coupon codes</span>
                  <div className="flex items-center text-foreground/70 gap-0.5">
                    <input
                      type="text"
                      placeholder="Enter here"
                      className="text-sm bg-transparent outline-none text-right w-24 placeholder:text-foreground/70 text-foreground"
                    />
                    <button className="hover:text-main transition-colors" title="Apply Coupon">
                      <ChevronRight size={14} strokeWidth={1.9} />
                    </button>
                  </div>
                </div>
                <Divider />
                <div className="flex justify-between font-bold text-base">
                  <span>Amount to Pay</span>
                  <span>{formatNaira(totalPrice)}</span>
                </div>
              </div>
            </div>

            <Divider />

            {/* Shipping */}
            <div className="px-4 sm:px-6 flex flex-col gap-2">
              <p className="font-semibold">Shipping method</p>
              <div className="flex justify-between text-sm items-center gap-2">
                <div className="flex gap-1 items-center shrink-0">
                  <Store size={17} color="#ff681f" />
                  <p className="text-foreground/70">Pick-up Station</p>
                </div>
                <Link href="/pickup-station" className="text-blue-600 flex items-center gap-0.5 min-w-0">
                  <p className="text-sm truncate">
                    {selectedStation ? selectedStation.name : "Select a pickup station"}
                  </p>
                  <ChevronRight size={14} strokeWidth={1.9} className="shrink-0" />
                </Link>
              </div>
            </div>

            <Divider />

            {/* Payment */}
            <div className="px-4 sm:px-6 flex flex-col gap-3 pb-38">
              <p className="font-semibold">Payment choices</p>
              <div className="flex flex-col gap-3">
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className="flex justify-between items-center w-full"
                    onClick={() => setPayMethod(option.id)}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <div className="flex gap-2 items-center">
                        {/* Radio indicator */}
                        <div
                          className="rounded-full border-2 border-border-default transition-all duration-200 size-4 shrink-0 flex items-center justify-center"
                        >
                          {option.id === payMethod && (
                            <div className="size-2 rounded-full bg-main" />
                          )}
                        </div>
                        {option.Icon && (
                          <option.Icon color="#737373" size={17} strokeWidth={2.2} />
                        )}
                        <p className="text-sm text-foreground/70">{option.title}</p>
                      </div>
                      {/* Sub-logos (Visa/MC/Verve) below "Add a card" */}
                      {"subLogos" in option && option.subLogos && (
                        <div className="pl-8">{option.subLogos}</div>
                      )}
                    </div>

                    {/* Right-side logo (OPay, PalmPay) */}
                    {"rightLogo" in option && option.rightLogo && (
                      <div>{option.rightLogo}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* RIGHT - Summary */}
          <div className="w-full mt-4">
            <main className="fixed bottom-0 left-0 right-0 flex flex-col gap-2 items-center pb-6 font-dmSans tracking-tight z-50">
              <div className="backdrop-blur-xs flex justify-center items-center py-2 px-2 rounded-full border border-border-default w-[90%] sm:w-[80%] bg-card/30 max-w-sm sm:max-w-md gap-2">
                <p className="text-xs line-clamp-1">Items can only be returned within{" "}
                  <span className="text-main font-semibold">24 hours</span>{" "}
                  of picking-up</p>
              </div>
              <div className="backdrop-blur-xs flex justify-center items-center py-2 px-3 rounded-full border border-border-default w-[95%] sm:w-[88%] bg-card/30 max-w-sm sm:max-w-md gap-3">
                <p className="text-main font-bold text-base whitespace-nowrap shrink-0">
                  {formatNaira(totalPrice)}
                </p>
                <button
                  className="w-full h-10 rounded-full bg-main border border-transparent disabled:opacity-40 transition-all duration-300 hover:brightness-105 active:scale-[0.98]"
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || isProcessing}
                >
                  <p className="font-medium text-sm text-white">
                    {isProcessing ? "Processing..." : `Proceed to Pay (${totalQty})`}
                  </p>
                </button>
              </div>
            </main>
          </div>

        </div>
      </main>

      <Modal isOpen={!!error} onClose={() => setError(null)} title="Error">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground-muted">{error}</p>
          <button 
            onClick={() => setError(null)} 
            className="w-full py-3 bg-main text-white font-medium rounded-xl hover:bg-main-light transition active:scale-95"
          >
            OK
          </button>
        </div>
      </Modal>


    </>
  );
}
