"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, MapPin, Package } from "lucide-react";
import type { DeliveryJob, JobScope } from "@/lib/api/dispatch";
import { useRiderJobs } from "@/lib/api/hooks/useRiderJobs";
import { formatNaira } from "@/lib/labels";
import { whenText } from "@/lib/orderText";

const TABS: { id: JobScope; label: string; empty: string }[] = [
  { id: "OPEN", label: "Available", empty: "No jobs are waiting at your campus right now. New ones appear here as orders are paid." },
  { id: "MINE", label: "My jobs", empty: "Jobs you accept show here until every parcel is delivered." },
  { id: "DONE", label: "Done", empty: "Your finished jobs show here." },
];

const dropOff = (job: DeliveryJob) => job.destination.campusPlace ?? "Off campus";

function JobCard({ job }: { job: DeliveryJob }) {
  const items = job.stops.reduce((n, s) => n + s.itemCount, 0);
  const areas = [...new Set(job.stops.map((s) => s.area ?? "Store"))];
  const toDo = job.stops.filter((s) => s.status === "RIDER_ASSIGNED" || s.status === "WITH_RIDER").length;
  return (
    <Link href={`/dispatch/jobs/${job.id}`} className="flex items-center gap-3 rounded-2xl bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Package size={15} className="shrink-0 text-main" />
          {job.stops.length} {job.stops.length === 1 ? "store" : "stores"} · {items} {items === 1 ? "item" : "items"}
        </p>
        <p className="mt-1 truncate text-xs text-foreground-muted">From {areas.join(", ")}</p>
        <p className="flex items-center gap-1 truncate text-xs text-foreground-muted">
          <MapPin size={12} className="shrink-0" /> To {dropOff(job)}
        </p>
        <p className="mt-1 text-[11px] text-foreground-muted">
          {job.mine && toDo > 0 ? `${toDo} ${toDo === 1 ? "stop" : "stops"} to go · ` : ""}Paid {whenText(job.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {job.deliveryFeeKobo > 0 && <span className="text-sm font-bold text-main">{formatNaira(job.deliveryFeeKobo)}</span>}
        <ChevronRight size={18} className="text-foreground-muted" />
      </div>
    </Link>
  );
}

// Phase 6 (DX2): every open job at the rider's campus; the first rider to accept takes it
export default function RiderHomePage() {
  const [scope, setScope] = useState<JobScope>("OPEN");
  const jobs = useRiderJobs(scope);
  const rows = jobs.data?.pages.flatMap((p) => p.items) ?? [];
  const current = TABS.find((t) => t.id === scope)!;

  return (
    <main className="flex flex-col gap-4 px-4 pb-24 pt-4">
      <div role="tablist" aria-label="Jobs" className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={scope === t.id}
            onClick={() => setScope(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${scope === t.id ? "bg-main text-white" : "bg-card text-foreground-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {jobs.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading jobs">
          <div className="h-24 animate-pulse rounded-2xl bg-card" />
          <div className="h-24 animate-pulse rounded-2xl bg-card" />
        </div>
      ) : jobs.isError ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <p className="text-sm font-medium">We couldn&apos;t load the jobs</p>
          <button type="button" onClick={() => jobs.refetch()} className="text-sm font-semibold text-main">
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-foreground-muted">
          <Package size={28} className="text-main" />
          <p className="text-sm font-medium text-foreground">Nothing here</p>
          <p className="text-xs">{current.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {jobs.hasNextPage && (
            <button
              type="button"
              onClick={() => jobs.fetchNextPage()}
              disabled={jobs.isFetchingNextPage}
              className="self-center text-sm font-semibold text-main disabled:opacity-50"
            >
              {jobs.isFetchingNextPage ? "Loading…" : "Show more"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
