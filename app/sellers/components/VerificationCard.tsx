"use client";

import { useRef, useState } from "react";
import { AlertCircle, Clock, Lock, ShieldCheck, Upload } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useMyVerification, useSubmitVerification } from "@/lib/api/hooks/useSellerVerification";
import { uploadImages } from "@/lib/uploads";

const sentOn = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

function problemMessage(err: unknown) {
  if (err instanceof ApiError) {
    return err.code === "UPLOADS_NOT_CONFIGURED"
      ? "Photo uploads aren't set up yet. Please try again later."
      : err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

// Guide 9.2.5: sellers send a photo of their student ID; an admin approves it before their
// products can go live (decided 2026-10-09). Hidden once the seller is verified.
export default function VerificationCard() {
  const { data, isPending, isError, refetch } = useMyVerification();
  const submit = useSubmitVerification();
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (isPending) {
    return <div className="h-36 rounded-lg bg-card animate-pulse" aria-busy="true" aria-label="Loading verification" />;
  }
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border-default bg-card p-5 text-center">
        <p className="text-sm text-foreground-muted">We couldn&apos;t check your verification.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-seller-main">
          Try again
        </button>
      </div>
    );
  }
  if (data.status === "VERIFIED") return null;

  const sending = progress !== null;
  const send = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setProgress(0);
    try {
      const [photo] = await uploadImages([file], "VERIFICATION", (_index, fraction) => setProgress(fraction));
      await submit.mutateAsync(photo.url);
    } catch (err) {
      setProblem(problemMessage(err));
    } finally {
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const request = data.latestRequest;
  const rejected = data.status === "REJECTED";
  const pending = data.status === "PENDING";

  return (
    <section
      id="verification"
      aria-labelledby="verification-title"
      className={`flex flex-col gap-3 rounded-lg border p-5 ${rejected ? "border-red-200 bg-red-50/60" : "border-blue-200 bg-card"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${rejected ? "bg-red-100 text-red-500" : "bg-blue-100 text-seller-main"}`}
        >
          {rejected ? <AlertCircle size={20} /> : pending ? <Clock size={20} /> : <ShieldCheck size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="verification-title" className="text-sm font-semibold text-foreground">
            {rejected
              ? "Your student ID wasn't approved"
              : pending
                ? "We're checking your student ID"
                : "Get verified to start selling"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-foreground-muted">
            {rejected
              ? "Send a new photo and we'll check it again."
              : pending
                ? "An admin will review it soon. You can keep adding products as drafts; they go live once you're approved."
                : "Send a clear photo of your student ID. Once an admin approves it, your products can go live. Until then you can save drafts."}
          </p>
          {pending && request && (
            <p className="mt-1 text-xs text-foreground-muted">Sent {sentOn.format(new Date(request.createdAt))}</p>
          )}
        </div>
      </div>

      {rejected && request?.reviewNote && (
        <blockquote className="rounded-xl bg-card px-4 py-3 text-sm text-foreground">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Note from CampusMart</p>
          <p className="mt-1">{request.reviewNote}</p>
        </blockquote>
      )}

      {!pending && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Student ID photo"
            onChange={(e) => void send(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={sending}
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-seller-main py-3 text-sm font-bold text-white transition-all hover:bg-seller-hover active:scale-[0.98] disabled:opacity-60"
          >
            <Upload size={16} />
            {sending
              ? `Sending… ${Math.round((progress ?? 0) * 100)}%`
              : rejected
                ? "Send a new photo"
                : "Upload student ID"}
          </button>
          <p className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
            <Lock size={12} />
            Only CampusMart admins can see this photo.
          </p>
        </>
      )}

      {problem && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {problem}
        </p>
      )}
    </section>
  );
}
