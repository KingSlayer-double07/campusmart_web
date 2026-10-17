"use client";

import Image from "next/image";
import { AlertTriangle, Bike, ImageOff, Lock, Store } from "lucide-react";
import type { SellerSideOrder } from "@/lib/api/dispatch";
import { FULFILLMENT_STATUS_LABELS, formatNaira } from "@/lib/labels";
import { cancelReasonText, dayText, whenText, windowText } from "@/lib/orderText";

const BADGE: Partial<Record<SellerSideOrder["fulfillmentStatus"], string>> = {
  AWAITING_RIDER: "border-orange-300 text-main",
  RIDER_ASSIGNED: "border-blue-300 text-seller-main",
  AWAITING_PICKUP: "border-orange-300 text-main",
  WITH_RIDER: "border-blue-300 text-seller-main",
  DELIVERED: "border-green-400 text-green-600",
  COLLECTED: "border-green-400 text-green-600",
  DISPUTED: "border-red-300 text-red-500",
  CANCELLED: "border-neutral-300 text-foreground-muted",
};

// What the seller should know or do next about this order (Phase 6)
export function nextStep(order: SellerSideOrder): string {
  switch (order.fulfillmentStatus) {
    case "AWAITING_RIDER":
      return order.pickupDeadline
        ? `Pack it. A rider will collect it by ${dayText(order.pickupDeadline)}.`
        : "Pack it. A rider will collect it.";
    case "RIDER_ASSIGNED":
      return order.arrivalFrom && order.arrivalTo
        ? `${order.rider?.name ?? "The rider"} comes ${windowText(order.arrivalFrom, order.arrivalTo)}. Give them the code ${order.code}.`
        : `${order.rider?.name ?? "A rider"} has the job and will say when they're coming.`;
    case "AWAITING_PICKUP":
      return order.pickupDeadline
        ? `The buyer collects it from you by ${dayText(order.pickupDeadline)}. Ask for their 3-digit code.`
        : "The buyer collects it from you. Ask for their 3-digit code.";
    case "WITH_RIDER":
      return `${order.rider?.name ?? "The rider"} has it and is taking it to the buyer.`;
    case "DELIVERED":
    case "COLLECTED":
      return order.escrowStatus === "RELEASED"
        ? "Handed over. Your payout has been released."
        : order.releaseAt
          ? `Handed over. Your payout is released ${whenText(order.releaseAt)} unless the buyer reports a problem.`
          : "Handed over.";
    case "DISPUTED":
      return "The buyer reported a problem. Your payout is on hold while CampusMart looks into it.";
    case "CANCELLED":
      return cancelReasonText(order.cancelReason);
    default:
      return FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus];
  }
}

// Guide 6.6: one card per seller order. No status menu: riders, buyers and the clock move orders on.
export default function OrderCard({ order }: { order: SellerSideOrder }) {
  const units = order.items.reduce((n, i) => n + i.quantity, 0);
  const image = order.items.find((i) => i.imageUrl)?.imageUrl;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted text-foreground-muted">
          {image ? <Image src={image} alt="" fill sizes="56px" className="object-cover" /> : <ImageOff size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-lg font-bold tracking-wide text-foreground">{order.code}</p>
          <p className="truncate text-xs text-foreground-muted">
            {order.items[0]?.title}
            {order.items.length > 1 ? ` and ${order.items.length - 1} more` : ""} · {units} {units === 1 ? "item" : "items"}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-foreground-muted">
            {order.deliveryMethod === "SELLER_PICKUP" ? <Store size={12} /> : <Bike size={12} />}
            {order.deliveryMethod === "SELLER_PICKUP" ? "Buyer collects from you" : "Delivered by a rider"} · for {order.buyerName}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${BADGE[order.fulfillmentStatus] ?? "border-neutral-300 text-foreground-muted"}`}
          >
            {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus]}
          </span>
          <span className="text-sm font-bold text-seller-main">{formatNaira(order.sellerPayoutKobo)}</span>
        </div>
      </div>
      <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-foreground">{nextStep(order)}</p>
      {order.notReadyAt && order.fulfillmentStatus === "RIDER_ASSIGNED" && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-main">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          The rider found it not ready. Have it ready when they come back, or it will be cancelled.
        </p>
      )}
      {order.handoverLocked && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-500">
          <Lock size={14} /> Locked after wrong codes. CampusMart will unlock it.
        </p>
      )}
    </div>
  );
}
