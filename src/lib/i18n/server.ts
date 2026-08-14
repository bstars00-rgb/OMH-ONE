import 'server-only';
import { cookies } from 'next/headers';
import { createTranslator, translateOr, type Translator } from './index';
import { DEFAULT_LOCALE, isLocale, type Locale, type Vars } from './types';

export const LOCALE_COOKIE = 'ohmy_locale';

/**
 * Resolves the active locale for this request.
 *
 * Cookie-based rather than URL-prefixed (`/ko/...`). A prefix scheme would mean
 * moving all 26 routes under `[locale]/` and rewriting every internal link — a
 * large change whose benefits (per-language URLs, SEO) do not apply to an
 * internal tool behind a login. The trade-off is recorded in docs/DECISIONS.md.
 */
export async function getLocale(): Promise<Locale> {
  try {
    const jar = await cookies();
    const value = jar.get(LOCALE_COOKIE)?.value;
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    // Outside a request scope (build-time evaluation).
    return DEFAULT_LOCALE;
  }
}

/** Server-side translator. `const t = await getT()` at the top of a page. */
export async function getT(): Promise<Translator> {
  return createTranslator(await getLocale());
}

/** Translator plus the locale, when the caller also needs to format dates or money. */
export async function getI18n(): Promise<{ t: Translator; locale: Locale; tOr: (key: string, fallback: string, vars?: Vars) => string }> {
  const locale = await getLocale();
  return {
    locale,
    t: createTranslator(locale),
    tOr: (key, fallback, vars) => translateOr(locale, key, fallback, vars),
  };
}
