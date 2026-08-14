import { common } from './messages/common';
import { domain } from './messages/domain';
import { shell } from './messages/shell';
import { pages } from './messages/pages';
import { forms } from './messages/forms';
import { admin } from './messages/admin';
import { ai } from './messages/ai';
import { DEFAULT_LOCALE, type Locale, type MessageEntry, type Vars } from './types';

/**
 * The message registry.
 *
 * Each namespace declares English and Korean side by side, so a message can never
 * exist in one language only — `MessageEntry` requires both and the compiler
 * enforces it. `scripts/i18n-audit.ts` additionally checks for empty strings,
 * duplicate keys and placeholder mismatches between the two languages.
 */
export const MESSAGES = {
  ...common,
  ...domain,
  ...shell,
  ...pages,
  ...forms,
  ...admin,
  ...ai,
} as const;

export type MessageKey = keyof typeof MESSAGES;

/**
 * Resolves a message and substitutes `{placeholder}` slots.
 *
 * An unknown key returns the key itself rather than an empty string — a visible
 * `approvals.title` in the UI is a bug report; a blank space is a mystery.
 */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const entry = (MESSAGES as Record<string, MessageEntry | undefined>)[key];
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[i18n] missing message key: ${key}`);
    }
    return key;
  }

  const template = entry[locale] ?? entry[DEFAULT_LOCALE];
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export type Translator = (key: string, vars?: Vars) => string;

export function createTranslator(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}

/**
 * Looks up a message that may not exist — used for values that come from the
 * database (department codes, workflow step names, category codes seeded in
 * English). Falls back to the raw value so unmapped data still reads sensibly.
 */
export function translateOr(locale: Locale, key: string, fallback: string, vars?: Vars): string {
  const entry = (MESSAGES as Record<string, MessageEntry | undefined>)[key];
  if (!entry) return fallback;
  return translate(locale, key, vars);
}

export * from './types';
