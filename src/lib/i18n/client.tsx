'use client';

import * as React from 'react';
import { createTranslator, translateOr, type Translator } from './index';
import { DEFAULT_LOCALE, type Locale, type Vars } from './types';

interface I18nValue {
  locale: Locale;
  t: Translator;
  tOr: (key: string, fallback: string, vars?: Vars) => string;
}

const I18nContext = React.createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE),
  tOr: (key, fallback, vars) => translateOr(DEFAULT_LOCALE, key, fallback, vars),
});

/**
 * Seeded once from the server layout, which already resolved the locale from the
 * cookie. Client components then translate synchronously with no extra fetch and
 * no hydration mismatch — server and client render from the same dictionary.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = React.useMemo<I18nValue>(
    () => ({
      locale,
      t: createTranslator(locale),
      tOr: (key, fallback, vars) => translateOr(locale, key, fallback, vars),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return React.useContext(I18nContext);
}

/** Shorthand for the common case. */
export function useT(): Translator {
  return React.useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return React.useContext(I18nContext).locale;
}
