"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, ChevronRight, ImageOff, Info, MapPin, Store } from "lucide-react";
import InfoBanner from "../components/InfoBanner";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { ApiError } from "@/lib/api/client";
import type { DeliveryMethod } from "@/lib/api/checkout";
import { useCampusPlaces, useCheckout } from "@/lib/api/hooks/useBuyerOrders";
import { blockingIssues, useCart, type CartLineGroup } from "@/lib/api/hooks/useCart";
import { useMe } from "@/lib/api/hooks/useMe";
import { PAYMENT_OPTIONS } from "@/lib/constants/payments";
import { formatNaira, type PaymentMethod } from "@/lib/labels";
import { randomUUID } from "@/lib/uuid";
import { addressError, phoneError } from "@/lib/validations/delivery";

function Divider() {
  return <div className="w-full h-0.5 rounded-full bg-neutral-200" />;
}

const fieldClass =
  "w-full rounded-xl border border-border-default bg-surface-muted px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-main/30 focus:border-main aria-invalid:border-red-400";

interface Problem {
  title: string;
  text: string;
  action?: { label: string; href: string };
}

type Where = "CAMPUS" | "OFF_CAMPUS";

interface FieldErrors {
  place?: string | null;
  address?: string | null;
  phone?: string | null;
}

// Codes that mean the cart or a store changed since the page loaded, so it should catch up
const CART_CHANGED = ["OUT_OF_STOCK", "ITEM_UNAVAILABLE", "CART_EMPTY", "PICKUP_NOT_OFFERED", "DELIVERY_UNAVAILABLE", "DELIVERY_CHOICE_REQUIRED"];

// What to tell the buyer when checkout is refused (guide 4.3.4, Phase 4b)
function problemFrom(err: unknown): Problem {
  if (err instanceof ApiError) {
    if (err.code === "OUT_OF_STOCK" || err.code === "ITEM_UNAVAILABLE") {
      return { title: "Your cart changed", text: err.message, action: { label: "Review cart", href: "/cart" } };
    }
    if (err.code === "CART_EMPTY") return { title: "Your cart is empty", text: err.message, action: { label: "Browse products", href: "/categories" } };
    if (err.code === "PICKUP_NOT_OFFERED") return { title: "Pickup isn't available", text: err.message };
    if (err.code === "DELIVERY_UNAVAILABLE") return { title: "No delivery on campus yet", text: err.message };
    if (err.code === "DELIVERY_CHOICE_REQUIRED") return { title: "Your cart changed", text: "Check how each store reaches you, then try again." };
    if (err.status === 404) return { title: "Choose another place", text: err.message };
    if (err.status === 403) return { title: "You can't check out right now", text: err.message };
    if (err.status === 0) return { title: "You're offline", text: "Check your connection and try again. You won't be charged twice." };
    return { title: "Checkout didn't go through", text: err.message };
  }
  return { title: "Checkout didn't go through", text: "Please try again." };
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span className="rounded-full border-2 border-border-default size-4 shrink-0 flex items-center justify-center">
      {checked && <span className="size-2 rounded-full bg-main" />}
    </span>
  );
}

