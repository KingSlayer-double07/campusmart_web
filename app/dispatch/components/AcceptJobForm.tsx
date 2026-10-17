"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import type { DeliveryJob } from "@/lib/api/dispatch";
import { useAcceptJob } from "@/lib/api/hooks/useRiderJobs";
import { whenText } from "@/lib/orderText";
import { WINDOW_HOURS, suggestedStart, windowError, windowFrom } from "./windowInput";

const field =
  "w-full rounded-xl border border-border-default bg-surface-muted px-3 py-2.5 text-sm focus:border-main focus:outline-none focus:ring-2 focus:ring-main/30";

// Decisions DX2 and DF8b: accept the job, saying when you'll reach each store. First to accept wins.
export default function AcceptJobForm({ job, onTaken }: { job: DeliveryJob; onTaken: () => void }) {
  const accept = useAcceptJob(job.id);
  const stops = job.stops.filter((s) => s.status === "AWAITING_RIDER");
  const [times, setTimes] = useState(() => Object.fromEntries(stops.map((s) => [s.sellerOrderId, { start: suggestedStart(), hours: 2 }])));
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const windows = stops.map((s) => ({ sellerOrderId: s.sellerOrderId, window: windowFrom(times[s.sellerOrderId].start, times[s.sellerOrderId].hours) }));
    const found = Object.fromEntries(stops.map((s, i) => [s.sellerOrderId, windowError(windows[i].window, s.pickupDeadline)]));
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setFormError(null);
    try {
      await accept.mutateAsync(windows.map((w) => ({ sellerOrderId: w.sellerOrderId, ...w.window! })));
    } catch (err) {
      if (err instanceof ApiError && err.code === "JOB_TAKEN") return onTaken();
      setFormError(err instanceof ApiError ? err.message : "Couldn't accept the job. Please try again.");
    }
  };

  return (
    <section aria-labelledby="accept-title" className="flex flex-col gap-4 rounded-2xl bg-card p-4">
      <div>
        <h2 id="accept-title" className="text-base font-semibold">
          When will you reach each store?
        </h2>
        <p className="text-xs text-foreground-muted">Each seller sees your window, so their item is ready.</p>
      </div>
      {stops.map((s, i) => (
        <fieldset key={s.sellerOrderId} className="flex flex-col gap-2 border-t border-border-default pt-3 first-of-type:border-0 first-of-type:pt-0">
          <legend className="text-sm font-semibold">
            Store {i + 1}: {s.area ?? "Area not given"}
          </legend>
          {s.pickupDeadline && <p className="text-xs text-foreground-muted">Collect by {whenText(s.pickupDeadline)}</p>}
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-foreground-muted">
              Arrive from
              <input
                type="datetime-local"
                className={field}
                value={times[s.sellerOrderId].start}
                aria-invalid={!!errors[s.sellerOrderId]}
                onChange={(e) => setTimes((t) => ({ ...t, [s.sellerOrderId]: { ...t[s.sellerOrderId], start: e.target.value } }))}
              />
            </label>
            <label className="w-28 text-xs text-foreground-muted">
              For
              <select
                className={field}
                value={times[s.sellerOrderId].hours}
                onChange={(e) => setTimes((t) => ({ ...t, [s.sellerOrderId]: { ...t[s.sellerOrderId], hours: Number(e.target.value) } }))}
              >
                {WINDOW_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? "hour" : "hours"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {errors[s.sellerOrderId] && (
            <p role="alert" className="text-xs font-medium text-red-500">
              {errors[s.sellerOrderId]}
            </p>
          )}
        </fieldset>
      ))}
      {formError && (
        <p role="alert" className="text-xs font-medium text-red-500">
          {formError}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={accept.isPending}
        className="w-full rounded-full bg-main py-3.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {accept.isPending ? "Accepting…" : "Accept job"}
      </button>
    </section>
  );
}
