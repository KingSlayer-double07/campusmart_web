"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import type { AdminDeliveryJob, Fault } from "@/lib/api/dispatch";
import { useAdminRefund } from "@/lib/api/hooks/useAdminDispatch";
import { Field, Select, TextArea } from "../components/fields";

const FAULTS: { id: Fault; label: string }[] = [
  { id: "NONE", label: "Nobody's (CampusMart absorbs the fee)" },
  { id: "SELLER", label: "The seller's (counts against their store)" },
  { id: "BUYER", label: "The buyer's (their share of the payment fee is kept)" },
];

// Decisions DX6 and DL8: a parcel lost with the rider, or a buyer who didn't show; the admin
// refunds that store's order and says whose fault it was (P6)
export default function RefundStoreDialog({ job, onClose, onRefunded }: { job: AdminDeliveryJob | null; onClose: () => void; onRefunded: (code: string) => void }) {
  const refund = useAdminRefund();
  const stores = job?.stops.filter((s) => !["CANCELLED", "DELIVERED", "DISPUTED"].includes(s.status)) ?? [];
  const [sellerOrderId, setSellerOrderId] = useState("");
  const [fault, setFault] = useState<Fault>("NONE");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSellerOrderId(stores.length === 1 ? stores[0].sellerOrderId : "");
    setFault("NONE");
    setReason("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerOrderId) return setError("Choose the store's order to refund");
    if (reason.trim().length < 3) return setError("Give a reason; it's kept in the audit log");
    try {
      await refund.mutateAsync({ sellerOrderId, fault, reason: reason.trim() });
      onRefunded(stores.find((s) => s.sellerOrderId === sellerOrderId)?.code ?? "");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't refund. Please try again.");
    }
  };

  return (
    <Modal
      isOpen={!!job}
      onClose={refund.isPending ? () => undefined : onClose}
      title="Refund a store's order"
      className="sm:max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={refund.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="refund-form" variant="danger" className="sm:w-auto" loading={refund.isPending}>
            Refund
          </Button>
        </div>
      }
    >
      <form id="refund-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <p className="text-sm text-foreground-muted">The buyer gets their money back for that store and its items go back on sale.</p>
        <Field label="Store's order" htmlFor="refund-store">
          <Select id="refund-store" value={sellerOrderId} onChange={(e) => setSellerOrderId(e.target.value)}>
            <option value="">Choose one</option>
            {stores.map((s) => (
              <option key={s.sellerOrderId} value={s.sellerOrderId}>
                {s.code} · {s.storeName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Whose fault was it?" htmlFor="refund-fault">
          <Select id="refund-fault" value={fault} onChange={(e) => setFault(e.target.value as Fault)}>
            {FAULTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" htmlFor="refund-reason" error={error}>
          <TextArea id="refund-reason" rows={3} value={reason} maxLength={500} invalid={!!error} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The rider lost the parcel" />
        </Field>
      </form>
    </Modal>
  );
}
