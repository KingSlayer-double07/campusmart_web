"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ImageOff, ShieldCheck } from "lucide-react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import type { AdminVerificationRequest } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { useDecideVerification } from "@/lib/api/hooks/useAdminVerifications";
import { Field, TextArea } from "../components/fields";
import { sellerName } from "./sellerName";

const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });
const MIN_NOTE = 3;

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground break-words">{value}</dd>
    </div>
  );
}

// One request: the ID photo next to the account it should match, then Approve or Reject.
// Rejecting needs a note, which the seller sees (guide 9.2.3, decided 2026-10-09).
export default function ReviewDialog({
  isOpen,
  request,
  onClose,
  onReloadPhoto,
  onDecided,
}: {
  isOpen: boolean;
  request: AdminVerificationRequest | null;
  onClose: () => void;
  /** The photo link lasts 10 minutes; reloading the list issues a fresh one */
  onReloadPhoto: () => void;
  onDecided: (decided: AdminVerificationRequest) => void;
}) {
  const decide = useDecideVerification();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRejecting(false);
      setNote("");
      setNoteError(null);
      setApiError(null);
    }
  }, [isOpen]);
  useEffect(() => setPhotoBroken(false), [request?.documentViewUrl]);

  if (!request) return null;
  const pending = request.status === "PENDING";
  const name = sellerName(request.seller);

  const send = async (decision: "VERIFIED" | "REJECTED") => {
    const trimmed = note.trim();
    if (decision === "REJECTED" && trimmed.length < MIN_NOTE) {
      setNoteError("Tell the seller what to fix. They'll see this note.");
      return;
    }
    setApiError(null);
    try {
      const decided = await decide.mutateAsync({
        id: request.id,
        body: decision === "REJECTED" ? { decision, note: trimmed } : { decision },
      });
      onDecided(decided);
      onClose();
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  const busy = decide.isPending;
  const footer = !pending ? (
    <Button variant="outline" onClick={onClose}>
      Close
    </Button>
  ) : rejecting ? (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button variant="outline" className="sm:w-auto" disabled={busy} onClick={() => setRejecting(false)}>
        Back
      </Button>
      <Button variant="danger" className="sm:w-auto" loading={busy} onClick={() => send("REJECTED")}>
        Reject
      </Button>
    </div>
  ) : (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button variant="outline" className="sm:w-auto" disabled={busy} onClick={() => setRejecting(true)}>
        Reject…
      </Button>
      <Button className="sm:w-auto" loading={busy} onClick={() => send("VERIFIED")}>
        Approve seller
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => undefined : onClose}
      title={pending ? "Review seller" : "Verification"}
      headerIcon={
        <span className="flex size-10 items-center justify-center rounded-full bg-main-subtle text-main">
          <ShieldCheck size={18} />
        </span>
      }
      footer={footer}
    >
      <div className="flex flex-col gap-4 text-sm">
        {request.documentViewUrl && !photoBroken ? (
          <figure className="flex flex-col gap-2">
            {/* A signed Cloudinary download link that expires, so it skips Next's image optimiser */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={request.documentViewUrl}
              alt={`Student ID sent by ${name}`}
              onError={() => setPhotoBroken(true)}
              className="max-h-[45vh] w-full rounded-xl bg-surface-muted object-contain"
            />
            <a
              href={request.documentViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 self-start text-xs font-semibold text-main hover:underline"
            >
              Open full size
              <ExternalLink size={12} />
            </a>
          </figure>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-muted px-4 py-8 text-center">
            <ImageOff size={22} className="text-foreground-muted" />
            <p className="font-medium text-foreground">The photo can&apos;t be shown</p>
            <p className="text-xs text-foreground-muted">
              {request.documentViewUrl
                ? "The link lasts 10 minutes and may have expired."
                : "It wasn't uploaded through CampusMart, or uploads aren't set up."}
            </p>
            {request.documentViewUrl && (
              <button type="button" onClick={onReloadPhoto} className="text-sm font-semibold text-main">
                Reload photo
              </button>
            )}
          </div>
        )}

        <dl className="divide-y divide-border-default rounded-xl border border-border-default px-4">
          <Detail label="Name" value={name} />
          <Detail label="Email" value={request.seller.email} />
          <Detail label="Store" value={request.seller.storeName ?? "Not named yet"} />
          <Detail label="School" value={request.seller.institutionName ?? "None"} />
          <Detail label="Sent" value={when.format(new Date(request.createdAt))} />
          {request.reviewedAt && <Detail label="Decided" value={when.format(new Date(request.reviewedAt))} />}
          {request.reviewNote && <Detail label="Note to seller" value={request.reviewNote} />}
        </dl>

        {pending && !rejecting && (
          <p className="text-xs text-foreground-muted">
            Check that the name and school on the card match this account and that the card looks current. Approving
            lets this seller publish products.
          </p>
        )}

        {pending && rejecting && (
          <Field label="What should they fix?" htmlFor="verification-note" error={noteError} hint="The seller sees this note.">
            <TextArea
              id="verification-note"
              rows={3}
              maxLength={500}
              value={note}
              invalid={!!noteError}
              placeholder="For example: the photo is blurry, please retake it in good light"
              onChange={(e) => {
                setNote(e.target.value);
                setNoteError(null);
              }}
            />
          </Field>
        )}

        {apiError && (
          <div role="alert">
            <InfoBanner variant="error" title="Couldn't save the decision" text={apiError} />
          </div>
        )}
      </div>
    </Modal>
  );
}
