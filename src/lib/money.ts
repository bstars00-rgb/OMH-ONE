import type { Currency } from '@/types/domain';

export const BASE_CURRENCY: Currency = 'USD';

/**
 * Static reference rates (units of quote currency per 1 USD).
 * Seeded into `exchange_rates`; the DB row is authoritative at write time so
 * historical requests keep the rate that was used when they were captured.
 */
export const REFERENCE_RATES: Record<Currency, number> = {
  USD: 1,
  KRW: 1385,
  VND: 25400,
  JPY: 156,
  SGD: 1.34,
  EUR: 0.92,
  THB: 35.5,
};

export function toBase(amount: number, currency: Currency, rate?: number): number {
  const r = rate ?? REFERENCE_RATES[currency] ?? 1;
  return round2(amount / r);
}

export function fromBase(amountBase: number, currency: Currency, rate?: number): number {
  const r = rate ?? REFERENCE_RATES[currency] ?? 1;
  return round2(amountBase * r);
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const NO_DECIMAL: Currency[] = ['KRW', 'VND', 'JPY'];

export function formatMoney(amount: number | string | null | undefined, currency: Currency | string = BASE_CURRENCY) {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const digits = NO_DECIMAL.includes(currency as Currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(digits)}`;
  }
}

/** Compact form for dashboard tiles: $28.4k, $1.2M */
export function formatCompact(amount: number | string | null | undefined, currency = BASE_CURRENCY) {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(safe);
}

export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/** Drizzle `numeric` columns round-trip as strings. */
export function dec(v: number): string {
  return round2(v).toFixed(2);
}
