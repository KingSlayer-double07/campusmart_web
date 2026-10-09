"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Switched off" },
] as const;

// A search box (debounced 300 ms, like the app's SearchBar) and All / Active / Switched off tabs
export default function FilterBar({
  search,
  onSearch,
  searchPlaceholder,
  status,
  onStatus,
  children,
}: {
  search: string;
  onSearch: (q: string) => void;
  searchPlaceholder: string;
  status: string;
  onStatus: (status: string) => void;
  /** Extra filters, such as an institution picker */
  children?: React.ReactNode;
}) {
  const [text, setText] = useState(search);

  useEffect(() => setText(search), [search]);

  useEffect(() => {
    if (text === search) return;
    const timer = setTimeout(() => onSearch(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, search, onSearch]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row">
        <label className="relative flex flex-1 items-center">
          <span className="sr-only">Search</span>
          <Search size={16} className="pointer-events-none absolute left-4 text-foreground-muted" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-full border border-border-default bg-card py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-foreground-muted focus:border-main focus:outline-none focus:ring-2 focus:ring-main/30"
          />
          {text && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText("");
                onSearch("");
              }}
              className="absolute right-3 flex size-6 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted"
            >
              <X size={14} />
            </button>
          )}
        </label>
        {children}
      </div>
      <div role="tablist" aria-label="Status" className="flex gap-2 overflow-x-auto no-scrollbar">
        {STATUS_TABS.map((tab) => {
          const selected = status === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onStatus(tab.value)}
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
    </div>
  );
}
