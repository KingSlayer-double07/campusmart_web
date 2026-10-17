"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Package, ClipboardList } from "lucide-react";
import { useSellerStore } from "@/app/store/useSellerStore";
import { useAuthStore } from "@/app/store/useAuthStore";
import { useSellerProfile, useUpdateSellerProfile } from "@/lib/api/hooks/useSellerProfile";
import { useSellerStats, useTopListings } from "@/lib/api/hooks/useSellerAnalytics";
import { formatNaira } from "@/lib/labels";
import PayoutAccountBanner from "./components/PayoutAccountBanner";
import ChangeBadge from "./components/ChangeBadge";
import RangeSwitch, { rangeSince } from "./components/RangeSwitch";

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | null; // null while loading
  change: number | null;
  className?: string;
}

function StatCard({ label, value, change, className = "" }: StatCardProps) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-xl p-4 bg-card/10 backdrop-blur-sm border border-white/20 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-white/70 text-xs font-medium">{label}</p>
        {value !== null && <ChangeBadge pct={change} tone="dark" />}
      </div>
      {value === null ? (
        <span className="h-8 w-20 animate-pulse rounded bg-white/20" aria-label="Loading" />
      ) : (
        <p className="text-white text-2xl font-bold tracking-tight">{value}</p>
      )}
    </div>
  );
}

// ─── Best Performing Card ─────────────────────────────────────────────────────

// Guide 7.2.2: the range's best seller; hidden until something sells
function BestPerformingCard() {
  const range = useSellerStore((s) => s.range);
  const top = useTopListings(range, 1);
  const best = top.data?.[0];
  if (top.isPending) return <div className="h-56 w-full animate-pulse rounded-2xl bg-surface-muted" aria-label="Loading" />;
  if (!best) return null;
  return (
    <section className="flex flex-col gap-4 px-4 py-5" aria-labelledby="best-title">
      <p id="best-title" className="text-foreground font-bold text-lg tracking-tight">
        Best Performing
      </p>
      <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-surface-muted">
        {best.imageUrl && <Image src={best.imageUrl} alt={best.title} fill sizes="(max-width: 448px) 100vw, 448px" className="object-cover" />}
        <div className="absolute inset-0 backdrop-blur-md h-20 self-end bg-black/10" />
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-white text-xs font-medium leading-snug line-clamp-2">{best.title}</p>
            <p className="text-white font-bold text-sm">
              {best.unitsSold} sold in {rangeSince(range)}
            </p>
          </div>
          <Link href="/sellers/analytics" className="text-main font-semibold text-sm shrink-0">
            View Analytics
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SellersPage() {
  const range = useSellerStore((s) => s.range);
  const stats = useSellerStats(range);
  const { user } = useAuthStore();
  const { data: profile } = useSellerProfile();
  const updateProfile = useUpdateSellerProfile();

  // Buyers see "Online" on this seller's listings (guide 3.2.8)
  const isOnline = profile?.isOnline ?? false;
  const setIsOnline = (value: boolean) => {
    if (value !== isOnline) updateProfile.mutate({ isOnline: value });
  };

  const sellerName = profile?.storeName || user?.firstName || user?.email?.split('@')[0] || "Seller";
  const numbers = stats.data;

  return (
      <main className="flex flex-col w-full max-w-md pb-32">

        {/* ── Hero Header ── */}
        <section
          className="flex flex-col gap-5 px-5 pt-10 pb-8 bg-[linear-gradient(160deg,#1a2e6e_0%,#1e3a8a_40%,#1e4d8c_70%,#1a5276_100%)]"
        >
          {/* Top row */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white text-xl font-bold">
                Hi {sellerName} 👋
              </p>
              <p className="text-white/60 text-sm mt-0.5">
                Manage your business smoothly
              </p>
            </div>
            <Link
              href="/sellers/notifications"
              className="size-9 rounded-full bg-card/10 border border-white/20 flex items-center justify-center text-white hover:bg-card/20 transition"
            >
              <Bell size={18} />
            </Link>
          </div>

          {/* Stats for the chosen range (guide 7.2.1) */}
          <RangeSwitch tone="dark" />
          {stats.isError ? (
            <div role="alert" className="flex items-center justify-between rounded-xl border border-white/20 bg-card/10 p-4 text-sm text-white">
              Couldn&apos;t load your numbers.
              <button type="button" onClick={() => stats.refetch()} className="font-semibold underline">
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Views" value={numbers ? numbers.views.toLocaleString("en-NG") : null} change={numbers?.viewsChangePct ?? null} />
                <StatCard label="Orders" value={numbers ? numbers.orders.toLocaleString("en-NG") : null} change={numbers?.ordersChangePct ?? null} />
              </div>
              <StatCard
                label={`Sales in ${rangeSince(range)}`}
                value={numbers ? formatNaira(numbers.revenueKobo) : null}
                change={numbers?.revenueChangePct ?? null}
                className="col-span-2"
              />
            </>
          )}

          {/* Online / Offline Toggle */}
          <div className="flex items-center bg-card/10 border border-white/20 rounded-full p-1 self-center w-full max-w-xs">
            <button
              onClick={() => setIsOnline(false)}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                !isOnline ? "bg-seller-darker text-white shadow" : "text-white/60"
              }`}
            >
              Offline
            </button>
            <button
              onClick={() => setIsOnline(true)}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                isOnline ? "bg-card text-seller-dark shadow" : "text-white/60"
              }`}
            >
              Go Online
            </button>
          </div>
        </section>

        <div className="px-4 pt-5 empty:hidden">
          <PayoutAccountBanner />
        </div>

        {/* ── Best Performing ── */}
        <BestPerformingCard />

        {/* ── Action Buttons ── */}
        <section className="flex flex-col gap-3 px-4 pt-2 pb-6 border-t border-border-default">
          <Link
            href="/sellers/addProduct"
            className="bg-card flex items-center justify-center gap-2 w-full py-3.5 rounded-full shadow-md text-seller-dark font-semibold text-sm hover:bg-seller-dark/5 transition"
          >
            <Package size={18} />
            Add Product
          </Link>
          <Link
            href="/sellers/orders"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-full border border-seller-dark text-seller-dark font-semibold text-sm hover:bg-seller-dark/5 transition"
          >
            <ClipboardList size={18} />
            View Orders
          </Link>
        </section>

      </main>
  );
}
