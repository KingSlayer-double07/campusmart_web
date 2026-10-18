"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PackageX } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";
import { useSellerStore } from "@/app/store/useSellerStore";
import type { AnalyticsMetric, InventoryAlert, TopListing } from "@/lib/api/analytics";
import { useInventoryAlerts, useSellerStats, useSellerTimeseries, useTopListings } from "@/lib/api/hooks/useSellerAnalytics";
import { formatNaira } from "@/lib/labels";
import ChangeBadge from "../components/ChangeBadge";
import RangeSwitch, { rangeSince } from "../components/RangeSwitch";

// recharts is loaded only here (guide 7.2.3)
const TrendChart = dynamic(() => import("./components/TrendChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const METRICS: { value: AnalyticsMetric; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "orders", label: "Orders" },
  { value: "views", label: "Views" },
];

const card = "bg-card rounded-3xl p-5 border border-border-default";

function ChartSkeleton() {
  return <div className="h-[200px] w-full animate-pulse rounded-xl bg-surface-muted" aria-label="Loading" />;
}

function Retry({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p role="alert" className="flex items-center justify-between gap-3 text-sm text-foreground-muted">
      Couldn&apos;t load {what}.
      <button type="button" onClick={onRetry} className="font-semibold text-seller-main underline">
        Try again
      </button>
    </p>
  );
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
      {src && <Image src={src} alt={alt} fill className="object-cover" sizes="48px" />}
    </div>
  );
}

