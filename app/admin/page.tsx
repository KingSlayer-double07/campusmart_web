"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Clock, MapPin, School, type LucideIcon } from "lucide-react";
import { useAdminInstitutions } from "@/lib/api/hooks/useAdminInstitutions";
import { useAdminStations } from "@/lib/api/hooks/useAdminStations";
import { cn } from "@/lib/utils/cn";
import AdminPageHeader from "./components/AdminPageHeader";

// "12", or "100+" when there's another page
function activeCount(query: ReturnType<typeof useAdminInstitutions> | ReturnType<typeof useAdminStations>) {
  if (query.isPending) return { label: null, count: 0, isError: false };
  if (query.isError) return { label: "—", count: 0, isError: true };
  const count = query.data.pages.reduce((sum, page) => sum + page.items.length, 0);
  return { label: query.hasNextPage ? `${count}+` : String(count), count, isError: false };
}

function AreaCard({
  href,
  icon: Icon,
  title,
  count,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  count: string | null;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-border-default bg-card p-5 transition hover:border-main/40 hover:shadow-sm active:scale-[0.99]"
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-main-subtle">
        <Icon size={22} className="text-main" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {count === null ? (
          <span className="h-7 w-8 animate-pulse rounded bg-surface-muted" aria-label="Loading" />
        ) : (
          <span className="text-2xl font-bold text-foreground">{count}</span>
        )}
        <ChevronRight size={18} className="text-foreground-muted transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function Step({
  done,
  pending,
  title,
  description,
  href,
  linkLabel,
}: {
  done: boolean;
  pending?: boolean;
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  const Icon = done ? CheckCircle2 : pending ? Clock : Circle;
  return (
    <li className="flex gap-3">
      <Icon
        size={20}
        className={cn("mt-0.5 shrink-0", done ? "text-green-500" : pending ? "text-foreground-muted" : "text-main")}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", done ? "text-foreground-muted line-through" : "text-foreground")}>
          {title}
        </p>
        <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
        {href && !done && (
          <Link href={href} className="mt-1 inline-block text-xs font-semibold text-main hover:underline">
            {linkLabel}
          </Link>
        )}
      </div>
    </li>
  );
}

export default function AdminHomePage() {
  const institutions = activeCount(useAdminInstitutions({ status: "ACTIVE", limit: 100 }));
  const stations = activeCount(useAdminStations({ status: "ACTIVE", limit: 100 }));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Admin console"
        description="Bring schools onto CampusMart and set up where their orders are collected. More tools appear here as the marketplace grows."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AreaCard
          href="/admin/institutions"
          icon={School}
          title="Institutions"
          count={institutions.label}
          description="Active schools and the email domains students sign up with"
        />
        <AreaCard
          href="/admin/stations"
          icon={MapPin}
          title="Pickup stations"
          count={stations.label}
          description="Active places where sellers drop off and buyers collect"
        />
      </div>

      <section className="rounded-2xl border border-border-default bg-card p-5">
        <h2 className="text-[15px] font-semibold text-foreground">Get a new campus live</h2>
        <p className="mt-0.5 text-xs text-foreground-muted">Three steps, all from this console.</p>
        <ol className="mt-4 flex flex-col gap-4">
          <Step
            done={institutions.count > 0}
            title="1. Add the institution and its student email domains"
            description="Students can sign up as soon as their school's domain is listed."
            href="/admin/institutions"
            linkLabel="Add an institution"
          />
          <Step
            done={stations.count > 0}
            title="2. Add at least one pickup station"
            description="Buyers choose a station at checkout, so a school needs one before anyone can order."
            href="/admin/stations"
            linkLabel="Add a pickup station"
          />
          <Step
            done={false}
            pending
            title="3. Assign a pickup agent to the station"
            description="Coming with the Users screen: agents confirm drop-offs and collections at their station."
          />
        </ol>
      </section>
    </div>
  );
}
