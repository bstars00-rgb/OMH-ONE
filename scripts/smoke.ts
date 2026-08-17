/**
 * Route smoke test: signs in as each demo account and requests every page,
 * asserting the HTTP status and reporting anything that errors.
 *
 *   npx tsx scripts/smoke.ts [baseUrl]
 *
 * This is the "is every button real" check at the routing level — a page that
 * throws returns 500 here rather than being discovered by a human clicking around.
 *
 * Each page is also scanned for untranslated message keys. Every role is swept in
 * both languages, because a key that only exists in one namespace still renders
 * as a literal "approverRole.CTO" for the reader who hits it.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';

const LOCALES = ['en', 'ko'] as const;

const ACCOUNTS = [
  { label: 'Director', email: 'aiden@ohmyhotel.com' },
  { label: 'Admin', email: 'admin@ohmyhotel.com' },
  { label: 'HR', email: 'mia@ohmyhotel.com' },
  { label: 'Finance', email: 'finance@ohmyhotel.com' },
  { label: 'Manager', email: 'vicky@ohmyhotel.com' },
  { label: 'Employee', email: 'employee@ohmyhotel.com' },
  { label: 'Auditor', email: 'auditor@ohmyhotel.com' },
];

const ROUTES = [
  '/',
  '/assistant',
  '/approvals',
  '/approvals?view=all',
  '/requests',
  '/requests/new',
  '/requests/new/LEAVE',
  '/requests/new/BUSINESS_TRIP',
  '/requests/new/PURCHASE',
  '/requests/new/EXPENSE',
  '/requests/new/HR',
  '/requests/new/GENERAL',
  '/people',
  '/leave',
  '/calendar',
  '/expenses',
  '/procurement',
  '/budgets',
  '/travel',
  '/analytics',
  '/reports',
  '/audit',
  '/admin/templates',
  '/admin/workflows',
  '/admin/policies',
  '/admin/organization',
  '/admin/users',
  '/admin/settings',
];

const REPORTS = ['approvals', 'leave', 'leave-balances', 'travel', 'expenses', 'procurement', 'budgets', 'departments', 'sla', 'ai-risk'];

/**
 * Finds message keys that reached the DOM as text.
 *
 * `translate()` returns the key itself when it is missing, which is deliberate —
 * a visible "approvals.title" is a bug report. This turns that visible bug into a
 * failing test. Keys built dynamically (`t(\`type.${x}\`)`) are exactly the ones
 * static analysis cannot see, so this is the net that catches them.
 */
const KEY_IN_TEXT = />\s*([a-z][a-zA-Z]*\.[a-zA-Z][\w.]*)\s*</g;

/**
 * The same leak, one layer down.
 *
 * Client components render after hydration, so their text is never in the HTML
 * this script fetches — a chart axis reading `expenseCategory.EVENT_FEE` passed
 * every route check while being plainly visible in the browser. The labels do
 * travel, as props inside the RSC flight payload, so they are scanned there too.
 *
 * Restricted to the enum prefixes rather than any dotted word: those are the
 * keys built dynamically, and a narrow pattern keeps the payload's own
 * identifiers from reading as failures.
 */
const ENUM_PREFIXES = [
  'type',
  'status',
  'role',
  'approverRole',
  'leaveType',
  'expenseCategory',
  'tripCost',
  'purchaseCategory',
  'payment',
  'policyMetric',
  'policySeverity',
  'budgetCategory',
];
const KEY_IN_PAYLOAD = new RegExp(`\\b(${ENUM_PREFIXES.join('|')})\\.[A-Z][A-Z0-9_]*\\b`, 'g');

/** Identifiers the UI shows on purpose: setting names, file names, env vars. */
const NOT_A_KEY = /\.(pdf|png|jpe?g|csv|com|ts|tsx|js|css|local|env)$/;
const DELIBERATE = new Set([
  'ai.enabled',
  'approval.defaultSlaHours',
  'approver.CEO',
  'approver.CTO',
  'approver.DIRECTOR',
  'company.baseCurrency',
  'company.name',
  'demo.mode',
]);

function untranslatedKeys(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(KEY_IN_TEXT)) {
    const candidate = m[1];
    if (NOT_A_KEY.test(candidate) || DELIBERATE.has(candidate)) continue;
    found.add(candidate);
  }
  for (const m of html.matchAll(KEY_IN_PAYLOAD)) {
    if (!DELIBERATE.has(m[0])) found.add(m[0]);
  }
  return [...found];
}

/**
 * Signs in via the test-support endpoint, which only responds when the server was
 * started with ENABLE_TEST_LOGIN=1 (see `npm run test:routes`).
 */
async function login(email: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/test-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
    redirect: 'manual',
  });
  if (!res.ok) return null;
  const cookie = res.headers.getSetCookie?.().find((c) => c.startsWith('ohmy_session='));
  return cookie ? cookie.split(';')[0] : null;
}

async function main() {
  let failures = 0;
  let checks = 0;

  console.log(`\nSmoke test against ${BASE}\n${'='.repeat(60)}`);

  for (const account of ACCOUNTS) {
    const cookie = await login(account.email);
    if (!cookie) {
      console.log(`\n${account.label.padEnd(9)} ✗ could not sign in as ${account.email}`);
      failures++;
      continue;
    }

    const results: string[] = [];
    for (const locale of LOCALES) {
      const headers = { cookie: `${cookie}; ohmy_locale=${locale}` };
      for (const route of ROUTES) {
        const res = await fetch(`${BASE}${route}`, { headers, redirect: 'manual' });
        checks++;
        // 200 = rendered (may be a 403 panel, which is a correct outcome).
        // 307 = redirected, also acceptable for a guarded route.
        if (res.status >= 500) {
          results.push(`  ✗ [${locale}] ${route} → ${res.status}`);
          failures++;
          continue;
        }
        if (res.status === 200) {
          const leaked = untranslatedKeys(await res.text());
          if (leaked.length) {
            results.push(`  ✗ [${locale}] ${route} → untranslated: ${leaked.slice(0, 5).join(', ')}`);
            failures++;
          }
        }
      }
    }

    for (const key of REPORTS) {
      const res = await fetch(`${BASE}/api/reports/${key}`, { headers: { cookie }, redirect: 'manual' });
      checks++;
      if (res.status >= 500) {
        results.push(`  ✗ /api/reports/${key} → ${res.status}`);
        failures++;
      }
    }

    console.log(`\n${account.label.padEnd(9)} ${results.length === 0 ? '✓ all routes OK' : `${results.length} failure(s)`}`);
    results.forEach((r) => console.log(r));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${checks} checks · ${failures} failure(s)\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
