/** Date helpers. All dates crossing the DB boundary are `YYYY-MM-DD` strings (Postgres `date`). */

export type ISODate = string;

export function toISODate(d: Date): ISODate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

export function daysBetween(start: ISODate, end: ISODate): number {
  const a = parseISODate(start).getTime();
  const b = parseISODate(end).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function isWeekend(s: ISODate): boolean {
  const day = parseISODate(s).getUTCDay();
  return day === 0 || day === 6;
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  // Guard against inverted ranges producing an infinite loop.
  if (daysBetween(start, end) < 0) return out;
  while (daysBetween(cur, end) >= 0) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export interface WorkingDayResult {
  workingDays: number;
  calendarDays: number;
  weekendDays: number;
  holidayDays: number;
  holidayNames: string[];
}

/**
 * Working days between two inclusive dates, excluding weekends and office holidays.
 * Half-day flags shave 0.5 off each end when that end is itself a working day.
 */
export function calcWorkingDays(
  start: ISODate,
  end: ISODate,
  holidays: { holidayDate: string; name: string }[] = [],
  opts: { halfDayStart?: boolean; halfDayEnd?: boolean } = {},
): WorkingDayResult {
  const holidayMap = new Map(holidays.map((h) => [h.holidayDate, h.name]));
  const days = eachDay(start, end);
  let working = 0;
  let weekend = 0;
  let holiday = 0;
  const holidayNames: string[] = [];

  for (const d of days) {
    if (isWeekend(d)) {
      weekend++;
      continue;
    }
    const hit = holidayMap.get(d);
    if (hit) {
      holiday++;
      if (!holidayNames.includes(hit)) holidayNames.push(hit);
      continue;
    }
    working++;
  }

  if (working > 0) {
    if (opts.halfDayStart && !isWeekend(start) && !holidayMap.has(start)) working -= 0.5;
    if (opts.halfDayEnd && end !== start && !isWeekend(end) && !holidayMap.has(end)) working -= 0.5;
  }

  return {
    workingDays: Math.max(0, working),
    calendarDays: days.length,
    weekendDays: weekend,
    holidayDays: holiday,
    holidayNames,
  };
}

export function overlaps(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate) {
  return daysBetween(aStart, bEnd) >= 0 && daysBetween(bStart, aEnd) >= 0;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatDate(d: Date | string | null | undefined, style: 'short' | 'medium' | 'long' = 'medium') {
  if (!d) return '—';
  const date = typeof d === 'string' ? (d.length === 10 ? parseISODate(d) : new Date(d)) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
      : style === 'long'
        ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
        : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat('en-GB', opts).format(date);
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatRange(start: ISODate, end: ISODate) {
  if (start === end) return formatDate(start);
  const a = parseISODate(start);
  const b = parseISODate(end);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${formatDate(end)}`;
  }
  return `${formatDate(start, 'short')} – ${formatDate(end)}`;
}

export function relativeTime(d: Date | string | null | undefined, now = new Date()) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

export function hoursBetween(a: Date | string, b: Date | string) {
  const t1 = typeof a === 'string' ? new Date(a).getTime() : a.getTime();
  const t2 = typeof b === 'string' ? new Date(b).getTime() : b.getTime();
  return (t2 - t1) / 3_600_000;
}

export function formatDuration(hours: number) {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function monthKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Last N month keys ending with the month containing `ref`, oldest first. */
export function lastNMonths(n: number, ref = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

export function quarterOf(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return Math.floor(date.getUTCMonth() / 3) + 1;
}
