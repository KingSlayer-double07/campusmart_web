"use client";

import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import type { BuyerProblemReason, ReportResult } from "@/lib/api/dispatch";
import { useReportProblem } from "@/lib/api/hooks/useProblems";
import { uploadImages } from "@/lib/uploads";

// Decision C8: before the order reaches the buyer, a problem alerts CampusMart; after, a dispute
// (F6, with up to 3 photos: F7) holds the seller's payout
const EARLY: { id: BuyerProblemReason; label: string }[] = [
  { id: "LATE", label: "It's late" },
  { id: "LOST", label: "I think it's lost" },
  { id: "OTHER", label: "Something else" },
];
const AFTER: { id: BuyerProblemReason; label: string }[] = [
  { id: "NOT_AS_DESCRIBED", label: "Not as described" },
  { id: "DAMAGED", label: "Damaged" },
  { id: "WRONG_ITEM", label: "Wrong item" },
  { id: "MISSING_ITEMS", label: "Items missing" },
  { id: "OTHER", label: "Something else" },
];
const MAX_PHOTOS = 3;

export default function ReportProblemDialog({
  orderId,
  sellerOrderId,
  storeName,
  handedOver,
  isOpen,
  onClose,
  onDone,
}: {
  orderId: string;
  sellerOrderId: string;
  storeName: string;
  handedOver: boolean;
  isOpen: boolean;
  onClose: () => void;
  onDone: (result: ReportResult) => void;
}) {
  const report = useReportProblem(orderId);
  const reasons = handedOver ? AFTER : EARLY;
  const [reason, setReason] = useState<BuyerProblemReason | null>(null);
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReason(null);
    setDetails("");
    setPhotos([]);
    setError(null);
  }, [isOpen]);

  const busy = uploading || report.isPending;

  const submit = async () => {
    if (!reason) return setError("Choose what went wrong");
    setError(null);
    try {
      let evidenceUrls: string[] | undefined;
      if (photos.length) {
        setUploading(true);
        evidenceUrls = (await uploadImages(photos, "DISPUTE", () => undefined)).map((p) => p.url);
        setUploading(false);
      }
      const result = await report.mutateAsync({
        sellerOrderId,
        body: { reason, ...(details.trim() && { details: details.trim() }), ...(evidenceUrls && { evidenceUrls }) },
      });
      onClose();
      onDone(result);
    } catch (err) {
      setUploading(false);
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't send. Please try again.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => undefined : onClose}
      title="Report a problem"
      footer={
        <button type="button" onClick={submit} disabled={busy} className="w-full rounded-full bg-main py-3.5 text-sm font-bold text-white disabled:opacity-50">
          {uploading ? "Uploading photos…" : report.isPending ? "Sending…" : "Send to CampusMart"}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">
          {handedOver
            ? `Your order from ${storeName}. The seller's payout waits while CampusMart looks into it.`
            : `Your order from ${storeName} hasn't reached you yet. CampusMart will look into it.`}
        </p>
        <div role="radiogroup" aria-label="What went wrong" className="flex flex-col gap-2">
          {reasons.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name="problem-reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
              {r.label}
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Tell us more (optional)
          <textarea
            rows={3}
            maxLength={1000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full resize-none rounded-xl border border-border-default bg-surface-muted px-3 py-2.5 text-sm font-normal focus:border-main focus:outline-none"
          />
        </label>
        {handedOver && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Photos (optional, up to {MAX_PHOTOS})</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((file, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-xs">
                  {file.name}
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="flex cursor-pointer items-center gap-1 rounded-full border border-border-default px-3 py-1 text-xs font-semibold text-main">
                  <ImagePlus size={14} /> Add photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setPhotos((p) => [...p, file].slice(0, MAX_PHOTOS));
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs font-medium text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
