import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Deterministic colour from a string — same employee always gets the same avatar tint. */
const AVATAR_TINTS = [
  'bg-sky-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-fuchsia-500',
];
export function avatarTint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Acronyms that must not be title-cased into "Hr" or "Scm". */
const ACRONYMS = new Set(['HR', 'IT', 'SCM', 'GSM', 'OP', 'CT', 'FIN', 'CEO', 'PR', 'AI', 'SLA']);

/** `DEPT_HEAD` → `Dept Head`, `HR` → `HR`. */
export function humanize(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => (ACRONYMS.has(part.toUpperCase()) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join(' ');
}

/** `plural(1, 'line')` → `1 line`; `plural(2, 'line')` → `2 lines`. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
