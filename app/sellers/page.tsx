"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Package, ClipboardList, TrendingUp, TrendingDown } from "lucide-react";
import { useSellerStore } from "@/app/store/useSellerStore";
import { useAuthStore } from "@/app/store/useAuthStore";
import { useSellerProfile, useUpdateSellerProfile } from "@/lib/api/hooks/useSellerProfile";

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  change: number;
  className?: string;
}

function StatCard({ label, value, change, className = "" }: StatCardProps) {
  const isPositive = change >= 0;
  return (
    <div
      className={`flex flex-col gap-1 rounded-xl p-4 bg-card/10 backdrop-blur-sm border border-white/20 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-white/70 text-xs font-medium">{label}</p>
        <span
          className={`text-xs font-semibold flex items-center gap-0.5 ${
            isPositive ? "text-green-400" : "text-red-400"
          }`}
        >
          {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {isPositive ? "+" : ""}
          {change}%
        </span>
      </div>
      <p className="text-white text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

// ─── Best Performing Card ─────────────────────────────────────────────────────

// TODO: Wire to real data. Replace static image, product name, and order count.
function BestPerformingCard() {
  return (
    <div className="relative w-full h-56 rounded-2xl overflow-hidden">
      <Image
        src="https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&auto=format&fit=crop&q=60"
        alt="Unisex Oversized Campus Hoodie"
        fill
        className="object-cover"
      />
      <div className="absolute inset-0 backdrop-blur-md h-20 self-end bg-black/10" />
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-white text-xs font-medium leading-snug">
            Unisex Oversized Campus Hoodie (Soft Cotton, Multiple Colors)
          </p>
          <p className="text-white font-bold text-sm">7 Orders today</p>
        </div>
        <Link href="/sellers/analytics" className="text-main font-semibold text-sm shrink-0">
          View Analytics
        </Link>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SellersPage() {
  const { stats } = useSellerStore();
  const { user } = useAuthStore();
  const { data: profile } = useSellerProfile();
  const updateProfile = useUpdateSellerProfile();

  // Buyers see "Online" on this seller's listings (guide 3.2.8)
  const isOnline = profile?.isOnline ?? false;
  const setIsOnline = (value: boolean) => {
    if (value !== isOnline) updateProfile.mutate({ isOnline: value });
  };

  const sellerName = profile?.storeName || user?.firstName || user?.email?.split('@')[0] || "Seller";

  const formatCurrency = (n: number) =>
    `₦${n.toLocaleString("en-NG")}`;

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

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Today's Views"
              value={stats.views.toLocaleString()}
              change={stats.viewsChange}
            />
            <StatCard
              label="Today's Orders"
              value={String(stats.orders)}
              change={stats.ordersChange}
            />
          </div>

          {/* Total Sales */}
          <StatCard
            label="Total Sales Today"
            value={formatCurrency(stats.totalSales)}
            change={stats.totalSalesChange}
            className="col-span-2"
          />

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

        {/* ── Best Performing ── */}
        <section className="flex flex-col gap-4 px-4 py-5">
          <p className="text-foreground font-bold text-lg tracking-tight">
            Best Performing
          </p>
          <BestPerformingCard />
        </section>

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
