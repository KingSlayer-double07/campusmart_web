"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bike, ImageOff, Store } from "lucide-react";
import CodeQr from "@/app/components/CodeQr";
import Modal from "@/app/components/Modal";
import PageHeader from "@/app/components/PageHeader";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { ApiError } from "@/lib/api/client";
import { useCancelSellerOrder, useSellerHandover, useSellerOrder } from "@/lib/api/hooks/useSellerOrders";
import { FULFILLMENT_STATUS_LABELS, formatNaira } from "@/lib/labels";
import { whenText } from "@/lib/orderText";
import { nextStep } from "../../components/OrderCard";

const inputClass =
  "w-full bg-surface-muted border border-border-default rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-seller-main/30 focus:border-seller-main transition aria-invalid:border-red-400";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-foreground-muted">{children}</p>;
}

// Decision DL5: a buyer collecting from the seller gives their 3-digit code; the seller enters it
function HandoverForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const handOver = useSellerHandover(orderId);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{3}$/.test(code.trim())) return setError("Enter the buyer’s 3-digit code");
    setError(null);
    try {
      await handOver.mutateAsync(code.trim());
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t check the code. Please try again.");
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 rounded-3xl border border-border-default bg-card p-4">
      <label htmlFor="buyer-code" className="text-sm font-semibold text-foreground">
        Buyer’s code
      </label>
      <p className="text-xs text-foreground-muted">When the buyer collects, ask for their 3-digit code and enter it here.</p>
      <div className="flex gap-2">
        <input
          id="buyer-code"
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          value={code}
          placeholder="000"
          aria-invalid={!!error}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={`${inputClass} font-mono text-lg tracking-[0.4em]`}
        />
        <button
          type="submit"
          disabled={handOver.isPending}
          className="shrink-0 rounded-xl bg-seller-main px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {handOver.isPending ? "Checking…" : "Hand over"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-500">
          {error}
        </p>
      )}
    </form>
  );
}

