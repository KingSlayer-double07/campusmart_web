"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ImageOff, Info, Store } from "lucide-react";
import InfoBanner from "../components/InfoBanner";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { usePickupStore } from "../store/usePickupStore";
import { ApiError } from "@/lib/api/client";
import { useCheckout, usePickupStations } from "@/lib/api/hooks/useBuyerOrders";
import { blockingIssues, useCart } from "@/lib/api/hooks/useCart";
import { PAYMENT_OPTIONS } from "@/lib/constants/payments";
import { formatNaira, type PaymentMethod } from "@/lib/labels";
import { randomUUID } from "@/lib/uuid";

function Divider() {
  return <div className="w-full h-0.5 rounded-full bg-neutral-200" />;
}

interface Problem {
  title: string;
  text: string;
  action?: { label: string; href: string };
}

// What to tell the buyer when checkout is refused (guide 4.3.4)
function problemFrom(err: unknown): Problem {
  if (err instanceof ApiError) {
    if (err.code === "OUT_OF_STOCK" || err.code === "ITEM_UNAVAILABLE") {
      return { title: "Your cart changed", text: err.message, action: { label: "Review cart", href: "/cart" } };
    }
    if (err.code === "CART_EMPTY") return { title: "Your cart is empty", text: err.message, action: { label: "Browse products", href: "/categories" } };
    if (err.status === 404) return { title: "Choose another station", text: err.message, action: { label: "Pickup stations", href: "/pickup-station" } };
    if (err.status === 403) return { title: "You can't check out right now", text: err.message };
    if (err.status === 0) return { title: "You're offline", text: "Check your connection and try again. You won't be charged twice." };
    return { title: "Checkout didn't go through", text: err.message };
  }
  return { title: "Checkout didn't go through", text: "Please try again." };
}

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const stations = usePickupStations();
  const checkout = useCheckout();
  const { selectedStationId } = usePickupStore();
  const [mounted, setMounted] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Made once per visit: retrying a request that may have reached the server returns the same order
  const [idempotencyKey] = useState(() => randomUUID());

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const station = stations.data?.find((s) => s.id === selectedStationId) ?? null;
  const lines = cart.groups.flatMap((g) => g.lines);
  const blocking = blockingIssues(cart);
  const busy = checkout.isPending || checkout.isSuccess;

  const proceed = async () => {
    if (!station) {
      setProblem({ title: "Choose a pickup station", text: "Pick where you'll collect your order.", action: { label: "Pickup stations", href: "/pickup-station" } });
      return;
    }
    if (!payMethod) {
      setProblem({ title: "Choose how you'll pay", text: "Pick one of the payment choices." });
      return;
    }
    try {
      const result = await checkout.mutateAsync({ pickupStationId: station.id, paymentMethod: payMethod, idempotencyKey });
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
      } else {
        // No payment page while online payment is switched off (Phase 5 turns it on)
        router.replace(`/order-confirmation?orderId=${result.orderId}&payment=unavailable`);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.code === "OUT_OF_STOCK" || err.code === "ITEM_UNAVAILABLE" || err.code === "CART_EMPTY")) {
        cart.refetch();
      }
      setProblem(problemFrom(err));
    }
  };

  return (
    <>
      <main className="pb-0 pt-8">
        <div className="flex flex-col gap-2 pb-4">
          <div className="px-4 sm:px-6">
            <PageHeader title="Checkout" />
          </div>
          <Divider />
        </div>

        {checkout.isSuccess ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" aria-busy="true">
            <p className="font-medium text-foreground">Order placed. Taking you to payment…</p>
          </div>
        ) : cart.isLoading ? (
          <div className="flex flex-col gap-3 px-4 sm:px-6 animate-pulse" aria-busy="true" aria-label="Loading your order">
            <div className="h-24 rounded bg-surface-muted" />
            <div className="h-16 rounded bg-surface-muted" />
          </div>
        ) : cart.isError ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="font-medium text-foreground">We couldn&apos;t load your cart</p>
            <button type="button" onClick={cart.refetch} className="text-sm font-semibold text-main">
              Try again
            </button>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="font-medium text-foreground">Your cart is empty</p>
            <Link href="/categories" className="text-sm font-semibold text-main">
              Browse products
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6 pb-44">
            {/* Items */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center px-4 sm:px-6">
                <p className="font-semibold">Items in your order ({cart.itemCount})</p>
                <Link href="/cart" className="flex items-center">
                  <p className="text-xs text-foreground/70 tracking-normal">Edit cart</p>
                  <ChevronRight size={14} strokeWidth={1.5} />
                </Link>
              </div>
              <div className="flex gap-2 overflow-x-scroll px-4 sm:px-6 no-scrollbar">
                {lines.map((line) => (
                  <div key={line.key} className="flex flex-col items-center gap-1 w-22 shrink-0">
                    <div className="relative overflow-hidden rounded-sm size-22 bg-surface-muted flex items-center justify-center text-foreground-muted">
                      {line.imageUrl ? <Image src={line.imageUrl} alt={line.title} fill sizes="88px" className="object-cover" /> : <ImageOff size={18} />}
                      <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white">×{line.quantity}</span>
                      {line.issue && line.issue.type !== "PRICE_CHANGED" && (
                        <div className="absolute bottom-0 left-0 right-0 bg-red-500 text-white text-[10px] font-semibold text-center py-0.5">{line.issue.message}</div>
                      )}
                    </div>
                    <p className="text-main font-semibold text-sm tracking-normal">{formatNaira(line.unitPriceKobo)}</p>
                    {line.variantLabel && <p className="text-[11px] text-foreground-muted">{line.variantLabel}</p>}
                  </div>
                ))}
              </div>
              {blocking.length > 0 && (
                <div className="px-4 sm:px-6">
                  <InfoBanner variant="error" title="Some items changed" text={<>Fix them in your <Link href="/cart" className="font-semibold text-main">cart</Link> before paying.</>} />
                </div>
              )}
            </div>

            <Divider />

            {/* Summary: no coupons yet, so no coupon field (guide 4.3.4) */}
            <div className="px-4 sm:px-6 flex flex-col gap-2">
              <p className="font-semibold">Order summary</p>
              <div className="flex flex-col gap-2 text-sm">
                {cart.groups.map((group) => (
                  <div key={group.sellerId ?? "items"} className="flex justify-between text-foreground/70">
                    <span>{group.storeName ?? "Items"}</span>
                    <span className="font-medium text-foreground">{formatNaira(group.subtotalKobo)}</span>
                  </div>
                ))}
                <Divider />
                <div className="flex justify-between font-bold text-base">
                  <span>Amount to pay</span>
                  <span>{formatNaira(cart.subtotalKobo)}</span>
                </div>
                {cart.groups.length > 1 && (
                  <p className="text-xs text-foreground-muted">
                    You pay once. Each store drops its items at your pickup station separately.
                  </p>
                )}
              </div>
            </div>

            <Divider />

            {/* Pickup station */}
            <div className="px-4 sm:px-6 flex flex-col gap-2">
              <p className="font-semibold">Pickup station</p>
              <Link href="/pickup-station" className="flex justify-between items-center gap-2 text-sm">
                <div className="flex gap-2 items-start min-w-0">
                  <Store size={17} color="#ff681f" className="shrink-0 mt-0.5" />
                  {station ? (
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{station.name}</p>
                      <p className="text-xs text-foreground-muted truncate">{station.address}</p>
                    </div>
                  ) : (
                    <p className="text-blue-600">{stations.isPending ? "Loading stations…" : "Select a pickup station"}</p>
                  )}
                </div>
                <span className="flex items-center text-xs text-foreground/70 shrink-0">
                  {station ? "Change" : ""}
                  <ChevronRight size={14} strokeWidth={1.9} />
                </span>
              </Link>
            </div>

            <Divider />

            {/* Payment */}
            <div className="px-4 sm:px-6 flex flex-col gap-3">
              <p className="font-semibold" id="payment-choices">Payment choices</p>
              <div className="flex flex-col gap-3" role="radiogroup" aria-labelledby="payment-choices">
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={option.id === payMethod}
                    aria-label={option.title}
                    className="flex justify-between items-center w-full"
                    onClick={() => setPayMethod(option.id)}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <div className="flex gap-2 items-center">
                        <div className="rounded-full border-2 border-border-default transition-all duration-200 size-4 shrink-0 flex items-center justify-center">
                          {option.id === payMethod && <div className="size-2 rounded-full bg-main" />}
                        </div>
                        {option.Icon && <option.Icon color="#737373" size={17} strokeWidth={2.2} />}
                        <p className="text-sm text-foreground/70">{option.title}</p>
                      </div>
                      {option.subLogos && <div className="pl-8">{option.subLogos}</div>}
                    </div>
                    {option.rightLogo && <div>{option.rightLogo}</div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {lines.length > 0 && !checkout.isSuccess && (
        <div className="fixed bottom-0 left-0 right-0 flex flex-col gap-2 items-center pb-6 font-dmSans tracking-tight z-50">
          <div className="backdrop-blur-xs flex justify-center items-center gap-1.5 py-2 px-3 rounded-full border border-border-default w-[90%] sm:w-[80%] bg-card/30 max-w-sm sm:max-w-md">
            <Info size={13} className="text-main shrink-0" />
            <p className="text-xs line-clamp-1">
              You have <span className="text-main font-semibold">48 hours</span> after collecting to report a problem
            </p>
          </div>
          <div className="backdrop-blur-xs flex justify-center items-center py-2 px-3 rounded-full border border-border-default w-[95%] sm:w-[88%] bg-card/30 max-w-sm sm:max-w-md gap-3">
            <p className="text-main font-bold text-base whitespace-nowrap shrink-0">{formatNaira(cart.subtotalKobo)}</p>
            <button
              type="button"
              className="w-full h-10 rounded-full bg-main border border-transparent disabled:opacity-40 transition-all duration-300 hover:brightness-105 active:scale-[0.98]"
              onClick={proceed}
              disabled={busy || blocking.length > 0 || cart.isLoading}
            >
              <p className="font-medium text-sm text-white">{busy ? "Placing your order…" : `Proceed to Pay (${cart.itemCount})`}</p>
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={!!problem} onClose={() => setProblem(null)} title={problem?.title ?? ""}>
        <div className="flex flex-col gap-4 mt-2">
          <p className="text-sm text-foreground-muted" role="alert">
            {problem?.text}
          </p>
          {problem?.action ? (
            <Link href={problem.action.href} className="w-full py-3 bg-main text-white text-center font-medium rounded-xl">
              {problem.action.label}
            </Link>
          ) : (
            <button type="button" onClick={() => setProblem(null)} className="w-full py-3 bg-main text-white font-medium rounded-xl">
              OK
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
