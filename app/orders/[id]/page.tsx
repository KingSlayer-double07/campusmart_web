"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bike, Check, Clock, ImageOff, MapPin, Phone, Store } from "lucide-react";
import Modal from "@/app/components/Modal";
import PageHeader from "@/app/components/PageHeader";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { ApiError } from "@/lib/api/client";
import type { Order, SellerOrder } from "@/lib/api/checkout";
import { useCancelOrder, useOrder } from "@/lib/api/hooks/useBuyerOrders";
import { usePaymentConfig, usePayOrder } from "@/lib/api/hooks/usePayments";
import { formatNaira, type FulfillmentStatus } from "@/lib/labels";
import { cancelReasonText, whenText } from "@/lib/orderText";
import ReportProblemDialog from "../ReportProblemDialog";
import { summarizeOpeningHours } from "@/lib/openingHours";
import OrderStatusBadge from "../OrderStatusBadge";
import { deliveryLine } from "../delivery";

// West Africa Time, like the delivery steps on this page (lib/orderText)
const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
const time = new Intl.DateTimeFormat("en-NG", { timeStyle: "short", timeZone: "Africa/Lagos" });

const STEPS = [
  { label: "Paid", hint: "Your payment is in" },
  { label: "Drop-off", hint: "The seller brings it to the station" },
  { label: "Ready for pickup", hint: "Show your collection code" },
  { label: "Collected", hint: "Enjoy!" },
];

// How far along the steps a seller order is; -1 while unpaid
const STEP_INDEX: Partial<Record<FulfillmentStatus, number>> = {
  PENDING: -1,
  AWAITING_DROPOFF: 1,
  DROPPED_OFF: 2,
  COLLECTED: 4,
};

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

// Guide 4.3.6: a per-seller timeline (orders placed through a pickup station; the delivery
// timeline arrives with Phase 6)
function Timeline({ status }: { status: FulfillmentStatus }) {
  const reached = STEP_INDEX[status] ?? -1;
  return (
    <ol className="flex flex-col gap-3" aria-label="Progress">
      {STEPS.map((step, i) => {
        const done = i < reached || (i === 0 && reached >= 1);
        const current = i === reached;
        return (
          <li key={step.label} className="flex items-start gap-3" aria-current={current ? "step" : undefined}>
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                done ? "border-green-500 bg-green-500 text-white" : current ? "border-main bg-card" : "border-border-default bg-card"
              }`}
            >
              {done && <Check size={12} strokeWidth={3} />}
              {current && <span className="size-2 rounded-full bg-main" />}
            </span>
            <div>
              <p className={`text-sm ${done || current ? "font-semibold text-foreground" : "text-foreground-muted"}`}>{step.label}</p>
              {current && <p className="text-xs text-foreground-muted">{step.hint}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Decision C8: from payment until 48 hours after handover
function canReport(order: Order, so: SellerOrder): boolean {
  if (order.status !== "PAID" || !so.deliveryMethod) return false;
  if (so.fulfillmentStatus === "CANCELLED" || so.fulfillmentStatus === "DISPUTED") return false;
  if (so.fulfillmentStatus === "DELIVERED" || so.fulfillmentStatus === "COLLECTED") {
    return !!so.releaseAt && new Date(so.releaseAt).getTime() > Date.now();
  }
  return true;
}

const DISPATCH_STEPS: { label: string; reached: FulfillmentStatus[] }[] = [
  { label: "Paid", reached: ["AWAITING_RIDER", "RIDER_ASSIGNED", "WITH_RIDER", "DELIVERED"] },
  { label: "A rider is on the way to the store", reached: ["RIDER_ASSIGNED", "WITH_RIDER", "DELIVERED"] },
  { label: "With the rider", reached: ["WITH_RIDER", "DELIVERED"] },
  { label: "Delivered", reached: ["DELIVERED"] },
];
const PICKUP_STEPS: { label: string; reached: FulfillmentStatus[] }[] = [
  { label: "Paid", reached: ["AWAITING_PICKUP", "COLLECTED"] },
  { label: "Ready for you to collect", reached: ["AWAITING_PICKUP", "COLLECTED"] },
  { label: "Collected", reached: ["COLLECTED"] },
];

// Phase 6: where a delivered or collected store's order has got to
function DeliverySteps({ method, status }: { method: NonNullable<SellerOrder["deliveryMethod"]>; status: FulfillmentStatus }) {
  const steps = method === "DISPATCH" ? DISPATCH_STEPS : PICKUP_STEPS;
  const lastReached = steps.reduce((at, step, i) => (step.reached.includes(status) ? i : at), -1);
  return (
    <ol className="flex flex-col gap-2" aria-label="Progress">
      {steps.map((step, i) => {
        const done = i <= lastReached;
        const current = i === lastReached;
        return (
          <li key={step.label} className="flex items-center gap-3" aria-current={current ? "step" : undefined}>
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                done ? "border-green-500 bg-green-500 text-white" : "border-border-default bg-card"
              }`}
            >
              {done && <Check size={12} strokeWidth={3} />}
            </span>
            <p className={`text-sm ${current ? "font-semibold text-foreground" : done ? "text-foreground" : "text-foreground-muted"}`}>{step.label}</p>
          </li>
        );
      })}
    </ol>
  );
}

