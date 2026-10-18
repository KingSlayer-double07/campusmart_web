"use client";

import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Flag,
  MapPinned,
  PackageSearch,
  Scale,
  School,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAdminCampusPlaces } from "@/lib/api/hooks/useAdminCampusPlaces";
import { useAdminRiders } from "@/lib/api/hooks/useAdminDispatch";
import { useAdminInstitutions } from "@/lib/api/hooks/useAdminInstitutions";
import { useAdminOverview } from "@/lib/api/hooks/useAdminModeration";
import type { AdminOverview } from "@/lib/api/moderation";
import { formatNaira } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";
import AdminPageHeader from "./components/AdminPageHeader";

// "12", or "100+" when there's another page
function activeCount(
  query:
    | ReturnType<typeof useAdminInstitutions>
    | ReturnType<typeof useAdminCampusPlaces>
    | ReturnType<typeof useAdminRiders>,
) {
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

// Guide 9.1 overview: the platform's numbers, then what's waiting for an admin
const NUMBERS: { label: string; value: (o: AdminOverview) => string }[] = [
  { label: "Accounts", value: (o) => o.users.toLocaleString("en-NG") },
  { label: "Sellers", value: (o) => o.sellers.toLocaleString("en-NG") },
  { label: "Paid orders, 7 days", value: (o) => o.paidOrders7d.toLocaleString("en-NG") },
  { label: "Paid orders, 30 days", value: (o) => o.paidOrders30d.toLocaleString("en-NG") },
  { label: "Sales, 30 days", value: (o) => formatNaira(o.gmv30dKobo) },
  { label: "Held in escrow", value: (o) => formatNaira(o.escrowHeldKobo) },
];

const WAITING: { key: keyof AdminOverview; href: string; icon: LucideIcon; title: string; description: string }[] = [
  { key: "listingsToReview", href: "/admin/listings", icon: PackageSearch, title: "Listings to review", description: "Held by a banned word, reported or flagged" },
  { key: "openReports", href: "/admin/reports", icon: Flag, title: "Open reports", description: "What users reported" },
  { key: "openDisputes", href: "/admin/disputes", icon: Scale, title: "Open disputes", description: "Buyers waiting for a refund decision" },
  { key: "pendingVerifications", href: "/admin/verifications", icon: ShieldCheck, title: "Seller verification", description: "Student IDs to check" },
  { key: "failedPayouts", href: "/admin/payouts", icon: Wallet, title: "Failed payouts", description: "Seller payouts to retry" },
  { key: "suspendedUsers", href: "/admin/users?tab=SUSPENDED", icon: Ban, title: "Suspended users", description: "Until an admin lifts it" },
];

function PlatformNumbers() {
  const overview = useAdminOverview();
  if (overview.isError) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border-default bg-card p-6 text-center">
        <p className="text-sm font-medium">We couldn&apos;t load the numbers</p>
        <button type="button" onClick={() => overview.refetch()} className="text-sm font-semibold text-main">
          Try again
        </button>
      </div>
    );
  }
  const data = overview.data;
  return (
    <>
      <section aria-label="Platform numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {NUMBERS.map((n) => (
          <div key={n.label} className="rounded-2xl border border-border-default bg-card p-4">
            <p className="text-xs text-foreground-muted">{n.label}</p>
            {data ? (
              <p className="mt-1 text-lg font-bold text-foreground">{n.value(data)}</p>
            ) : (
              <span className="mt-2 block h-6 w-16 animate-pulse rounded bg-surface-muted" aria-label="Loading" />
            )}
          </div>
        ))}
      </section>
      <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
        <h2 id="waiting-heading" className="text-[15px] font-semibold text-foreground">
          Waiting for you
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WAITING.map((w) => (
            <AreaCard
              key={w.key}
              href={w.href}
              icon={w.icon}
              title={w.title}
              count={data ? String(data[w.key]) : null}
              description={w.description}
            />
          ))}
        </div>
      </section>
    </>
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
  const institutionsQuery = useAdminInstitutions({ status: "ACTIVE", limit: 100 });
  const institutions = activeCount(institutionsQuery);
  const places = activeCount(useAdminCampusPlaces({ status: "ACTIVE", limit: 100 }));
  const riders = activeCount(useAdminRiders({ status: "ACTIVE" }));
  const feeSet = !!institutionsQuery.data?.pages.some((page) => page.items.some((i) => i.deliveryFeeKobo !== null));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Admin console"
        description="How CampusMart is doing, what's waiting for an admin, and the steps to bring a new school on."
      />

      <PlatformNumbers />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AreaCard
          href="/admin/institutions"
          icon={School}
          title="Institutions"
          count={institutions.label}
          description="Active schools and the email domains students sign up with"
        />
        <AreaCard
          href="/admin/places"
          icon={MapPinned}
          title="Campus places"
          count={places.label}
          description="Active halls, faculties and gates riders deliver to"
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
            done={places.count > 0 && feeSet}
            title="2. Add campus places and set the delivery fee"
            description="Buyers pick a place for delivery on campus. Until there's a place and a fee, they can only get delivery off campus or pick up."
            href={places.count > 0 ? "/admin/settings" : "/admin/places"}
            linkLabel={places.count > 0 ? "Set the delivery fee" : "Add a campus place"}
          />
          <Step
            done={riders.count > 0}
            title="3. Invite the riders"
            description="Riders collect from sellers and deliver to buyers. Each one belongs to one campus."
            href="/admin/riders"
            linkLabel="Invite a rider"
          />
        </ol>
      </section>
    </div>
  );
}
