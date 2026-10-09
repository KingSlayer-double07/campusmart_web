"use client";

import Button from "@/app/components/Button";
import { cn } from "@/lib/utils/cn";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Extra classes for this column's cells on wide screens */
  className?: string;
  /** On phone cards, give this value the full card width (long lists such as domains or hours) */
  wide?: boolean;
  /** Leave this column off phone cards (e.g. a status already shown under the card title) */
  hideOnPhone?: boolean;
}

interface DataTableProps<T> {
  /** What the rows are, for screen readers: "Institutions" */
  label: string;
  /** The first column is each phone card's title */
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  rowActions?: (row: T) => React.ReactNode;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Shown when the list loads with no rows */
  empty: React.ReactNode;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

// The admin console's one table (guide 9.2.3). A table on wide screens and a stack of cards on
// phones, with loading, error, empty and "load more" (cursor paging) states built in.
export default function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowActions,
  isLoading,
  isError,
  onRetry,
  empty,
  hasMore,
  onLoadMore,
  isLoadingMore,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div aria-busy="true" aria-label={`Loading ${label.toLowerCase()}`} className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-border-default bg-card p-4">
            <div className="h-4 w-1/3 rounded bg-surface-muted" />
            <div className="mt-3 h-3 w-2/3 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-default bg-card px-6 py-12 text-center">
        <p className="text-sm text-foreground-muted">We couldn&apos;t load {label.toLowerCase()}.</p>
        <button type="button" onClick={onRetry} className="text-sm font-semibold text-main">
          Try again
        </button>
      </div>
    );
  }

  if (!rows || rows.length === 0) return <>{empty}</>;

  const [titleColumn, ...rest] = columns;
  const detailColumns = rest.filter((column) => !column.hideOnPhone);

  return (
    <div className="flex flex-col gap-4">
      {/* Wide screens: a table */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border-default bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="border-b border-border-default bg-surface-muted/60">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted"
                  >
                    {column.header}
                  </th>
                ))}
                {rowActions && (
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {rows.map((row) => (
                <tr key={rowKey(row)} className="align-top transition-colors hover:bg-surface-muted/40">
                  {columns.map((column) => (
                    <td key={column.key} className={cn("px-4 py-4", column.className)}>
                      {column.cell(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">{rowActions(row)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phones: one card per row */}
      <ul aria-label={label} className="md:hidden flex flex-col gap-3">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-2xl border border-border-default bg-card p-4">
            <div>{titleColumn.cell(row)}</div>
            {detailColumns.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                {detailColumns.map((column) => (
                  <div key={column.key} className={cn("min-w-0", column.wide && "col-span-2")}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
                      {column.header}
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {rowActions && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border-default pt-3">{rowActions(row)}</div>
            )}
          </li>
        ))}
      </ul>

      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="w-auto" onClick={onLoadMore} loading={isLoadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

// Small pill buttons for row actions
export function RowAction({
  onClick,
  icon: Icon,
  children,
  tone = "default",
}: {
  onClick: () => void;
  icon?: React.ElementType;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors active:scale-95",
        tone === "danger"
          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-border-default bg-card text-foreground hover:bg-surface-muted",
      )}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}
