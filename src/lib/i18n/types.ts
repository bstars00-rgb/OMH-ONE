/**
 * Translation primitives.
 *
 * Every message is declared as a *pair* — English and Korean together in one
 * object — rather than as two parallel files. This is the mechanism that makes
 * the Korean pack complete by construction: `MessageEntry` requires both
 * languages, so adding a message in one language without the other is a
 * TypeScript error, not a missing string discovered at runtime.
 */

export const LOCALES = ['en', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_META: Record<Locale, { label: string; nativeLabel: string; intl: string; flag: string }> = {
  en: { label: 'English', nativeLabel: 'English', intl: 'en-GB', flag: 'EN' },
  ko: { label: 'Korean', nativeLabel: '한국어', intl: 'ko-KR', flag: 'KO' },
};

/** Both languages are mandatory. Omitting one fails the build. */
export interface MessageEntry {
  en: string;
  ko: string;
}

export type MessageTable = Record<string, MessageEntry>;

/** Values substituted into `{placeholder}` slots. */
export type Vars = Record<string, string | number>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