function TopRow({ item }: { item: TopListing }) {
  return (
    <li className="flex items-center gap-3 border-b border-border-default py-3 last:border-b-0">
      <Thumb src={item.imageUrl} alt={item.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
        <p className="mt-0.5 text-xs text-foreground-muted">
          {item.unitsSold} sold · {formatNaira(item.revenueKobo)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-foreground">{item.conversionPct === null ? "—" : `${item.conversionPct}%`}</p>
        <p className="text-[11px] text-foreground-muted">
          of {item.views.toLocaleString("en-NG")} {item.views === 1 ? "view" : "views"}
        </p>
      </div>
    </li>
  );
}

function AlertRow({ item }: { item: InventoryAlert }) {
  const name = item.variantLabel ? `${item.title} (${item.variantLabel})` : item.title;
  return (
    <li className="flex items-center gap-3 border-b border-border-default py-3 last:border-b-0">
      <Thumb src={item.imageUrl} alt={item.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className={`mt-0.5 text-xs font-semibold ${item.stock === 0 ? "text-red-500" : "text-main"}`}>
          {item.stock === 0 ? "Out of stock" : `${item.stock} left`}
        </p>
      </div>
      <Link
        href={`/sellers/products/${item.listingId}/edit`}
        aria-label={`Restock ${name}`}
        className="shrink-0 rounded-full border border-seller-main px-3 py-1.5 text-xs font-semibold text-seller-main"
      >
        Restock
      </Link>
    </li>
  );
}

// Guide 7.2.3: the seller's sales, best sellers, items to restock and payouts for a range
export default function AnalyticsPage() {
  const range = useSellerStore((s) => s.range);
  const [metric, setMetric] = useState<AnalyticsMetric>("revenue");
  const stats = useSellerStats(range);
  const series = useSellerTimeseries(range, metric);
  const top = useTopListings(range, 5);
  const alerts = useInventoryAlerts();
  const since = rangeSince(range);
  const days = parseInt(range, 10);
  const numbers = stats.data;

  return (
    <main className="flex min-h-dvh w-full max-w-md flex-col bg-surface-muted pb-32">
      <div className="flex flex-col gap-4 bg-card px-4 pb-4 pt-10">
        <PageHeader title="Analytics" showBack />
        <RangeSwitch />
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {/* ── Revenue and counts ── */}
        <section
          aria-label="Revenue"
          className="flex flex-col gap-2 rounded-3xl p-5"
          style={{ background: "linear-gradient(135deg, #1a2e6e 0%, #13368B 50%, #1a5276 100%)" }}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-white/60">Revenue in {since}</p>
          {stats.isError ? (
            <p role="alert" className="text-sm text-white">
              Couldn&apos;t load your numbers.{" "}
              <button type="button" onClick={() => stats.refetch()} className="font-semibold underline">
                Try again
              </button>
            </p>
          ) : numbers ? (
            <>
              <p className="text-[32px] font-bold leading-none tracking-tight text-white">{formatNaira(numbers.revenueKobo)}</p>
              {numbers.revenueChangePct === null ? (
                <p className="mt-1 text-xs text-white/50">No sales in the {days} days before to compare with</p>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <ChangeBadge pct={numbers.revenueChangePct} tone="dark" />
                  <p className="text-xs text-white/50">against the {days} days before</p>
                </div>
              )}
            </>
          ) : (
            <span className="h-8 w-40 animate-pulse rounded bg-white/20" aria-label="Loading" />
          )}
        </section>

        {numbers && (
          <div className="flex gap-3">
            {[
              { label: "Orders", value: numbers.orders, change: numbers.ordersChangePct },
              { label: "Views", value: numbers.views, change: numbers.viewsChangePct },
            ].map((s) => (
              <div key={s.label} className="flex flex-1 flex-col gap-1.5 rounded-2xl border border-border-default bg-card p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">{s.label}</p>
                <p className="text-[22px] font-bold leading-none text-foreground">{s.value.toLocaleString("en-NG")}</p>
                <ChangeBadge pct={s.change} />
              </div>
            ))}
          </div>
        )}

        {/* ── Trend ── */}
        <section aria-labelledby="trend-title" className={card}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="trend-title" className="text-base font-bold text-foreground">
              Trend
            </h2>
            <div role="tablist" aria-label="Show" className="flex gap-1">
              {METRICS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="tab"
                  aria-selected={metric === m.value}
                  onClick={() => setMetric(m.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${metric === m.value ? "bg-seller-main text-white" : "text-foreground-muted"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {series.isError ? (
            <Retry what="the trend" onRetry={() => series.refetch()} />
          ) : series.data ? (
            <>
              <TrendChart data={series.data} metric={metric} />
              {series.data.every((p) => p.value === 0) && (
                <p className="mt-2 text-center text-xs text-foreground-muted">Nothing in {since} yet.</p>
              )}
            </>
          ) : (
            <ChartSkeleton />
          )}
        </section>

        {/* ── Best sellers ── */}
        <section aria-labelledby="top-title" className={card}>
          <h2 id="top-title" className="mb-1 text-base font-bold text-foreground">
            Top selling products
          </h2>
          {top.isError ? (
            <Retry what="your best sellers" onRetry={() => top.refetch()} />
          ) : !top.data ? (
            <div className="h-24 animate-pulse rounded-xl bg-surface-muted" aria-label="Loading" />
          ) : top.data.length === 0 ? (
            <p className="py-3 text-sm text-foreground-muted">Nothing sold in {since} yet.</p>
          ) : (
            <ul>
              {top.data.map((item) => (
                <TopRow key={item.listingId} item={item} />
              ))}
            </ul>
          )}
        </section>

        {/* ── Stock (guide 7.2.3, A1) ── */}
        <section id="stock" aria-labelledby="stock-title" className={card}>
          <h2 id="stock-title" className="mb-1 text-base font-bold text-foreground">
            Running low
          </h2>
          {alerts.isError ? (
            <Retry what="your stock" onRetry={() => alerts.refetch()} />
          ) : !alerts.data ? (
            <div className="h-24 animate-pulse rounded-xl bg-surface-muted" aria-label="Loading" />
          ) : alerts.data.items.length === 0 ? (
            <p className="flex items-center gap-2 py-3 text-sm text-foreground-muted">
              <PackageX size={16} aria-hidden />
              Nothing is running low. You&apos;ll be told when an item has {alerts.data.threshold} or fewer left.
            </p>
          ) : (
            <ul>
              {alerts.data.items.map((item) => (
                <AlertRow key={`${item.listingId}:${item.variantId ?? ""}`} item={item} />
              ))}
            </ul>
          )}
        </section>

        {/* ── Payouts ── */}
        {numbers && (
          <section aria-labelledby="payouts-title" className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 id="payouts-title" className="text-base font-bold text-foreground">
                Payouts
              </h2>
              <Link href="/sellers/earnings" className="text-xs font-semibold text-seller-main">
                See all
              </Link>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Held", hint: "until 48 hours after handover", value: numbers.heldKobo },
                { label: "On the way", hint: "released, not in your bank yet", value: numbers.releasedKobo },
                { label: "Paid out", hint: `in ${since}`, value: numbers.paidOutKobo },
              ].map((p) => (
                <div key={p.label} className="flex flex-col gap-1 rounded-2xl bg-surface-muted p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">{p.label}</dt>
                  <dd className="text-sm font-bold text-foreground">{formatNaira(p.value)}</dd>
                  <dd className="text-[10px] leading-tight text-foreground-muted">{p.hint}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </main>
  );
}
