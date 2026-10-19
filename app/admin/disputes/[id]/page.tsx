"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { ApiError } from "@/lib/api/client";
import type { Fault } from "@/lib/api/dispatch";
import { useAdminDispute, useResolveDispute } from "@/lib/api/hooks/useAdminDispatch";
import { formatNaira } from "@/lib/labels";
import { whenText } from "@/lib/orderText";
import AdminPageHeader from "../../components/AdminPageHeader";
import { Field, Select, TextArea } from "../../components/fields";
import { reasonLabel } from "../labels";

const FAULTS: { id: Fault; label: string }[] = [
  { id: "SELLER", label: "The seller's (counts against their store)" },
  { id: "BUYER", label: "The buyer's (their share of the payment fee is kept)" },
  { id: "NONE", label: "Nobody's (CampusMart absorbs the fee)" },
];

const FAULT_TEXT: Record<Fault, string> = { SELLER: "the seller's fault", BUYER: "the buyer's fault", NONE: "nobody's fault" };

// Decision F8: a full refund of that store's order, with whose fault it was (P6), or a full
// release to the seller. An item to return is arranged outside the app and noted here (F9).
export default function AdminDisputePage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const query = useAdminDispute(id);
  const resolve = useResolveDispute(id);
  const [outcome, setOutcome] = useState<"REFUND" | "RELEASE" | null>(null);
  const [fault, setFault] = useState<Fault>("SELLER");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dispute = query.data;

  const back = (
    <Link href="/admin/disputes" className="flex items-center gap-1 text-sm font-semibold text-foreground-muted">
      <ArrowLeft size={16} /> Disputes
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the dispute">
        {back}
        <div className="h-48 animate-pulse rounded-2xl bg-surface-muted" />
      </div>
    );
  }
  if (query.isError || !dispute) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <InfoBanner variant="error" text={query.error instanceof ApiError && query.error.status === 404 ? "We can't find this dispute." : "We couldn't load this dispute."} />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome) return setError("Choose refund or release");
    if (note.trim().length < 3) return setError("Explain the decision; both sides see it");
    setError(null);
    try {
      const done = await resolve.mutateAsync({ outcome, note: note.trim(), ...(outcome === "REFUND" && { fault }) });
      toast.success(done.status === "RESOLVED_REFUND" ? "Refunded" : "Released", "Both sides have been told");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the decision. Please try again.");
    }
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex max-w-2xl flex-col gap-6">
        {back}
        <AdminPageHeader title={`Dispute on ${dispute.code}`} description={`${dispute.storeName} · bought by ${dispute.buyerName}`} />

        <section className="flex flex-col gap-3 rounded-2xl border border-border-default bg-card p-5 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <p>
              <span className="block text-xs text-foreground-muted">Reason</span>
              <span className="font-semibold">{reasonLabel(dispute.reason)}</span>
            </p>
            <p>
              <span className="block text-xs text-foreground-muted">Items</span>
              <span className="font-semibold">{formatNaira(dispute.subtotalKobo)}</span>
            </p>
            <p>
              <span className="block text-xs text-foreground-muted">Handed over</span>
              {dispute.handedOverAt ? whenText(dispute.handedOverAt) : "—"}
              {dispute.deliveryMethod === "SELLER_PICKUP" ? " (collected from the seller)" : " (by a rider)"}
            </p>
            <p>
              <span className="block text-xs text-foreground-muted">Opened</span>
              {whenText(dispute.createdAt)}
            </p>
          </div>
          {dispute.details && (
            <p className="rounded-xl bg-surface-muted px-3 py-2">
              <span className="block text-xs text-foreground-muted">The buyer says</span>
              {dispute.details}
            </p>
          )}
          {dispute.evidenceUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dispute.evidenceUrls.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-main underline">
                  Photo {i + 1}
                </a>
              ))}
            </div>
          )}
        </section>

        {dispute.status === "OPEN" ? (
          <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-2xl border border-border-default bg-card p-5">
            <div role="radiogroup" aria-label="Decision" className="flex flex-col gap-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="radio" name="outcome" checked={outcome === "REFUND"} onChange={() => setOutcome("REFUND")} className="mt-1" />
                <span>
                  <span className="font-semibold">Refund the buyer</span>
                  <span className="block text-xs text-foreground-muted">The whole store order. Arrange any return of the item outside the app and note it below.</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="outcome" checked={outcome === "RELEASE"} onChange={() => setOutcome("RELEASE")} className="mt-1" />
                <span>
                  <span className="font-semibold">Release to the seller</span>
                  <span className="block text-xs text-foreground-muted">The seller is paid now.</span>
                </span>
              </label>
            </div>
            {outcome === "REFUND" && (
              <Field label="Whose fault was it?" htmlFor="dispute-fault">
                <Select id="dispute-fault" value={fault} onChange={(e) => setFault(e.target.value as Fault)}>
                  {FAULTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Decision note" htmlFor="dispute-note" hint="The buyer and the seller both see it" error={error}>
              <TextArea id="dispute-note" rows={4} maxLength={1000} value={note} invalid={!!error} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button type="submit" className="sm:w-auto sm:self-end" loading={resolve.isPending}>
              Save decision
            </Button>
          </form>
        ) : (
          <section className="rounded-2xl border border-border-default bg-card p-5 text-sm">
            <p className="font-semibold">
              {dispute.status === "RESOLVED_REFUND" ? `Refunded: ${FAULT_TEXT[dispute.fault ?? "NONE"]}` : "Released to the seller"}
              {dispute.resolvedAt && <span className="font-normal text-foreground-muted"> · {whenText(dispute.resolvedAt)}</span>}
            </p>
            {dispute.resolutionNote && <p className="mt-1 text-foreground-muted">{dispute.resolutionNote}</p>}
          </section>
        )}
      </div>
    </>
  );
}
