// Guide 7.1: ranges are counted in Lagos days, so a seller's "today" matches their clock.
// Lagos is UTC+1 all year (no daylight saving).

export const RANGES = ['7d', '30d', '90d'] as const;
export type Range = (typeof RANGES)[number];

export const METRICS = ['revenue', 'orders', 'views'] as const;
export type Metric = (typeof METRICS)[number];

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 };
const DAY_MS = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

// The Lagos calendar day of an instant, as 'YYYY-MM-DD'
export function lagosDay(at: Date): string {
  return new Date(at.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// The instant a Lagos day starts
function dayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - LAGOS_OFFSET_MS);
}

export interface DayWindow {
  firstDay: string;
  lastDay: string;
  from: Date; // inclusive
  to: Date; // exclusive
}

function window(firstDay: string, lastDay: string): DayWindow {
  return {
    firstDay,
    lastDay,
    from: dayStart(firstDay),
    to: dayStart(addDays(lastDay, 1)),
  };
}

// The last N Lagos days including today, and the N days before them for the change
export function rangeWindows(
  range: Range,
  now: Date,
): { current: DayWindow; previous: DayWindow } {
  const days = RANGE_DAYS[range];
  const today = lagosDay(now);
  const first = addDays(today, -(days - 1));
  return {
    current: window(first, today),
    previous: window(addDays(first, -days), addDays(first, -1)),
  };
}

// Every day of a window, oldest first
export function daysOf(w: DayWindow): string[] {
  const days: string[] = [];
  for (let d = w.firstDay; d <= w.lastDay; d = addDays(d, 1)) days.push(d);
  return days;
}

// Guide 7.1: (current - previous) / previous * 100, to one decimal; null when there was nothing before
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// Units sold per view, as a percentage to one decimal; null with no views
export function conversionPct(units: number, views: number): number | null {
  if (views === 0) return null;
  return Math.round((units / views) * 1000) / 10;
}

export interface StockRow {
  id: string;
  title: string;
  stock: number;
  imageUrl: string | null;
  variants: { id: string; label: string; stock: number }[]; // active options only
}

export interface StockAlert {
  listingId: string;
  variantId: string | null;
  title: string;
  variantLabel: string | null;
  imageUrl: string | null;
  stock: number;
}

// Guide 7.1: an item with its options counts per option; otherwise the listing's own stock.
// Out of stock first, then the fewest left.
export function stockAlerts(rows: StockRow[], threshold: number): StockAlert[] {
  const alerts = rows.flatMap((l): StockAlert[] => {
    const base = { listingId: l.id, title: l.title, imageUrl: l.imageUrl };
    if (l.variants.length) {
      return l.variants
        .filter((v) => v.stock <= threshold)
        .map((v) => ({
          ...base,
          variantId: v.id,
          variantLabel: v.label,
          stock: v.stock,
        }));
    }
    return l.stock <= threshold
      ? [{ ...base, variantId: null, variantLabel: null, stock: l.stock }]
      : [];
  });
  return alerts.sort(
    (a, b) =>
      a.stock - b.stock ||
      a.title.localeCompare(b.title) ||
      (a.variantLabel ?? '').localeCompare(b.variantLabel ?? ''),
  );
}
