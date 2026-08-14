/**
 * Translation completeness audit.
 *
 *   npm run i18n:audit
 *
 * The `MessageEntry` type already makes a one-language message a compile error,
 * so this checks the things types cannot:
 *
 *   1. empty or whitespace-only translations
 *   2. Korean text left identical to the English (untranslated placeholder)
 *   3. `{placeholder}` slots that differ between the two languages — the most
 *      dangerous class, because it produces a literal "{count}" in the UI
 *   4. duplicate keys silently overwritten by the namespace spread
 *   5. keys referenced in source but absent from the dictionary
 *   6. keys defined but never referenced (dead weight)
 *   7. enum-derived key families with a missing member
 *
 * Check 7 exists because most domain labels are looked up as `t(\`type.${x}\`)`,
 * which check 5 cannot see. Adding a value to an enum without adding its message
 * used to surface as a raw "approverRole.CTO" in the UI; now it fails here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { MESSAGES } from '../src/lib/i18n';
import { common } from '../src/lib/i18n/messages/common';
import { domain } from '../src/lib/i18n/messages/domain';
import { shell } from '../src/lib/i18n/messages/shell';
import { pages } from '../src/lib/i18n/messages/pages';
import { forms } from '../src/lib/i18n/messages/forms';
import { admin } from '../src/lib/i18n/messages/admin';
import { ai } from '../src/lib/i18n/messages/ai';
import {
  APPROVER_ROLES,
  CURRENCIES,
  EXPENSE_CATEGORIES,
  LEAVE_TYPES,
  PAYMENT_METHODS,
  PURCHASE_CATEGORIES,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  ROLES,
  TRIP_COST_CATEGORIES,
} from '../src/types/domain';

const NAMESPACES = { common, domain, shell, pages, forms, admin, ai };

/**
 * Key families built from an enum at runtime.
 *
 * `suffixes` covers the variants a family carries (`.short`, `.desc`, `.tip`);
 * every listed combination must exist.
 */
const ENUM_FAMILIES: { prefix: string; values: readonly string[]; suffixes?: string[] }[] = [
  { prefix: 'type', values: REQUEST_TYPES, suffixes: ['', '.short'] },
  { prefix: 'status', values: REQUEST_STATUSES, suffixes: ['', '.tip'] },
  { prefix: 'role', values: ROLES, suffixes: ['', '.desc'] },
  { prefix: 'approverRole', values: APPROVER_ROLES },
  { prefix: 'leaveType', values: LEAVE_TYPES },
  { prefix: 'expenseCategory', values: EXPENSE_CATEGORIES },
  { prefix: 'tripCost', values: TRIP_COST_CATEGORIES },
  { prefix: 'purchaseCategory', values: PURCHASE_CATEGORIES },
  { prefix: 'payment', values: PAYMENT_METHODS, suffixes: ['', '.short'] },
  { prefix: 'new.blurb', values: REQUEST_TYPES },
  { prefix: 'new.desc', values: REQUEST_TYPES },
  { prefix: 'draft.example', values: REQUEST_TYPES },
];

/** Currencies are rendered as their own codes, never translated. */
void CURRENCIES;

/** Identical en/ko is legitimate for these — proper nouns, codes, symbols. */
const IDENTICAL_ALLOWED = new Set([
  'audit.ip',
  'org.code',
  'set.key',
  'language.label',
]);

const problems: string[] = [];
const warnings: string[] = [];

/* 1–3: per-entry checks -------------------------------------------------- */
for (const [key, entry] of Object.entries(MESSAGES)) {
  if (!entry.en?.trim()) problems.push(`empty English: ${key}`);
  if (!entry.ko?.trim()) problems.push(`empty Korean: ${key}`);

  if (entry.en === entry.ko && !IDENTICAL_ALLOWED.has(key)) {
    // Pure-symbol strings (arrows, punctuation) are fine to share.
    if (/[a-zA-Z]{3,}/.test(entry.en)) {
      warnings.push(`Korean identical to English: ${key} — "${entry.en}"`);
    }
  }

  const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const enSlots = slots(entry.en);
  const koSlots = slots(entry.ko);
  if (enSlots.join(',') !== koSlots.join(',')) {
    problems.push(
      `placeholder mismatch: ${key} — en {${enSlots.join(', ')}} vs ko {${koSlots.join(', ')}}`,
    );
  }
}

/* 4: duplicate keys across namespaces ------------------------------------ */
const seen = new Map<string, string>();
for (const [ns, table] of Object.entries(NAMESPACES)) {
  for (const key of Object.keys(table)) {
    const previous = seen.get(key);
    if (previous) problems.push(`duplicate key "${key}" in both ${previous} and ${ns} — one silently overwrites the other`);
    else seen.set(key, ns);
  }
}

/* 5–6: cross-reference against source ------------------------------------ */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.pgdata') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(full)) && !full.includes('i18n')) out.push(full);
  }
  return out;
}

const sourceFiles = walk('src');
const referenced = new Set<string>();
// Matches t('key'), tOr('key', …), t("key") and template-free literal keys.
const CALL = /\bt(?:Or)?\(\s*['"]([a-zA-Z][\w.-]*)['"]/g;
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(CALL)) referenced.add(m[1]);
}

const defined = new Set(Object.keys(MESSAGES));
for (const key of referenced) {
  // Dynamic keys are built as `status.${x}` and cannot be matched statically.
  if (!defined.has(key) && !key.includes('${')) problems.push(`referenced but not defined: ${key}`);
}

/* 7: enum-derived families ----------------------------------------------- */
for (const family of ENUM_FAMILIES) {
  for (const value of family.values) {
    for (const suffix of family.suffixes ?? ['']) {
      const key = `${family.prefix}.${value}${suffix}`;
      if (!defined.has(key)) problems.push(`enum family gap: ${key} (from ${family.prefix}.*)`);
      referenced.add(key); // built dynamically, so not "unused"
    }
  }
}

const unused = [...defined].filter((k) => !referenced.has(k));

/* Report ------------------------------------------------------------------ */
const total = Object.keys(MESSAGES).length;
console.log(`\nTranslation audit\n${'='.repeat(64)}`);
console.log(`${total} messages across ${Object.keys(NAMESPACES).length} namespaces, 2 languages`);
console.log(`${referenced.size} keys referenced statically in ${sourceFiles.length} source files`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.slice(0, 30).forEach((w) => console.log(`  ! ${w}`));
  if (warnings.length > 30) console.log(`  … and ${warnings.length - 30} more`);
}

if (unused.length) {
  console.log(`\n${unused.length} defined but not referenced statically (may be built dynamically):`);
  unused.slice(0, 20).forEach((k) => console.log(`  · ${k}`));
  if (unused.length > 20) console.log(`  … and ${unused.length - 20} more`);
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.log(`  ✗ ${p}`));
  console.log(`\n${'='.repeat(64)}\nFAILED\n`);
  process.exit(1);
}

console.log(`\n${'='.repeat(64)}`);
console.log('PASS — every message has both languages with matching placeholders\n');

export {};
