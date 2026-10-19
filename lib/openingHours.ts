import type { OpeningHours, Weekday } from '@/lib/api/admin';

export const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const WEEKDAY_LABELS: Record<Weekday, { short: string; long: string }> = {
  MON: { short: 'Mon', long: 'Monday' },
  TUE: { short: 'Tue', long: 'Tuesday' },
  WED: { short: 'Wed', long: 'Wednesday' },
  THU: { short: 'Thu', long: 'Thursday' },
  FRI: { short: 'Fri', long: 'Friday' },
  SAT: { short: 'Sat', long: 'Saturday' },
  SUN: { short: 'Sun', long: 'Sunday' },
};

export interface HoursLine {
  days: string; // 'Mon–Fri', 'Sat', 'Mon, Wed'
  hours: string; // '09:00–17:00'
}

// Groups consecutive days that share the same hours, Monday first:
// [Mon–Fri 09:00–17:00, Sat 10:00–14:00]. Days not listed are closed and left out.
export function summarizeOpeningHours(hours: OpeningHours[]): HoursLine[] {
  const byDay = new Map(hours.map((h) => [h.day, h]));
  const lines: { from: Weekday; to: Weekday; hours: string }[] = [];
  let previous: Weekday | null = null;

  for (const day of WEEKDAYS) {
    const entry = byDay.get(day);
    if (!entry) {
      previous = null;
      continue;
    }
    const range = `${entry.open}–${entry.close}`;
    const last = lines[lines.length - 1];
    if (last && previous && last.to === previous && last.hours === range) {
      last.to = day;
    } else {
      lines.push({ from: day, to: day, hours: range });
    }
    previous = day;
  }

  return lines.map(({ from, to, hours: range }) => ({
    days:
      from === to
        ? WEEKDAY_LABELS[from].short
        : `${WEEKDAY_LABELS[from].short}–${WEEKDAY_LABELS[to].short}`,
    hours: range,
  }));
}

// The same check the API makes, so the form can say what's wrong before saving
export function openingHoursError(hours: OpeningHours[]): string | null {
  if (hours.length === 0) return 'Open the station on at least one day';
  for (const h of hours) {
    if (!h.open || !h.close) return `${WEEKDAY_LABELS[h.day].long}: set both times`;
    if (h.close <= h.open) return `${WEEKDAY_LABELS[h.day].long}: closing time must be after opening time`;
  }
  return null;
}

// One row per weekday for the hours editor. Closed days keep their times, so switching a day
// back on restores what it had.
export interface DayRow {
  day: Weekday;
  isOpen: boolean;
  open: string;
  close: string;
}

const WEEKDAY_DEFAULT = { open: '09:00', close: '17:00' };

export function rowsFromHours(hours: OpeningHours[] | null | undefined): DayRow[] {
  // A new station starts open Monday to Friday, 9 to 5
  if (!hours) {
    return WEEKDAYS.map((day) => ({ day, isOpen: !['SAT', 'SUN'].includes(day), ...WEEKDAY_DEFAULT }));
  }
  const byDay = new Map(hours.map((h) => [h.day, h]));
  return WEEKDAYS.map((day) => {
    const entry = byDay.get(day);
    return entry
      ? { day, isOpen: true, open: entry.open, close: entry.close }
      : { day, isOpen: false, ...WEEKDAY_DEFAULT };
  });
}

export function hoursFromRows(rows: DayRow[]): OpeningHours[] {
  return rows.filter((r) => r.isOpen).map(({ day, open, close }) => ({ day, open, close }));
}

export function rowError(row: DayRow): string | null {
  if (!row.isOpen) return null;
  if (!row.open || !row.close) return 'Set both times';
  return row.close <= row.open ? 'Closes before it opens' : null;
}
