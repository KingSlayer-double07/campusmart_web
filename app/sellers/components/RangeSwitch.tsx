"use client";

import type { AnalyticsRange } from "@/lib/api/analytics";
import { useSellerStore } from "@/app/store/useSellerStore";

export const RANGE_OPTIONS: { value: AnalyticsRange; label: string; since: string }[] = [
  { value: "7d", label: "7 days", since: "the last 7 days" },
  { value: "30d", label: "30 days", since: "the last 30 days" },
  { value: "90d", label: "90 days", since: "the last 90 days" },
];

export const rangeSince = (range: AnalyticsRange) => RANGE_OPTIONS.find((o) => o.value === range)!.since;

const TONES = {
  // On the dashboard's navy header, in both themes
  dark: { idle: "text-white/70", active: "bg-white text-seller-dark shadow", frame: "bg-white/10 border-white/20" },
  light: { idle: "text-foreground-muted", active: "bg-seller-main text-white shadow", frame: "bg-card border-border-default" },
};

// Guide 7.2: 7, 30 or 90 days, remembered between the dashboard and analytics
export default function RangeSwitch({ tone = "light" }: { tone?: keyof typeof TONES }) {
  const { range, setRange } = useSellerStore();
  const t = TONES[tone];
  return (
    <div role="group" aria-label="Period" className={`flex rounded-full border p-1 ${t.frame}`}>
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={range === o.value}
          onClick={() => setRange(o.value)}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${range === o.value ? t.active : t.idle}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