// How one store's items reach the buyer (decision DM1): a rider, or collecting from the seller
// where they allow it (DL1). Before paying, only the seller's area shows (SA2).
function StoreChoice({ group, method, onChange }: { group: CartLineGroup; method: DeliveryMethod; onChange: (m: DeliveryMethod) => void }) {
  const name = group.storeName ?? "This store";
  const options: { id: DeliveryMethod; title: string; text: string; Icon: typeof Bike }[] = [
    { id: "DISPATCH", title: "Delivered by a rider", text: "A CampusMart rider collects it and brings it to you", Icon: Bike },
  ];
  if (group.pickupArea) {
    options.push({ id: "SELLER_PICKUP", title: "Pick up from the seller", text: `${group.pickupArea} · free. The address shows once you've paid.`, Icon: Store });
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-default p-3">
      <div className="flex justify-between gap-2 text-sm">
        <p className="font-medium text-foreground truncate">{name}</p>
        <p className="text-foreground-muted shrink-0">{formatNaira(group.subtotalKobo)}</p>
      </div>
      <div role="radiogroup" aria-label={`How ${name} reaches you`} className="flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={method === option.id}
            aria-label={option.title}
            onClick={() => onChange(option.id)}
            className="flex items-start gap-2 text-left"
          >
            <span className="mt-0.5">
              <Radio checked={method === option.id} />
            </span>
            <option.Icon size={16} className="mt-0.5 shrink-0 text-foreground-muted" />
            <span className="min-w-0">
              <span className="block text-sm text-foreground">{option.title}</span>
              <span className="block text-xs text-foreground-muted">{option.text}</span>
            </span>
          </button>
        ))}
      </div>
      {!group.pickupArea && <p className="text-xs text-foreground-muted">This store only sends by rider.</p>}
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const places = useCampusPlaces();
  const checkout = useCheckout();
  const { data: me } = useMe();
  const [mounted, setMounted] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod | null>(null);
  const [methods, setMethods] = useState<Record<string, DeliveryMethod>>({});
  const [where, setWhere] = useState<Where | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [address, setAddress] = useState("");
  // null until the buyer types: until then it's the number saved from last time (decision PH2)
  const [phone, setPhone] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  // Made once per visit: retrying a request that may have reached the server returns the same order
  const [idempotencyKey] = useState(() => randomUUID());

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const lines = cart.groups.flatMap((g) => g.lines);
  const blocking = blockingIssues(cart);
  const busy = checkout.isPending || checkout.isSuccess;

  // Pickup only where the seller still offers it; everything else goes by rider
  const methodOf = (group: CartLineGroup): DeliveryMethod =>
    group.pickupArea && methods[group.sellerId ?? ""] === "SELLER_PICKUP" ? "SELLER_PICKUP" : "DISPATCH";
  const anyDispatch = cart.groups.some((g) => methodOf(g) === "DISPATCH");

  // On campus needs a fee set by an admin (decision C10) and at least one place
  const fee = cart.campusDeliveryFeeKobo;
  const placeList = places.data ?? [];
  const campusAvailable = fee !== null && !(places.isSuccess && placeList.length === 0);
  const destination: Where = campusAvailable ? (where ?? "CAMPUS") : "OFF_CAMPUS";
  const deliveryFeeKobo = anyDispatch && destination === "CAMPUS" ? (fee ?? 0) : 0;
  const totalKobo = cart.subtotalKobo + deliveryFeeKobo;
  const phoneValue = phone ?? me?.phone ?? "";

  const proceed = async () => {
    if (anyDispatch) {
      const next: FieldErrors = {
        place: destination === "CAMPUS" && !placeId ? "Choose where on campus" : null,
        address: destination === "OFF_CAMPUS" ? addressError(address) : null,
        phone: phoneError(phoneValue),
      };
      setErrors(next);
      if (next.place || next.address || next.phone) return;
    }
    if (!payMethod) {
      setProblem({ title: "Choose how you'll pay", text: "Pick one of the payment choices." });
      return;
    }
    try {
      const result = await checkout.mutateAsync({
        stores: cart.groups.filter((g) => g.sellerId).map((g) => ({ sellerId: g.sellerId!, method: methodOf(g) })),
        ...(anyDispatch && {
          destination: destination === "CAMPUS" ? { campusPlaceId: placeId } : { address: address.trim() },
          phone: phoneValue.trim(),
        }),
        paymentMethod: payMethod,
        idempotencyKey,
      });
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
      } else {
        // No payment page while online payment is switched off (Phase 5 turns it on)
        router.replace(`/order-confirmation?orderId=${result.orderId}&payment=unavailable`);
      }
    } catch (err) {
      if (err instanceof ApiError && CART_CHANGED.includes(err.code)) cart.refetch();
      if (err instanceof ApiError && err.status === 404) {
        setPlaceId("");
        void places.refetch();
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

            {/* How each store reaches the buyer */}
            <section aria-labelledby="delivery-heading" className="px-4 sm:px-6 flex flex-col gap-3">
              <p id="delivery-heading" className="font-semibold">Delivery</p>
              {cart.groups.map((group) => (
                <StoreChoice
                  key={group.sellerId ?? "items"}
                  group={group}
                  method={methodOf(group)}
                  onChange={(m) => setMethods((prev) => ({ ...prev, [group.sellerId ?? ""]: m }))}
                />
              ))}
            </section>

            {/* One destination for everything by rider (decision DF6) */}
            {anyDispatch && (
              <>
                <Divider />
                <section aria-labelledby="destination-heading" className="px-4 sm:px-6 flex flex-col gap-3">
                  <p id="destination-heading" className="font-semibold">Where should the rider bring it?</p>
                  <div role="radiogroup" aria-labelledby="destination-heading" className="grid grid-cols-2 gap-2">
                    {(["CAMPUS", "OFF_CAMPUS"] as const).map((option) => {
                      const disabled = option === "CAMPUS" && !campusAvailable;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={destination === option}
                          disabled={disabled}
                          onClick={() => setWhere(option)}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
                            destination === option ? "border-main bg-main/5 text-main" : "border-border-default text-foreground"
                          }`}
                        >
                          {option === "CAMPUS" ? "On campus" : "Off campus"}
                        </button>
                      );
                    })}
                  </div>

                  {destination === "CAMPUS" ? (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="campus-place" className="text-sm text-foreground/80">
                        Place on campus
                      </label>
                      {places.isError ? (
                        <p className="text-sm text-foreground-muted">
                          We couldn&apos;t load the places.{" "}
                          <button type="button" onClick={() => void places.refetch()} className="font-semibold text-main">
                            Try again
                          </button>
                        </p>
                      ) : (
                        <select
                          id="campus-place"
                          value={placeId}
                          disabled={places.isPending}
                          aria-invalid={!!errors.place}
                          onChange={(e) => {
                            setPlaceId(e.target.value);
                            setErrors((prev) => ({ ...prev, place: null }));
                          }}
                          className={fieldClass}
                        >
                          <option value="">{places.isPending ? "Loading places…" : "Choose a place"}</option>
                          {placeList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {errors.place && <p role="alert" className="text-xs font-medium text-red-500">{errors.place}</p>}
                      <p className="flex items-center gap-1 text-xs text-foreground-muted">
                        <MapPin size={12} /> The rider calls you when they reach it.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="delivery-address" className="text-sm text-foreground/80">
                        Address off campus
                      </label>
                      <textarea
                        id="delivery-address"
                        rows={2}
                        maxLength={300}
                        value={address}
                        aria-invalid={!!errors.address}
                        placeholder="e.g. 14 Akoka Road, Yaba"
                        onChange={(e) => {
                          setAddress(e.target.value);
                          setErrors((prev) => ({ ...prev, address: null }));
                        }}
                        className={`${fieldClass} resize-none`}
                      />
                      {errors.address && <p role="alert" className="text-xs font-medium text-red-500">{errors.address}</p>}
                      <p className="text-xs text-foreground-muted">
                        Delivery off campus is priced by distance. You settle it with the rider, outside the app.
                      </p>
                    </div>
                  )}
                  {!campusAvailable && (
                    <p className="text-xs text-foreground-muted">Delivery on campus isn&apos;t available at your school yet.</p>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="rider-phone" className="text-sm text-foreground/80">
                      Phone number for the rider
                    </label>
                    <input
                      id="rider-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phoneValue}
                      aria-invalid={!!errors.phone}
                      placeholder="+234 801 234 5678"
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setErrors((prev) => ({ ...prev, phone: null }));
                      }}
                      className={fieldClass}
                    />
                    {errors.phone && <p role="alert" className="text-xs font-medium text-red-500">{errors.phone}</p>}
                    <p className="text-xs text-foreground-muted">Saved to your profile for next time.</p>
                  </div>
                </section>
              </>
            )}

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
                {anyDispatch && (
                  <div className="flex justify-between text-foreground/70">
                    <span>Delivery</span>
                    <span className="font-medium text-foreground">
                      {destination === "CAMPUS" ? formatNaira(deliveryFeeKobo) : "Agreed with the rider"}
                    </span>
                  </div>
                )}
                <Divider />
                <div className="flex justify-between font-bold text-base">
                  <span>Amount to pay</span>
                  <span>{formatNaira(totalKobo)}</span>
                </div>
                {anyDispatch && cart.groups.filter((g) => methodOf(g) === "DISPATCH").length > 1 && (
                  <p className="text-xs text-foreground-muted">One delivery fee: a single rider collects from each store and brings everything together.</p>
                )}
              </div>
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
                        <Radio checked={option.id === payMethod} />
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
              You have <span className="text-main font-semibold">48 hours</span> after it reaches you to report a problem
            </p>
          </div>
          <div className="backdrop-blur-xs flex justify-center items-center py-2 px-3 rounded-full border border-border-default w-[95%] sm:w-[88%] bg-card/30 max-w-sm sm:max-w-md gap-3">
            <p className="text-main font-bold text-base whitespace-nowrap shrink-0">{formatNaira(totalKobo)}</p>
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
