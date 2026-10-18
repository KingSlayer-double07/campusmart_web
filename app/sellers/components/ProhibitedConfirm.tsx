"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PROHIBITED_ITEMS } from "@/lib/prohibitedItems";
import { cn } from "@/lib/utils/cn";

// Decision M4a: the seller confirms the item isn't on the prohibited list (M5) before publishing.
// A listing that's confirmed but still prohibited is taken down and its seller suspended (M4d).
export default function ProhibitedConfirm({
  checked,
  onChange,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-2xl border p-4", error ? "border-red-300 bg-red-50/40" : "border-border-default bg-surface-muted")}>
      <label className="flex items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "prohibited-error" : undefined}
          className="mt-0.5 size-4 shrink-0 accent-seller-main"
        />
        <span>
          This item isn&apos;t on CampusMart&apos;s prohibited list. Listing a prohibited item gets your account suspended.
        </span>
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 ml-7 flex items-center gap-1 text-xs font-semibold text-seller-main"
      >
        {open ? "Hide the list" : "See the list"}
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-2 ml-7 list-disc space-y-1 pl-4 text-xs text-foreground-muted">
          {PROHIBITED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {error && (
        <p id="prohibited-error" role="alert" className="mt-2 ml-7 text-xs font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
