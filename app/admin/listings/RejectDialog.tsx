"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import { useModerateListing } from "@/lib/api/hooks/useAdminModeration";
import { REJECT_REASON_LABELS, type AdminListing, type RejectReason } from "@/lib/api/moderation";
import { Field, Select, TextArea } from "../components/fields";

const REASONS = Object.keys(REJECT_REASON_LABELS) as RejectReason[];

// Decision M3: a moderator picks why; the seller sees it with the note. A prohibited item that
// buyers could see suspends the seller (M4d, M4e), but not one held before it went live (M4f).
export default function RejectDialog({
  listing,
  isOpen,
  onClose,
  onRejected,
}: {
  listing: AdminListing | null;
  isOpen: boolean;
  onClose: () => void;
  onRejected: (listing: AdminListing, sellerSuspended: boolean) => void;
}) {
  const moderate = useModerateListing();
  const [reason, setReason] = useState<RejectReason | "">("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ reason?: string | null; form?: string | null }>({});

  useEffect(() => {
    if (!isOpen) return;
    setReason("");
    setNote("");
    setErrors({});
  }, [isOpen, listing]);

  const suspends = reason === "PROHIBITED_ITEM" && !!listing?.wentLive && !listing.sellerSuspended;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listing) return;
    if (!reason) {
      setErrors({ reason: "Choose why you're taking it down" });
      return;
    }
    try {
      const updated = await moderate.mutateAsync({
        id: listing.id,
        type: "REJECT",
        reason,
        ...(note.trim() && { note: note.trim() }),
      });
      onRejected(updated, suspends && updated.sellerSuspended);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={moderate.isPending ? () => undefined : onClose}
      title="Take this listing down?"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={moderate.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="reject-form" variant="danger" className="sm:w-auto" loading={moderate.isPending}>
            {suspends ? "Take down and suspend" : "Take down"}
          </Button>
        </div>
      }
    >
      <form id="reject-form" onSubmit={submit} noValidate className="flex flex-col gap-4 text-sm">
        <p className="text-foreground-muted">
          &ldquo;{listing?.title}&rdquo; stops showing to buyers. {listing?.storeName} sees your reason and can edit it to send it
          for review again.
        </p>
        <Field label="Reason" htmlFor="reject-reason" error={errors.reason}>
          <Select
            id="reject-reason"
            value={reason}
            invalid={!!errors.reason}
            onChange={(e) => {
              setReason(e.target.value as RejectReason);
              setErrors({});
            }}
          >
            <option value="">Choose a reason</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {REJECT_REASON_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note for the seller (optional)" htmlFor="reject-note" hint="Shown to the seller with the reason.">
          <TextArea id="reject-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {suspends && (
          <InfoBanner
            variant="warning"
            title="The seller will be suspended"
            text="Buyers could see this listing, so confirming a prohibited item suspends the seller until an admin lifts it. Their other live listings come down too."
          />
        )}
        {reason === "PROHIBITED_ITEM" && listing && !listing.wentLive && (
          <p className="text-xs text-foreground-muted">
            Buyers never saw this listing (it was held before going live), so the seller won&apos;t be suspended.
          </p>
        )}
        {errors.form && (
          <div role="alert">
            <InfoBanner variant="error" title="Couldn't take it down" text={errors.form} />
          </div>
        )}
      </form>
    </Modal>
  );
}
