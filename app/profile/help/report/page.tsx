"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImagePlus, Send, X } from "lucide-react";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import PageHero from "../../../components/PageHero";
import { ToastContainer, useToast } from "../../../components/Toast";
import { ApiError } from "@/lib/api/client";
import { useSendSupportReport } from "@/lib/api/hooks/useSupport";
import { SUPPORT_TYPE_LABELS, type SupportType } from "@/lib/api/support";
import { uploadImages } from "@/lib/uploads";

const MIN_CHARS = 10;
const MAX_CHARS = 2000;
const TYPES = Object.keys(SUPPORT_TYPE_LABELS) as SupportType[];

// Guide 10: a report goes to the admins' queue. A listing is reported from its own page.
export default function ReportPage() {
  const router = useRouter();
  const toast = useToast();
  const send = useSendSupportReport();
  const fileInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<SupportType | "">("");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [includeDevice, setIncludeDevice] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!type) {
      setError("Choose what it's about");
      return;
    }
    if (message.trim().length < MIN_CHARS) {
      setError(`Tell us what happened in at least ${MIN_CHARS} characters`);
      return;
    }
    setError(null);
    try {
      let screenshotUrl: string | undefined;
      if (screenshot) {
        setUploading(true);
        [{ url: screenshotUrl }] = await uploadImages([screenshot], "SUPPORT", () => undefined);
      }
      const device = includeDevice ? `\n\nDevice: ${navigator.userAgent}` : "";
      await send.mutateAsync({ type, message: `${message.trim()}${device}`.slice(0, MAX_CHARS), screenshotUrl });
      toast.success("Report sent", "Our team will look into it");
      setTimeout(() => router.back(), 1500);
    } catch (err) {
      if (err instanceof ApiError && err.code === "UPLOADS_NOT_CONFIGURED") {
        setError("Screenshots can't be uploaded yet. Remove it and send the report without one.");
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || send.isPending;

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} duration={4000} />
      <main className="px-6 pb-36 pt-8">
        <PageHeader title="Report a Problem" showBack />
        <PageHero icon={AlertTriangle} title="Help us fix issues by reporting them" />

        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-foreground">What is it about?</legend>
            {TYPES.map((t) => (
              <label
                key={t}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${type === t ? "border-main bg-main-subtle" : "border-border-default"}`}
              >
                <input type="radio" name="support-type" value={t} checked={type === t} onChange={() => setType(t)} className="accent-main" />
                {SUPPORT_TYPE_LABELS[t]}
              </label>
            ))}
            <p className="text-xs text-foreground-muted">
              A problem with a listing? Use &ldquo;Report this listing&rdquo; on its page. A problem with an order you received? Open it from{" "}
              <Link href="/orders" className="font-semibold text-main">
                your orders
              </Link>
              .
            </p>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-message" className="text-sm font-medium text-foreground">
              What happened?
            </label>
            <textarea
              id="report-message"
              rows={5}
              maxLength={MAX_CHARS - 300}
              placeholder="What you did, what you expected, and what happened instead. An order code (CM-…) helps."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full resize-none rounded-2xl bg-surface-muted px-4 py-3.5 text-sm text-foreground outline-none transition placeholder-neutral-400 focus:ring-2 focus:ring-main/30"
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">
              Screenshot <span className="font-normal text-foreground-muted">(optional)</span>
            </p>
            {screenshot ? (
              <div className="flex items-center gap-2 self-start rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-main">
                <span className="max-w-[180px] truncate">{screenshot.name}</span>
                <button type="button" aria-label="Remove screenshot" onClick={() => setScreenshot(null)}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex items-center gap-2 self-start rounded-full border border-dashed border-border-default px-4 py-2 text-sm text-foreground-muted"
              >
                <ImagePlus size={16} />
                Add a screenshot
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              aria-label="Choose a screenshot"
              className="hidden"
              onChange={(e) => {
                setScreenshot(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          <label className="flex items-center justify-between py-1 text-sm font-medium text-foreground">
            Include my device and browser
            <input type="checkbox" checked={includeDevice} onChange={(e) => setIncludeDevice(e.target.checked)} className="size-4 accent-main" />
          </label>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-main py-4 text-[15px] font-semibold text-white shadow-lg shadow-main/30 transition-all disabled:opacity-50"
          >
            <Send size={16} />
            {uploading ? "Uploading…" : send.isPending ? "Sending…" : "Send report"}
          </button>
        </form>
      </main>
      <Nav />
    </>
  );
}
