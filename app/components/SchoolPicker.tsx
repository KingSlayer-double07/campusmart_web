"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, School, Search } from "lucide-react";
import { useSchools } from "@/lib/api/hooks/useAccount";
import { cn } from "@/lib/utils/cn";

// The schools on CampusMart, searchable. A school that isn't listed goes to the waitlist (G4).
export default function SchoolPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (institutionId: string) => void;
}) {
  const schools = useSchools();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (schools.data ?? []).filter((s) => !term || s.name.toLowerCase().includes(term));
  }, [schools.data, q]);

  return (
    <div className="flex flex-col gap-3">
      <label className="relative flex items-center">
        <span className="sr-only">Search schools</span>
        <Search size={16} className="pointer-events-none absolute left-4 text-foreground-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for your school"
          className="w-full rounded-full border border-border-default bg-card py-3 pl-10 pr-4 text-sm focus:border-main focus:outline-none focus:ring-2 focus:ring-main/30"
        />
      </label>
      {schools.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading schools">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      ) : schools.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border-default p-6 text-center text-sm">
          <p>We couldn&apos;t load the schools.</p>
          <button type="button" onClick={() => schools.refetch()} className="font-semibold text-main">
            Try again
          </button>
        </div>
      ) : (
        <ul role="radiogroup" aria-label="Schools" className="flex flex-col gap-2">
          {shown.map((s) => {
            const isSelected = selected === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition",
                    isSelected ? "border-main bg-main-subtle" : "border-border-default bg-card",
                  )}
                >
                  <School size={18} className="shrink-0 text-main" />
                  <span className="flex-1 font-medium">{s.name}</span>
                  {isSelected && <Check size={18} className="text-main" />}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="py-4 text-center text-sm text-foreground-muted">No school matches &ldquo;{q}&rdquo;.</li>}
        </ul>
      )}
      <p className="text-center text-sm text-foreground-muted">
        Don&apos;t see your school?{" "}
        <Link href="/waitlist" className="font-semibold text-main">
          Join the waitlist
        </Link>
      </p>
    </div>
  );
}
