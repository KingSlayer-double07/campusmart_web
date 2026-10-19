"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Phone, User } from "lucide-react";
import Modal from "@/app/components/Modal";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { ApiError } from "@/lib/api/client";
import type { RiderProblemReason } from "@/lib/api/dispatch";
import { useDropJob, useRiderJob, useRiderReport } from "@/lib/api/hooks/useRiderJobs";
import { formatNaira } from "@/lib/labels";
import { whenText } from "@/lib/orderText";
import AcceptJobForm from "../../../components/AcceptJobForm";
import StopCard from "../../../components/StopCard";

const field =
  "w-full rounded-xl border border-border-default bg-surface-muted px-3 py-2.5 text-sm focus:border-main focus:outline-none focus:ring-2 focus:ring-main/30";
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

const REASONS: { id: RiderProblemReason; label: string }[] = [
  { id: "BUYER_NO_SHOW", label: "The buyer didn't show or answer" },
  { id: "OTHER", label: "Something else" },
];

export default function RiderJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const query = useRiderJob(id);
  const drop = useDropJob(id);
  const report = useRiderReport(id);
  const [dropping, setDropping] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<RiderProblemReason>("BUYER_NO_SHOW");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const job = query.data;

  const back = (
    <Link href="/dispatch" className="flex items-center gap-1 text-sm font-semibold text-foreground-muted">
      <ArrowLeft size={16} /> Jobs
    </Link>
  );

  if (query.isPending) {
    return (
      <main className="flex flex-col gap-3 px-4 pt-4" aria-busy="true" aria-label="Loading the job">
        {back}
        <div className="h-28 animate-pulse rounded-2xl bg-card" />
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </main>
    );
  }
  if (query.isError || !job) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <main className="flex flex-col gap-3 px-4 pt-4">
        {back}
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <p className="text-sm font-medium">{missing ? "This job isn't available any more" : "We couldn't load this job"}</p>
          {!missing && (
            <button type="button" onClick={() => query.refetch()} className="text-sm font-semibold text-main">
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  const carrying = job.stops.some((s) => s.status === "WITH_RIDER");
  const done = (text: string) => toast.success(text);

  return (
    <main className="flex flex-col gap-4 px-4 pb-24 pt-4">
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      {back}

      <section aria-label="Drop-off" className="flex flex-col gap-1.5 rounded-2xl bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Deliver to</p>
        <p className="flex items-start gap-1.5 font-semibold">
          <MapPin size={16} className="mt-0.5 shrink-0 text-main" />
          {job.destination.campusPlace ?? job.destination.address ?? "Off campus (address shows once you accept)"}
        </p>
        {job.destination.offCampus && <p className="text-xs text-foreground-muted">Off campus: agree the fee with the buyer.</p>}
        {job.deliveryFeeKobo > 0 && <p className="text-xs text-foreground-muted">Delivery fee {formatNaira(job.deliveryFeeKobo)}</p>}
        {job.buyer && (
          <div className="mt-1 flex flex-col gap-0.5 border-t border-border-default pt-2 text-sm">
            <p className="flex items-center gap-1.5">
              <User size={14} className="text-foreground-muted" /> {job.buyer.name}
            </p>
            {job.buyer.phone && (
              <a href={telHref(job.buyer.phone)} className="flex items-center gap-1.5 font-semibold text-main">
                <Phone size={14} /> {job.buyer.phone}
              </a>
            )}
          </div>
        )}
        <p className="text-[11px] text-foreground-muted">Paid {whenText(job.createdAt)}</p>
      </section>

      {job.mine ? (
        <>
          {job.stops.map((stop, i) => (
            <StopCard key={stop.sellerOrderId} jobId={job.id} stop={stop} index={i} onDone={done} />
          ))}
          {job.status === "ASSIGNED" && (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setReporting(true)} className="w-full rounded-full border border-border-default bg-card py-3 text-sm font-semibold">
                Report a problem
              </button>
              {!carrying && (
                <button type="button" onClick={() => setDropping(true)} className="w-full py-2 text-sm font-semibold text-red-500">
                  Give this job back
                </button>
              )}
            </div>
          )}
          {job.status === "DONE" && <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">All delivered. Thank you!</p>}
        </>
      ) : (
        <>
          <section aria-label="Stores" className="flex flex-col gap-2 rounded-2xl bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Collect from</p>
            {job.stops.map((s, i) => (
              <p key={s.sellerOrderId} className="text-sm">
                {i + 1}. {s.area ?? "Area not given"} · {s.itemCount} {s.itemCount === 1 ? "item" : "items"}
              </p>
            ))}
            <p className="text-xs text-foreground-muted">Store names, addresses and the buyer&apos;s phone show once you accept.</p>
          </section>
          <AcceptJobForm
            job={job}
            onTaken={() => {
              toast.error("Another rider took this job first");
              router.replace("/dispatch");
            }}
          />
        </>
      )}

      <Modal
        isOpen={dropping}
        onClose={drop.isPending ? () => undefined : () => setDropping(false)}
        title="Give this job back?"
        footer={
          <button
            type="button"
            disabled={drop.isPending}
            onClick={async () => {
              try {
                await drop.mutateAsync(undefined);
                setDropping(false);
                router.replace("/dispatch");
              } catch (err) {
                setDropping(false);
                toast.error("Couldn't give it back", err instanceof ApiError ? err.message : "Please try again");
              }
            }}
            className="w-full rounded-full bg-red-500 py-3.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {drop.isPending ? "Giving it back…" : "Give it back"}
          </button>
        }
      >
        <p className="text-sm text-foreground-muted">It goes back to the riders at your campus, and CampusMart is told so they can assign it.</p>
      </Modal>

      <Modal
        isOpen={reporting}
        onClose={report.isPending ? () => undefined : () => setReporting(false)}
        title="Report a problem"
        footer={
          <button
            type="button"
            disabled={report.isPending}
            onClick={async () => {
              try {
                await report.mutateAsync({ reason, ...(details.trim() && { details: details.trim() }) });
                setReporting(false);
                setDetails("");
                toast.success("Reported", "CampusMart will look into it");
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Couldn't send. Please try again.");
              }
            }}
            className="w-full rounded-full bg-main py-3.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {report.isPending ? "Sending…" : "Send to CampusMart"}
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="What went wrong" className="flex flex-col gap-2">
            {REASONS.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="rider-reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
                {r.label}
              </label>
            ))}
          </div>
          <textarea
            aria-label="Details"
            rows={3}
            maxLength={1000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className={`${field} resize-none`}
            placeholder="What happened? e.g. called twice, waited 20 minutes"
          />
          {error && (
            <p role="alert" className="text-xs font-medium text-red-500">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </main>
  );
}