function SellerOrderCard({ order, sellerOrder, onReport }: { order: Order; sellerOrder: SellerOrder; onReport: (so: SellerOrder) => void }) {
  const so = sellerOrder;
  return (
    <section aria-label={so.seller.storeName} className="flex flex-col gap-4 rounded-2xl border border-border-default bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{so.seller.storeName}</p>
          <p className="text-xs text-foreground-muted">
            Order code <span className="font-mono font-semibold text-foreground">{so.code}</span>
          </p>
        </div>
        <p className="text-sm font-semibold">{formatNaira(so.subtotalKobo)}</p>
      </div>

      {so.deliveryMethod === "DISPATCH" && (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Bike size={16} className="shrink-0 text-main" />
          Delivered by a rider
        </p>
      )}
      {so.deliveryMethod === "SELLER_PICKUP" && so.pickupFrom && (
        <div className="flex items-start gap-2 text-sm">
          <Store size={16} className="mt-0.5 shrink-0 text-main" />
          <div className="min-w-0">
            <p className="text-foreground">You pick up from the seller · {so.pickupFrom.area}</p>
            {so.pickupFrom.address ? (
              <>
                <p className="text-xs text-foreground-muted">{so.pickupFrom.address}</p>
                {so.pickupFrom.phone && (
                  <a href={telHref(so.pickupFrom.phone)} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-main">
                    <Phone size={12} />
                    {so.pickupFrom.phone}
                  </a>
                )}
              </>
            ) : (
              <p className="text-xs text-foreground-muted">Their address and phone number show once you&apos;ve paid.</p>
            )}
          </div>
        </div>
      )}

      {so.fulfillmentStatus === "DROPPED_OFF" && order.pickupStation && so.collectionCode && (
        <div className="rounded-2xl bg-main-subtle px-4 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-main">Your collection code</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-foreground" aria-label={`Collection code ${so.collectionCode.split("").join(" ")}`}>
            {so.collectionCode}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">Say it to the agent at {order.pickupStation.name}. Never share it before you collect.</p>
        </div>
      )}

      {order.status === "PAID" && !so.deliveryMethod && so.fulfillmentStatus !== "CANCELLED" && so.fulfillmentStatus !== "DISPUTED" && (
        <Timeline status={so.fulfillmentStatus} />
      )}
      {/* Phase 6: delivery and pickup orders, step by step (C7: the code shows when it's due) */}
      {order.status === "PAID" && so.deliveryMethod && so.fulfillmentStatus !== "CANCELLED" && so.fulfillmentStatus !== "DISPUTED" && (
        <DeliverySteps method={so.deliveryMethod} status={so.fulfillmentStatus} />
      )}
      {so.rider && so.fulfillmentStatus !== "DELIVERED" && (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Bike size={16} className="shrink-0 text-main" />
          Your rider: {so.rider.name}
        </p>
      )}
      {so.deliveryMethod && so.collectionCode && !so.handoverLocked && (
        <div className="rounded-2xl bg-main-subtle px-4 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-main">Your handover code</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-foreground" aria-label={`Handover code ${so.collectionCode.split("").join(" ")}`}>
            {so.collectionCode}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {so.deliveryMethod === "DISPATCH"
              ? `Give it to ${so.rider?.name ?? "the rider"} when it reaches you, and not before.`
              : `Give it to the seller when you collect${so.pickupDeadline ? ` (by ${whenText(so.pickupDeadline)})` : ""}.`}
          </p>
        </div>
      )}
      {so.handoverLocked && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
          Too many wrong codes were entered, so this order is locked. CampusMart has been told and will be in touch.
        </p>
      )}
      {so.fulfillmentStatus === "CANCELLED" && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-foreground-muted">
          {order.status === "PAID"
            ? `${cancelReasonText(so.cancelReason)}. You've been refunded; banks usually take a few working days.`
            : `Cancelled${so.cancelReason === "PAYMENT_EXPIRED" ? ": not paid in time" : so.cancelReason === "BUYER_CANCELLED" ? " by you" : ""}`}
        </p>
      )}
      {so.fulfillmentStatus === "DISPUTED" && (
        <p className="rounded-xl bg-orange-50 px-3 py-2 text-xs text-main">You reported a problem with this order. CampusMart is looking into it.</p>
      )}
      {canReport(order, so) && (
        <button type="button" onClick={() => onReport(so)} className="self-start text-xs font-semibold text-main underline">
          Report a problem
          {so.releaseAt && ` (until ${whenText(so.releaseAt)})`}
        </button>
      )}

      <ul className="flex flex-col gap-3" aria-label={`Items from ${so.seller.storeName}`}>
        {so.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface-muted flex items-center justify-center text-foreground-muted">
              {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" /> : <ImageOff size={14} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.title}</p>
              <p className="text-xs text-foreground-muted">
                {item.variantLabel ? `${item.variantLabel} · ` : ""}
                {item.quantity} × {formatNaira(item.unitPriceKobo)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const query = useOrder(id);
  const cancel = useCancelOrder();
  const payments = usePaymentConfig();
  const payOrder = usePayOrder();
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState<SellerOrder | null>(null);
  const order = query.data;

  const header = (
    <div className="flex flex-col gap-2">
      <div className="px-5">
        <PageHeader title="Order details" />
      </div>
      <div className="w-full h-0.5 rounded-full bg-neutral-200" />
    </div>
  );

  if (query.isPending) {
    return (
      <main className="flex flex-col gap-4 pb-28 pt-8">
        {header}
        <div className="flex flex-col gap-3 px-5" aria-busy="true" aria-label="Loading your order">
          <div className="h-16 animate-pulse rounded-2xl bg-surface-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </main>
    );
  }
  if (query.isError || !order) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <main className="flex flex-col gap-4 pb-28 pt-8">
        {header}
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <p className="font-medium">{missing ? "We can't find this order" : "We couldn't load this order"}</p>
          {missing ? (
            <Link href="/orders" className="text-sm font-semibold text-main">
              See your orders
            </Link>
          ) : (
            <button type="button" onClick={() => query.refetch()} className="text-sm font-semibold text-main">
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  const station = order.pickupStation;
  // Decision P7: a fresh Paystack page, as often as needed until the order expires
  const payNow = async () => {
    try {
      const started = await payOrder.mutateAsync(order.id);
      window.location.assign(started.authorizationUrl);
    } catch (err) {
      toast.error("Couldn't open the payment page", err instanceof ApiError ? err.message : "Please try again");
      if (err instanceof ApiError && err.code === "ORDER_NOT_PAYABLE") void query.refetch();
    }
  };

  const confirmCancel = async () => {
    try {
      await cancel.mutateAsync(order.id);
      setConfirming(false);
      toast.success("Order cancelled", "Its items are back on sale");
    } catch (err) {
      setConfirming(false);
      toast.error("Couldn't cancel", err instanceof ApiError ? err.message : "Please try again");
    }
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main className="flex flex-col gap-4 pb-28 pt-8">
        {header}
        <div className="flex flex-col gap-4 px-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-foreground-muted">Placed {when.format(new Date(order.createdAt))}</p>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-lg font-bold">{formatNaira(order.totalKobo)}</p>
          </div>

          {order.status === "PENDING_PAYMENT" && (
            <div className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-start gap-2">
                <Clock size={16} className="text-main shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">
                  Waiting for payment. Your items are held until {time.format(new Date(order.expiresAt))}, then go back on sale.
                  {payments.data && !payments.data.paymentsEnabled && " Online payment isn't switched on yet."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {payments.data?.paymentsEnabled && (
                  <button
                    type="button"
                    onClick={payNow}
                    disabled={payOrder.isPending || payOrder.isSuccess}
                    className="rounded-full bg-main px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {payOrder.isPending || payOrder.isSuccess ? "Opening payment…" : `Pay ${formatNaira(order.totalKobo)} now`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="rounded-full border border-border-default bg-card px-4 py-1.5 text-sm font-semibold"
                >
                  Cancel order
                </button>
              </div>
            </div>
          )}
          {order.status === "EXPIRED" && (
            <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
              This order wasn&apos;t paid in time, so its items went back on sale. You weren&apos;t charged.
            </p>
          )}

          {order.destination && (
            <section aria-label="Delivery" className="flex flex-col gap-1.5 rounded-2xl border border-border-default bg-card p-4">
              <div className="flex items-start gap-2">
                <MapPin size={16} className="text-main shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold">{deliveryLine(order)}</p>
                  <p className="text-xs text-foreground-muted">
                    {order.destination.campusPlace
                      ? `Delivery fee ${formatNaira(order.deliveryFeeKobo)}, once for the whole order`
                      : "Off campus: the delivery fee is agreed with the rider"}
                  </p>
                </div>
              </div>
              {order.buyerPhone && <p className="pl-6 text-xs text-foreground-muted">The rider will call {order.buyerPhone}</p>}
            </section>
          )}

          {station && (
            <section aria-label="Pickup station" className="flex flex-col gap-2 rounded-2xl border border-border-default bg-card p-4">
              <div className="flex items-start gap-2">
                <MapPin size={16} className="text-main shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold">{station.name}</p>
                  <p className="text-xs text-foreground-muted">{station.address}</p>
                </div>
              </div>
              <div className="pl-6 text-xs text-foreground-muted">
                {summarizeOpeningHours(station.openingHours).map((line) => (
                  <p key={line.days}>
                    {line.days}: {line.hours}
                  </p>
                ))}
              </div>
              <a href={telHref(station.contactPhone)} className="flex items-center gap-2 pl-6 text-xs font-semibold text-main">
                <Phone size={12} />
                {station.contactName} · {station.contactPhone}
              </a>
            </section>
          )}

          {order.sellerOrders.map((so) => (
            <SellerOrderCard key={so.id} order={order} sellerOrder={so} onReport={setReporting} />
          ))}
        </div>
      </main>

      {reporting && (
        <ReportProblemDialog
          orderId={order.id}
          sellerOrderId={reporting.id}
          storeName={reporting.seller.storeName}
          handedOver={reporting.fulfillmentStatus === "DELIVERED" || reporting.fulfillmentStatus === "COLLECTED"}
          isOpen={!!reporting}
          onClose={() => setReporting(null)}
          onDone={(result) =>
            toast.success(
              result.kind === "DISPUTE" ? "Problem reported" : "CampusMart has been told",
              result.kind === "DISPUTE" ? "The seller's payout is on hold while we look into it" : "We'll look into it and get back to you",
            )
          }
        />
      )}

      <Modal isOpen={confirming} onClose={() => setConfirming(false)} title="Cancel this order?">
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-sm text-foreground-muted">Its items go back on sale and you won&apos;t be charged.</p>
          <button
            type="button"
            disabled={cancel.isPending}
            onClick={confirmCancel}
            className="w-full rounded-full bg-red-500 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {cancel.isPending ? "Cancelling…" : "Yes, cancel it"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="w-full rounded-full border border-border-default py-3 text-sm font-bold">
            Keep it
          </button>
        </div>
      </Modal>
    </>
  );
}
