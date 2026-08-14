/**
 * Route smoke test: signs in as each demo account and requests every page,
 * asserting the HTTP status and reporting anything that errors.
 *
 *   npx tsx scripts/smoke.ts [baseUrl]
 *
 * This is the "is every button real" check at the routing level — a page that
 * throws returns 500 here rather than being discovered by a human clicking around.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';

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
  '/admin/workflows',
  '/admin/policies',
  '/admin/organization',
  '/admin/users',
  '/admin/settings',
];

const REPORTS = ['approvals', 'leave', 'leave-balances', 'travel', 'expenses', 'procurement', 'budgets', 'departments', 'sla', 'ai-risk'];

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
    for (const route of ROUTES) {
      const res = await fetch(`${BASE}${route}`, { headers: { cookie }, redirect: 'manual' });
      checks++;
      // 200 = rendered (may be a 403 panel, which is a correct outcome).
      // 307 = redirected, also acceptable for a guarded route.
      if (res.status >= 500) {
        results.push(`  ✗ ${route} → ${res.status}`);
        failures++;
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
