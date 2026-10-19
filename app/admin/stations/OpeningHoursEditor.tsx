"use client";

import { Copy } from "lucide-react";
import { WEEKDAY_LABELS, rowError, type DayRow } from "@/lib/openingHours";
import { cn } from "@/lib/utils/cn";
import { Toggle } from "../components/fields";

const timeClass =
  "w-full min-w-0 rounded-lg border border-border-default bg-surface-muted px-2.5 py-2 text-sm text-foreground focus:border-main focus:outline-none focus:ring-2 focus:ring-main/30";

// A switch per weekday, with opening and closing times when the station is open that day
export default function OpeningHoursEditor({
  rows,
  onChange,
}: {
  rows: DayRow[];
  onChange: (rows: DayRow[]) => void;
}) {
  const setRow = (index: number, patch: Partial<DayRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const firstOpen = rows.find((r) => r.isOpen);
  const copyFirst = () =>
    firstOpen && onChange(rows.map((row) => (row.isOpen ? { ...row, open: firstOpen.open, close: firstOpen.close } : row)));

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border-default overflow-hidden rounded-xl border border-border-default bg-card">
        {rows.map((row, index) => {
          const label = WEEKDAY_LABELS[row.day].long;
          const error = rowError(row);
          return (
            <li key={row.day} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <Toggle
                checked={row.isOpen}
                onChange={(isOpen) => setRow(index, { isOpen })}
                label={`Open on ${label}`}
              />
              <span className={cn("w-24 text-sm font-semibold", row.isOpen ? "text-foreground" : "text-foreground-muted")}>
                {label}
              </span>
              {row.isOpen ? (
                <div className="flex min-w-[200px] flex-1 items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${label} opens at`}
                    value={row.open}
                    onChange={(e) => setRow(index, { open: e.target.value })}
                    className={cn(timeClass, error && "border-red-400")}
                  />
                  <span className="text-sm text-foreground-muted">to</span>
                  <input
                    type="time"
                    aria-label={`${label} closes at`}
                    value={row.close}
                    onChange={(e) => setRow(index, { close: e.target.value })}
                    className={cn(timeClass, error && "border-red-400")}
                  />
                </div>
              ) : (
                <span className="text-sm text-foreground-muted">Closed</span>
              )}
              {error && (
                <p role="alert" className="w-full pl-[3.75rem] text-xs font-medium text-red-500">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {firstOpen && rows.filter((r) => r.isOpen).length > 1 && (
        <button
          type="button"
          onClick={copyFirst}
          className="flex items-center gap-1.5 self-start text-xs font-semibold text-main"
        >
          <Copy size={13} />
          Use {WEEKDAY_LABELS[firstOpen.day].long}&apos;s hours for every open day
        </button>
      )}
    </div>
  );
}
