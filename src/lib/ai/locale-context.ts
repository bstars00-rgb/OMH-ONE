import 'server-only';
import { createTranslator, translateOr } from '@/lib/i18n';
import { formatDateL, formatMoneyL, formatRangeL } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/types';
import type { AiLocaleContext } from './types';

/**
 * Bundles the translator and the locale-aware formatters the AI layer needs.
 *
 * Money and dates are bound here rather than imported inside the provider so a
 * sentence and the figure inside it can never disagree about locale.
 */
export function aiLocale(locale: Locale): AiLocaleContext {
  const t = createTranslator(locale);
  return {
    locale,
    t,
    tOr: (key, fallback, vars) => translateOr(locale, key, fallback, vars),
    money: (amount, currency = 'USD') => formatMoneyL(locale, amount, currency),
    date: (value) => formatDateL(locale, value),
    range: (start, end) => formatRangeL(locale, start, end),
  };
}
