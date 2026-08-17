/**
 * Test harness for the functional QA suite.
 *
 * The suite runs against its own throwaway PGlite database in memory, so it
 * never touches ./.pgdata and can run while the dev server is up. That matters:
 * PGlite is single-writer, and a second process opening the same directory
 * corrupts it.
 *
 * Nothing is mocked. The tests call the same service functions the server
 * actions call, so a passing assertion means the real code path works.
 */

export interface Ctx {
  section: (title: string) => void;
  check: (label: string, fn: () => Promise<void> | void) => Promise<void>;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentSection = '';

export function section(title: string) {
  currentSection = title;
  console.log(`\n${title}`);
  console.log('-'.repeat(Math.max(title.length, 40)));
}

/** Runs one assertion, reporting rather than throwing so the suite completes. */
export async function check(label: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`[${currentSection}] ${label}\n      ${msg}`);
    console.log(`  ✗ ${label}\n      ${msg}`);
  }
}

/** Asserts the call throws, and that the reason matches. Silence is a failure. */
export async function checkRejects(label: string, fn: () => Promise<unknown>, expected?: RegExp | string) {
  await check(label, async () => {
    let threw: unknown;
    try {
      await fn();
    } catch (err) {
      threw = err;
    }
    if (threw === undefined) throw new Error('expected it to be refused, but it succeeded');
    if (expected) {
      const msg = threw instanceof Error ? threw.message : String(threw);
      const ok = typeof expected === 'string' ? msg.includes(expected) : expected.test(msg);
      if (!ok) throw new Error(`refused, but with "${msg}" instead of ${expected}`);
    }
  });
}

export function eq<T>(actual: T, expected: T, what = 'value') {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function near(actual: number, expected: number, tolerance = 0.01, what = 'value') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${what}: expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

export function truthy(value: unknown, what = 'value') {
  if (!value) throw new Error(`${what}: expected something truthy, got ${JSON.stringify(value)}`);
}

export function report(title: string): number {
  console.log(`\n${'='.repeat(72)}`);
  if (failures.length) {
    console.log(`${title}\n`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    console.log('');
  }
  console.log(`${passed + failed} checks · ${failed} failure(s)`);
  return failed;
}
