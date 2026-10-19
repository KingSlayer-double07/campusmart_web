"use client";

import { cn } from "@/lib/utils/cn";

export interface TabOption {
  value: string;
  label: string;
}

// The admin console's pill tabs, e.g. All / Active / Switched off. `value` "" is the default tab.
export default function Tabs({
  tabs,
  value,
  onChange,
  label = "Status",
}: {
  tabs: readonly TabOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-all",
              selected ? "border-main bg-main text-white" : "border-border-default bg-card text-foreground-muted",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
