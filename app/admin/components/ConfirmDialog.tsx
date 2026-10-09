"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import { Field, TextArea } from "./fields";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: "danger" | "default";
  /** Destructive actions need a reason, which is sent to the API (guide 9.2.3) */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => Promise<unknown>;
}

const MIN_REASON = 3;

export default function ConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "danger",
  requireReason = tone === "danger",
  reasonPlaceholder = "For example: the term has ended",
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  // Why the API refused, e.g. "University of Lagos has 3 orders in progress…"
  const [apiError, setApiError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setReasonError(null);
      setApiError(null);
    }
  }, [isOpen]);

  const confirm = async () => {
    const trimmed = reason.trim();
    if (requireReason && trimmed.length < MIN_REASON) {
      setReasonError("Please give a reason. It's saved in the audit log.");
      return;
    }
    setPending(true);
    setApiError(null);
    try {
      await onConfirm(requireReason ? trimmed : undefined);
      onClose();
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const Icon = tone === "danger" ? AlertTriangle : Info;

  return (
    <Modal
      isOpen={isOpen}
      onClose={pending ? () => undefined : onClose}
      title={title}
      headerIcon={
        <span
          className={`flex size-10 items-center justify-center rounded-full ${tone === "danger" ? "bg-red-50 text-red-500" : "bg-main-subtle text-main"}`}
        >
          <Icon size={18} />
        </span>
      }
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            className="sm:w-auto"
            onClick={confirm}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-foreground-muted">
        <div>{description}</div>
        {requireReason && (
          <Field label="Reason" htmlFor="confirm-reason" error={reasonError}>
            <TextArea
              id="confirm-reason"
              rows={3}
              maxLength={500}
              value={reason}
              invalid={!!reasonError}
              placeholder={reasonPlaceholder}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
            />
          </Field>
        )}
        {apiError && (
          <div role="alert">
            <InfoBanner variant="error" title={`Couldn't ${confirmLabel.toLowerCase()}`} text={apiError} />
          </div>
        )}
      </div>
    </Modal>
  );
}