// Decision F10: before the parcel leaves the seller. The buyer is refunded and it counts against the store.
function CancelDialog({ orderId, isOpen, onClose, onDone }: { orderId: string; isOpen: boolean; onClose: () => void; onDone: () => void }) {
  const cancel = useCancelSellerOrder(orderId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 3) return setError("Say why, in a few words");
    try {
      await cancel.mutateAsync(reason.trim());
      onClose();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t cancel. Please try again.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={cancel.isPending ? () => undefined : onClose}
      title="Cancel this order?"
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={cancel.isPending}
          className="w-full rounded-full bg-red-500 py-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {cancel.isPending ? "Cancelling…" : "Cancel and refund the buyer"}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground-muted">
          The buyer gets their money back and the items go back on sale. A cancellation counts against your store’s trust score.
        </p>
        <label htmlFor="cancel-reason" className="text-sm font-semibold text-foreground">
          Why?
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          maxLength={300}
          value={reason}
          placeholder="e.g. It sold out in my shop"
          aria-invalid={!!error}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          className={`${inputClass} resize-none`}
        />
        {error && (
          <p role="alert" className="text-xs font-medium text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default function SellerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const query = useSellerOrder(id);
  const [cancelling, setCancelling] = useState(false);
  const order = query.data;

  const shell = (body: React.ReactNode) => (
    <main className="flex min-h-dvh w-full max-w-md flex-col bg-surface-muted pb-40">
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="bg-card px-4 pb-4 pt-10">
        <PageHeader title="Order details" showBack />
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">{body}</div>
    </main>
  );

  if (query.isPending) {
    return shell(
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the order">
        <div className="h-40 animate-pulse rounded-3xl bg-card" />
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
      </div>,
    );
  }
  if (query.isError || !order) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return shell(
      <div className="flex flex-col items-center gap-2 py-24 text-center">
        <p className="text-sm font-medium">{missing ? "We can’t find this order" : "We couldn’t load this order"}</p>
        {missing ? (
          <Link href="/sellers/orders" className="text-sm font-semibold text-seller-main">
            See your orders
          </Link>
        ) : (
          <button type="button" onClick={() => query.refetch()} className="text-sm font-semibold text-seller-main">
            Try again
          </button>
        )}
      </div>,
    );
  }

  const awaitingRider = order.deliveryMethod === "DISPATCH" && (order.fulfillmentStatus === "AWAITING_RIDER" || order.fulfillmentStatus === "RIDER_ASSIGNED");
  const awaitingBuyer = order.deliveryMethod === "SELLER_PICKUP" && order.fulfillmentStatus === "AWAITING_PICKUP";

  return shell(
    <>
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-border-default bg-card p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Order code</p>
        <p className="font-mono text-3xl font-bold tracking-wider text-foreground">{order.code}</p>
        {awaitingRider && (
          <>
            <CodeQr value={order.code} />
            <p className="text-xs text-foreground-muted">The rider scans this or types the code when they collect.</p>
          </>
        )}
        <span className="rounded-full border border-border-default px-3 py-1 text-xs font-semibold">
          {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus]}
        </span>
        <p className="text-sm text-foreground">{nextStep(order)}</p>
      </div>

      {awaitingBuyer && !order.handoverLocked && (
        <HandoverForm orderId={order.id} onDone={() => toast.success("Handed over", "Your payout follows in 48 hours")} />
      )}
      {order.handoverLocked && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          Too many wrong codes were entered, so this order is locked. CampusMart has been told and will unlock it.
        </p>
      )}

      <SectionLabel>How it reaches the buyer</SectionLabel>
      <div className="flex items-start gap-3 rounded-3xl border border-border-default bg-card p-4 text-sm">
        {order.deliveryMethod === "SELLER_PICKUP" ? <Store size={18} className="mt-0.5 text-seller-main" /> : <Bike size={18} className="mt-0.5 text-seller-main" />}
        <div className="min-w-0">
          <p className="font-semibold">
            {order.deliveryMethod === "SELLER_PICKUP" ? `${order.buyerName} collects it from you` : "A CampusMart rider collects it from you"}
          </p>
          {order.rider && <p className="text-xs text-foreground-muted">Rider: {order.rider.name}</p>}
          {order.pickedUpAt && <p className="text-xs text-foreground-muted">Collected from you {whenText(order.pickedUpAt)}</p>}
          {order.handedOverAt && <p className="text-xs text-foreground-muted">Handed over {whenText(order.handedOverAt)}</p>}
          {order.notReadyNote && <p className="text-xs text-main">Rider’s note: {order.notReadyNote}</p>}
        </div>
      </div>

      <SectionLabel>Items</SectionLabel>
      <ul className="flex flex-col gap-3 rounded-3xl border border-border-default bg-card p-4">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted text-foreground-muted">
              {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" /> : <ImageOff size={14} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.title}</p>
              <p className="text-xs text-foreground-muted">
                {item.variantLabel ? `${item.variantLabel} · ` : ""}
                {item.quantity} × {formatNaira(item.unitPriceKobo)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <SectionLabel>Money</SectionLabel>
      <div className="flex flex-col gap-2 rounded-3xl border border-border-default bg-card p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-foreground-muted">Items</span>
          <span>{formatNaira(order.subtotalKobo)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Your payout</span>
          <span className="text-seller-main">{formatNaira(order.sellerPayoutKobo)}</span>
        </div>
        {order.releaseAt && order.escrowStatus === "HELD" && (
          <p className="text-xs text-foreground-muted">Released {whenText(order.releaseAt)} unless the buyer reports a problem.</p>
        )}
      </div>

      {order.canCancel && (
        <button
          type="button"
          onClick={() => setCancelling(true)}
          className="w-full rounded-full border border-red-200 py-3 text-sm font-bold text-red-500"
        >
          Cancel order
        </button>
      )}
      <CancelDialog
        orderId={order.id}
        isOpen={cancelling}
        onClose={() => setCancelling(false)}
        onDone={() => toast.success("Order cancelled", "The buyer is being refunded")}
      />
    </>,
  );
}
