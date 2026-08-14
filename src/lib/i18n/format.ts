import { LOCALE_META, type Locale } from './types';

/**
 * Locale-aware formatting.
 *
 * Korean conventions differ in ways that matter here: dates read
 * `2026년 9월 10일` rather than `10 Sep 2026`, and large sums are commonly read
 * in 만/억 units rather than K/M. Both are handled below so figures look native
 * rather than translated.
 */

const NO_DECIMAL = ['KRW', 'VND', 'JPY'];

export function formatMoneyL(
  locale: Locale,
  amount: number | string | null | undefined,
  currency = 'USD',
): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const digits = NO_DECIMAL.includes(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(LOCALE_META[locale].intl, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(digits)}`;
  }
}

/**
 * Compact money for dashboard tiles.
 *
 * Intl's Korean compact notation gives 2.8만 for 28,000 — correct Korean, but the
 * figures here are USD, where a Korean reader still expects thousands grouping.
 * So Korean uses the same K/M scale as English with a localized currency symbol,
 * which is what Korean finance teams use for dollar amounts.
 */
export function formatCompactL(locale: Locale, amount: number | string | null | undefined, currency = 'USD'): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(locale === 'ko' ? 'en-US' : LOCALE_META[locale].intl, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(0)}`;
  }
}

export function formatNumberL(locale: Locale, value: number): string {
  return new Intl.NumberFormat(LOCALE_META[locale].intl).format(value);
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function formatDateL(
  locale: Locale,
  d: Date | string | null | undefined,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? (d.length === 10 ? parseISO(d) : new Date(d)) : d;
  if (Number.isNaN(date.getTime())) return '—';

  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
      : style === 'long'
        ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
        : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };

  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, opts).format(date);
}

export function formatDateTimeL(locale: Locale, d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatRangeL(locale: Locale, start: string, end: string): string {
  if (start === end) return formatDateL(locale, start);
  const a = parseISO(start);
  const b = parseISO(end);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return locale === 'ko'
      ? `${formatDateL(locale, start)} – ${b.getUTCDate()}일`
      : `${a.getUTCDate()}–${formatDateL(locale, end)}`;
  }
  return `${formatDateL(locale, start, 'short')} – ${formatDateL(locale, end)}`;
}

export function formatDurationL(locale: Locale, hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  const unit = locale === 'ko' ? { m: '분', h: '시간', d: '일' } : { m: 'm', h: 'h', d: 'd' };
  if (hours < 1) return `${Math.round(hours * 60)}${unit.m}`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}${unit.h}`;
  return `${(hours / 24).toFixed(1)}${unit.d}`;
}

/** Month label for chart axes. */
export function monthLabelL(locale: Locale, key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function relativeTimeL(locale: Locale, d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(LOCALE_META[locale].intl, { numeric: 'auto' });
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
  return locale === 'ko' ? '방금 전' : 'just now';
}

/** Weekday headers for the calendar grid, Monday first. */
export function weekdayLabels(locale: Locale): string[] {
  if (locale === 'ko') return ['월', '화', '수', '목', '금', '토', '일'];
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
}
