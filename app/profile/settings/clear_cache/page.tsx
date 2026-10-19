"use client";

import { useState } from "react";
import { Database, ImageIcon, Clock, Globe, FileText, AlertCircle } from "lucide-react";
import PageHeader from "../../../components/PageHeader";
import BottomSheet from "../../../components/BottomSheet";
import { useToast, ToastContainer } from "../../../components/Toast";
import { cacheItems } from "../../../lib/data";

/* ── Cache breakdown data ── */

const TOTAL_MB = cacheItems.reduce((s, i) => s + i.mb, 0); // 24.5
const STORAGE_CAP = 40; // visual max for progress bar

/* ── Confirmation bottom-sheet ── */
function ConfirmClearSheet({
  isOpen,
  totalMb,
  onConfirm,
  onClose,
}: {
  isOpen: boolean;
  totalMb: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="px-6 pt-4 pb-8 flex flex-col items-center gap-5">
        {/* Icon */}
        <div className="size-16 rounded-full bg-orange-100 flex items-center justify-center">
          <Database size={28} className="text-main" />
        </div>

        {/* Title & body */}
        <div className="text-center">
          <h2 className="text-[18px] font-bold text-foreground">Clear All Cache?</h2>
          <p className="text-sm text-foreground-muted mt-1 leading-relaxed">
            This will free up {totalMb.toFixed(1)} MB of space.{"\n"}
            Images and data will be reloaded as needed.
          </p>
        </div>

        {/* Warning pill */}
        <div className="w-full rounded-full border border-orange-200 bg-orange-50 px-4 py-2.5 text-center">
          <span className="text-sm font-medium text-foreground-muted">
            🗑️ This action cannot be undone
          </span>
        </div>

        {/* Side-by-side buttons */}
        <div className="flex gap-3 w-full mt-1">
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className="flex-1 bg-main text-white rounded-full py-3.5 font-semibold text-[15px] hover:brightness-105 transition-all"
          >
            Clear Cache
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-surface-muted text-foreground rounded-full py-3.5 font-semibold text-[15px] hover:bg-neutral-200 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ── Page ── */
export default function ClearCachePage() {
  const [cleared, setCleared] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const toast = useToast();

  const usedMb = cleared ? 0 : TOTAL_MB;
  const fillPct = Math.min((usedMb / STORAGE_CAP) * 100, 100);

  const handleClear = () => {
    setCleared(true);
    toast.success("Success!", `Cache cleared successfully — ${TOTAL_MB.toFixed(1)} MB freed`);
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} duration={3500} />

      <main className="pb-36 pt-8 px-6">
        <PageHeader title="Clear Cache" showBack={true} />

        {/* ── Hero ── */}
        <div className="flex flex-col items-center gap-2 mt-8 mb-6">
          <div className="size-16 rounded-full bg-orange-100 flex items-center justify-center">
            <Database size={28} className="text-main" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {cleared ? "0.0" : TOTAL_MB.toFixed(1)} MB Used
          </p>
          <p className="text-sm text-foreground-muted">Cached data from browsing and activity</p>

          {/* Progress bar */}
          <div className="w-full h-2 bg-neutral-200 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-main rounded-full transition-all duration-700 ease-out"
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>

        {/* ── Storage breakdown ── */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase mb-2">
            Storage Breakdown
          </p>

          {cacheItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-3 py-3">
                <div className="size-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-main" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-foreground-muted">{item.description}</p>
                </div>
                <p className={`text-sm font-semibold shrink-0 ${cleared ? "text-neutral-300 line-through" : "text-main"}`}>
                  {item.mb.toFixed(1)} MB
                </p>
              </div>
            );
          })}

          {/* Info banner */}
          <div className="mt-2 flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
            <AlertCircle size={16} className="text-main shrink-0 mt-0.5" />
            <p className="text-xs text-foreground-muted leading-relaxed">
              Clearing cache won&apos;t delete your account data, saved items, or personal information.
            </p>
          </div>
        </div>
      </main>

      {/* ── Sticky bottom button ── */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-6 z-50">
        <div className="w-full max-w-md px-6">
          <button
            onClick={() => !cleared && setShowConfirm(true)}
            disabled={cleared}
            className={`w-full rounded-full py-3.5 font-semibold text-[15px] border-2 transition-all ${
              cleared
                ? "border-border-default text-neutral-300 cursor-not-allowed"
                : "border-main text-main hover:bg-orange-50"
            }`}
          >
            {cleared
              ? "Cache Cleared ✓"
              : `Clear All Cache (${TOTAL_MB.toFixed(1)} MB)`}
          </button>
        </div>
      </div>

      {/* Confirmation sheet */}
      <ConfirmClearSheet
        isOpen={showConfirm}
        totalMb={TOTAL_MB}
        onConfirm={handleClear}
        onClose={() => setShowConfirm(false)}
      />
    </>
  );
}
