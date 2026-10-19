"use client";

import { useState } from "react";
import { Lock, MapPin, Phone, ScanLine } from "lucide-react";
import CodeScanner, { scanningSupported } from "@/app/components/CodeScanner";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import type { JobStop } from "@/lib/api/dispatch";
import { useNotReady, usePickup, useRiderHandover, useUpdateWindow } from "@/lib/api/hooks/useRiderJobs";
import { FULFILLMENT_STATUS_LABELS } from "@/lib/labels";
import { whenText, windowText } from "@/lib/orderText";
import { WINDOW_HOURS, suggestedStart, toLocalInput, windowError, windowFrom } from "./windowInput";

const field =
  "w-full rounded-xl border border-border-default bg-surface-muted px-3 py-2.5 text-sm focus:border-main focus:outline-none focus:ring-2 focus:ring-main/30 aria-invalid:border-red-400";
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

// Decision DX5: at the store, enter or scan its CM- code; the parcel is then with the rider
function PickupForm({ jobId, onDone }: { jobId: string; onDone: (text: string) => void }) {
  const pickup = usePickup(jobId);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (value: string) => {
    if (value.trim().length < 6) return setError("Enter the code on the seller's screen, such as CM-7F3K2Q");
    setError(null);
    try {
      await pickup.mutateAsync(value.trim());
      onDone("Parcel collected");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {scanning ? (
        <CodeScanner
          onClose={() => setScanning(false)}
          onCode={(scanned) => {
            setScanning(false);
            setCode(scanned);
            void send(scanned);
          }}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(code);
          }}
          noValidate
          className="flex gap-2"
        >
          <input
            aria-label="Store's order code"
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            placeholder="CM-7F3K2Q"
            aria-invalid={!!error}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={`${field} font-mono`}
          />
          <button type="submit" disabled={pickup.isPending} className="shrink-0 rounded-xl bg-main px-4 text-sm font-bold text-white disabled:opacity-50">
            {pickup.isPending ? "…" : "Collect"}
          </button>
        </form>
      )}
      {!scanning && scanningSupported() && (
        <button type="button" onClick={() => setScanning(true)} className="flex items-center gap-1.5 self-start text-xs font-semibold text-main">
          <ScanLine size={14} /> Scan the QR code instead
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

// Decision DL5: at the buyer, their 3-digit code for this store
function HandoverForm({ jobId, stop, onDone }: { jobId: string; stop: JobStop; onDone: (text: string) => void }) {
  const handOver = useRiderHandover(jobId);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{3}$/.test(code)) return setError("Enter the buyer's 3-digit code");
    setError(null);
    try {
      await handOver.mutateAsync({ sellerOrderId: stop.sellerOrderId, code });
      onDone("Delivered");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          aria-label={`Buyer's code for ${stop.storeName ?? "this store"}`}
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          value={code}
          placeholder="000"
          aria-invalid={!!error}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={`${field} font-mono text-lg tracking-[0.4em]`}
        />
        <button type="submit" disabled={handOver.isPending} className="shrink-0 rounded-xl bg-green-600 px-4 text-sm font-bold text-white disabled:opacity-50">
          {handOver.isPending ? "…" : "Hand over"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-500">
          {error}
        </p>
      )}
    </form>
  );
}

function WindowEditor({ jobId, stop, onDone }: { jobId: string; stop: JobStop; onDone: (text: string) => void }) {
  const update = useUpdateWindow(jobId);
  const [start, setStart] = useState(stop.arrivalFrom ? toLocalInput(new Date(stop.arrivalFrom)) : suggestedStart());
  const [hours, setHours] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const window = windowFrom(start, hours);
    const problem = windowError(window, stop.pickupDeadline);
    if (problem) return setError(problem);
    try {
      await update.mutateAsync({ sellerOrderId: stop.sellerOrderId, ...window! });
      onDone("Time updated; the seller has been told");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-muted p-3">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-xs text-foreground-muted">
          Arrive from
          <input type="datetime-local" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="w-28 shrink-0 text-xs text-foreground-muted">
          For
          <select className={field} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {WINDOW_HOURS.map((h) => (
              <option key={h} value={h}>
                {h} {h === 1 ? "hour" : "hours"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-500">
          {error}
        </p>
      )}
      <button type="button" onClick={save} disabled={update.isPending} className="self-start text-sm font-semibold text-main disabled:opacity-50">
        {update.isPending ? "Saving…" : "Save time"}
      </button>
    </div>
  );
}

// One store on the rider's job, with what to do there now
export default function StopCard({ jobId, stop, index, onDone }: { jobId: string; stop: JobStop; index: number; onDone: (text: string) => void }) {
  const notReady = useNotReady(jobId);
  const [editingWindow, setEditingWindow] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-label={`Store ${index + 1}: ${stop.storeName ?? stop.area ?? ""}`} className="flex flex-col gap-3 rounded-2xl bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Store {index + 1}</p>
          <p className="font-semibold">{stop.storeName}</p>
          {stop.address && (
            <p className="flex items-start gap-1 text-xs text-foreground-muted">
              <MapPin size={12} className="mt-0.5 shrink-0" /> {stop.address}
              {stop.area ? ` (${stop.area})` : ""}
            </p>
          )}
          {stop.phone && (
            <a href={telHref(stop.phone)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-main">
              <Phone size={12} /> {stop.phone}
            </a>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-border-default px-2.5 py-0.5 text-[10px] font-semibold">
          {FULFILLMENT_STATUS_LABELS[stop.status]}
        </span>
      </div>

      <ul className="text-xs text-foreground">
        {stop.items.map((item, i) => (
          <li key={i}>
            {item.quantity} × {item.title}
            {item.variantLabel ? ` (${item.variantLabel})` : ""}
          </li>
        ))}
      </ul>

      {stop.status === "RIDER_ASSIGNED" && (
        <>
          <div className="text-xs text-foreground-muted">
            {stop.arrivalFrom && stop.arrivalTo ? `You said: ${windowText(stop.arrivalFrom, stop.arrivalTo)}` : "Set when you'll come"}
            {stop.pickupDeadline && <> · collect by {whenText(stop.pickupDeadline)}</>}
            <button type="button" onClick={() => setEditingWindow((v) => !v)} className="ml-2 font-semibold text-main">
              {editingWindow ? "Close" : "Change"}
            </button>
          </div>
          {editingWindow && (
            <WindowEditor
              jobId={jobId}
              stop={stop}
              onDone={(text) => {
                setEditingWindow(false);
                onDone(text);
              }}
            />
          )}
          {stop.notReadyAt && <p className="text-xs font-medium text-main">You reported it not ready. Come back before the deadline.</p>}
          <PickupForm jobId={jobId} onDone={onDone} />
          <button type="button" onClick={() => setReporting(true)} className="self-start text-xs font-semibold text-foreground-muted underline">
            Not ready, or the seller isn&apos;t there?
          </button>
        </>
      )}

      {stop.status === "WITH_RIDER" &&
        (stop.handoverLocked ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-red-500">
            <Lock size={14} /> Locked after 5 wrong codes. CampusMart will unlock it.
          </p>
        ) : (
          <HandoverForm jobId={jobId} stop={stop} onDone={onDone} />
        ))}
      {stop.status === "DELIVERED" && stop.deliveredAt && <p className="text-xs text-green-700">Delivered {whenText(stop.deliveredAt)}</p>}
      {stop.status === "CANCELLED" && <p className="text-xs text-foreground-muted">Cancelled. Skip this store.</p>}

      <Modal
        isOpen={reporting}
        onClose={notReady.isPending ? () => undefined : () => setReporting(false)}
        title="Store not ready"
        footer={
          <button
            type="button"
            disabled={notReady.isPending}
            onClick={async () => {
              try {
                await notReady.mutateAsync({ sellerOrderId: stop.sellerOrderId, note: note.trim() || undefined });
                setReporting(false);
                onDone("Reported. Deliver the rest and come back for this one.");
              } catch (err) {
                setError(messageOf(err));
              }
            }}
            className="w-full rounded-full bg-main py-3.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {notReady.isPending ? "Sending…" : "Report and carry on"}
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground-muted">
            Deliver the rest of the order now and come back for this store before its deadline, at no extra fee. If it&apos;s still not ready
            then, it&apos;s cancelled as the seller&apos;s fault.
          </p>
          <label htmlFor={`note-${stop.sellerOrderId}`} className="text-sm font-semibold">
            Note (optional)
          </label>
          <textarea
            id={`note-${stop.sellerOrderId}`}
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${field} resize-none`}
            placeholder="e.g. Shop closed, no answer on the phone"
          />
          {error && (
            <p role="alert" className="text-xs font-medium text-red-500">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
