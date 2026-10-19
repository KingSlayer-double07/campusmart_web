// Arrival windows are typed as a local start time and a length (decision DF8b)
export const WINDOW_HOURS = [1, 2, 3, 4] as const;

const pad = (n: number) => String(n).padStart(2, "0");

// "2026-10-18T14:30" for <input type="datetime-local">, in the phone's own time zone
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The next half hour at least an hour from now: a sensible first suggestion
export function suggestedStart(now = new Date()): string {
  const start = new Date(now.getTime() + 60 * 60_000);
  start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
  return toLocalInput(start);
}

export function windowFrom(startLocal: string, hours: number): { from: string; to: string } | null {
  const from = new Date(startLocal);
  if (Number.isNaN(from.getTime())) return null;
  return { from: from.toISOString(), to: new Date(from.getTime() + hours * 3_600_000).toISOString() };
}

// The same checks the API makes, so the rider hears about a problem before sending
export function windowError(window: { from: string; to: string } | null, deadline: string | null, now = new Date()): string | null {
  if (!window) return "Choose when you will arrive";
  if (new Date(window.to).getTime() < now.getTime()) return "That time has already passed";
  if (deadline && new Date(window.from).getTime() > new Date(deadline).getTime()) {
    return "That's after this store's pickup deadline";
  }
  return null;
}
