"use client";

import { useEffect, useState } from "react";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import { useReportListing } from "@/lib/api/hooks/useReportListing";
import { REPORT_REASON_LABELS, type ReportReason } from "@/lib/api/moderation";
import { cn } from "@/lib/utils/cn";

const REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

// Guide 9.1 rule 3 with decisions M4 and M4b: tell CampusMart what's wrong with a listing.
// Five reports send it to the admins; a prohibited-item report hides it until one checks it.
export default function ReportListingSheet({
  listingId,
  isOpen,
  onClose,
  onReported,
}: {
  listingId: string;
  isOpen: boolean;
  onClose: () => void;
  onReported: (hidden: boolean) => void;
}) {
  const report = useReportListing();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReason(null);
    setDetails("");
    setError(null);
  }, [isOpen]);

  const submit = async () => {
    if (!reason) {
      setError("Choose what's wrong");
      return;
    }
    try {
      const receipt = await report.mutateAsync({
        listingId,
        reason,
        ...(details.trim() && { details: details.trim() }),
      });
      onReported(receipt.hidden);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={report.isPending ? () => undefined : onClose} title="Report this listing">
      <div className="mt-2 flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">Only CampusMart sees your report. The seller isn&apos;t told who sent it.</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">What&apos;s wrong</legend>
          {REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition",
                reason === r ? "border-main bg-main-subtle" : "border-border-default",
              )}
            >
              <input
                type="radio"
                name="report-reason"
                value={r}
                checked={reason === r}
                onChange={() => {
                  setReason(r);
                  setError(null);
                }}
                className="accent-main"
              />
              {REPORT_REASON_LABELS[r]}
            </label>
          ))}
        </fieldset>
        {reason === "PROHIBITED_ITEM" && (
          <p className="text-xs text-foreground-muted">The listing is hidden from buyers until an admin checks it.</p>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Anything else? (optional)
          <textarea
            rows={3}
            maxLength={500}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="resize-none rounded-xl border border-border-default bg-surface-muted px-4 py-3 text-sm font-normal focus:border-main focus:outline-none focus:ring-2 focus:ring-main/30"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-500">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={report.isPending}
          className="w-full rounded-full bg-main py-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {report.isPending ? "Sending…" : "Send report"}
        </button>
      </div>
    </Modal>
  );
}
