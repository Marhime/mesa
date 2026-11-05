// Calendar-day helpers for expiry dates ("YYYY-MM-DD", as Postgres `date` columns come back). Pure.

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from today to `iso` (negative when past). */
export function daysUntil(iso: string, today: Date = new Date()): number {
  return Math.round((startOfDay(parseDay(iso)) - startOfDay(today)) / MS_PER_DAY);
}

/** "YYYY-MM-DD", `days` from today. */
export function isoInDays(days: number, today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Today", "Tomorrow", "3 days" (past dates read "Today": use it now). */
export function untilLabel(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

/** A date chip: the weekday within the coming week ("Sun"), otherwise "Nov 25". */
export function dayLabel(iso: string, today: Date = new Date()): string {
  const days = daysUntil(iso, today);
  const date = parseDay(iso);
  try {
    if (days >= 0 && days < 7) {
      return days === 0 ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
    }
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  } catch {
    return iso;
  }
}

/** "today", "yesterday", "Saturday" within the last week (recent), else "Nov 1". */
export function recentDayName(timestamp: string, today: Date = new Date()): { name: string; recent: boolean } {
  const date = new Date(timestamp);
  const days = Math.round((startOfDay(today) - startOfDay(date)) / MS_PER_DAY);
  if (days === 0) return { name: 'today', recent: true };
  if (days === 1) return { name: 'yesterday', recent: true };
  try {
    if (days < 7) return { name: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date), recent: true };
    return { name: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date), recent: false };
  } catch {
    return { name: date.toDateString(), recent: false };
  }
}
