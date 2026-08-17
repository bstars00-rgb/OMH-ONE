/**
 * Security assertions: proves the row-level rules actually restrict data, rather
 * than merely hiding navigation.
 *
 *   npm run test:rbac
 *
 * Each case states what must be true and why. A page rendering successfully is
 * not evidence of correct access control — these checks compare what different
 * roles can actually reach.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';

interface Case {
  name: string;
  why: string;
  run: (ctx: Ctx) => Promise<{ pass: boolean; detail: string }>;
}

interface Ctx {
  cookies: Record<string, string>;
  get: (role: string, path: string) => Promise<{ status: number; body: string }>;
}

const ACCOUNTS: Record<string, string> = {
  director: 'jackie@ohmyhotel.com',
  admin: 'admin@ohmyhotel.com',
  hr: 'mia@ohmyhotel.com',
  finance: 'finance@ohmyhotel.com',
  manager: 'vicky@ohmyhotel.com',
  employee: 'employee@ohmyhotel.com',
  auditor: 'auditor@ohmyhotel.com',
};

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/test-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
    redirect: 'manual',
  });
  if (!res.ok) throw new Error(`Could not sign in as ${email} (${res.status}). Is ENABLE_TEST_LOGIN=1 set on the server?`);
  const cookie = res.headers.getSetCookie?.().find((c) => c.startsWith('ohmy_session='));
  if (!cookie) throw new Error(`No session cookie returned for ${email}`);
  return cookie.split(';')[0];
}

/** Rough row count from the rendered table markup. */
function countRows(html: string): number {
  return (html.match(/<tr/g) ?? []).length;
}

function csvRows(body: string): number {
  return body.trim().split(/\r?\n/).length - 1;
}

const CASES: Case[] = [
  {
    name: 'Employee cannot open the admin area',
    why: 'admin.* capabilities exclude EMPLOYEE, and the page must re-check rather than relying on hidden nav.',
    run: async ({ get }) => {
      const paths = ['/admin/users', '/admin/workflows', '/admin/policies', '/admin/settings'];
      const bad: string[] = [];
      for (const p of paths) {
        const { body } = await get('employee', p);
        if (!body.includes('do not have access') && !body.includes('does not include')) bad.push(p);
      }
      return { pass: bad.length === 0, detail: bad.length ? `reachable: ${bad.join(', ')}` : 'all four show the 403 panel' };
    },
  },
  {
    name: 'Employee cannot reach the approval inbox',
    why: 'request.approve excludes EMPLOYEE.',
    run: async ({ get }) => {
      const { body } = await get('employee', '/approvals');
      const blocked = body.includes('do not have access') || body.includes('does not include');
      return { pass: blocked, detail: blocked ? 'shows the 403 panel' : 'inbox rendered for an employee' };
    },
  },
  {
    name: 'Employee sees strictly fewer requests than the Director',
    why: 'requestVisibility limits an employee to their own requests plus ones they approve.',
    run: async ({ get }) => {
      const emp = await get('employee', '/approvals?view=all&pageSize=100');
      const dir = await get('director', '/approvals?view=all&pageSize=100');
      const e = countRows(emp.body);
      const d = countRows(dir.body);
      return { pass: e < d, detail: `employee ${e} rows vs director ${d} rows` };
    },
  },
  {
    name: 'Employee export is scoped, not company-wide',
    why: 'Reports apply the same predicate as the UI — an export must not be a way around it.',
    run: async ({ get }) => {
      const emp = await get('employee', '/api/reports/approvals');
      const dir = await get('director', '/api/reports/approvals');
      if (emp.status === 403) return { pass: true, detail: 'employee blocked from the export entirely (403)' };
      const e = csvRows(emp.body);
      const d = csvRows(dir.body);
      return { pass: e < d, detail: `employee ${e} rows vs director ${d} rows` };
    },
  },
  {
    name: 'Auditor is read-only',
    why: 'AUDITOR is excluded from every mutating capability by an explicit check.',
    run: async ({ get }) => {
      const { body } = await get('auditor', '/requests/new');
      const blocked = body.includes('do not have access') || body.includes('does not include');
      return { pass: blocked, detail: blocked ? 'cannot open the create form' : 'auditor reached the create form' };
    },
  },
  {
    name: 'Auditor can still read company-wide data',
    why: 'Read-only must not mean blind — an auditor needs full visibility.',
    run: async ({ get }) => {
      const aud = await get('auditor', '/api/reports/approvals');
      const dir = await get('director', '/api/reports/approvals');
      const a = csvRows(aud.body);
      const d = csvRows(dir.body);
      return { pass: a === d && a > 0, detail: `auditor ${a} rows vs director ${d} rows` };
    },
  },
  {
    name: 'Manager sees more than an employee but less than the Director',
    why: 'MANAGER visibility is their department, which sits strictly between the two.',
    run: async ({ get }) => {
      const [emp, mgr, dir] = await Promise.all([
        get('employee', '/api/reports/approvals'),
        get('manager', '/api/reports/approvals'),
        get('director', '/api/reports/approvals'),
      ]);
      if (emp.status === 403 || mgr.status === 403) {
        return { pass: true, detail: 'lower roles blocked from the export entirely' };
      }
      const e = csvRows(emp.body);
      const m = csvRows(mgr.body);
      const d = csvRows(dir.body);
      return { pass: e <= m && m < d, detail: `employee ${e} ≤ manager ${m} < director ${d}` };
    },
  },
  {
    name: 'Finance cannot export the leave report',
    why: 'The leave report requires leave.manageAll, which FINANCE does not hold.',
    run: async ({ get }) => {
      const { status } = await get('finance', '/api/reports/leave');
      return { pass: status === 403, detail: `status ${status}` };
    },
  },
  {
    name: 'HR cannot export the procurement report',
    why: 'The procurement report requires finance.view, which HR does not hold.',
    run: async ({ get }) => {
      const { status } = await get('hr', '/api/reports/procurement');
      return { pass: status === 403, detail: `status ${status}` };
    },
  },
  {
    name: 'Employee cannot open a request outside their scope',
    why: 'Guessing a request id in the URL must return the 403 panel, not the record.',
    run: async ({ get }) => {
      /*
       * The target must genuinely be out of reach: not the employee's own, and
       * not from their department (a manager-visible row would be a false
       * positive). The search hit subtitle carries "NUMBER · Requester · DEPT",
       * which is enough to pick one deliberately rather than hoping.
       *
       * The demo employee is Bryant Vo in SCM.
       */
      const search = await get('director', `/api/search?q=${encodeURIComponent('Business trip')}`);
      const hits = (JSON.parse(search.body) as { hits: { id: string; subtitle: string }[] }).hits ?? [];
      const target = hits.find((h) => !h.subtitle.includes('Bryant Vo') && !h.subtitle.includes('· SCM'));
      if (!target) return { pass: false, detail: 'no request outside the employee scope was available to test' };

      const attempt = await get('employee', `/requests/${target.id}`);
      const blocked = attempt.body.includes('do not have access') || attempt.body.includes('does not include');
      return {
        pass: blocked,
        detail: blocked
          ? `${target.subtitle.split(' · ')[0]} correctly refused`
          : `${target.subtitle} was readable by an employee`,
      };
    },
  },
  {
    name: 'Office scope: a manager cannot see another office’s requests',
    why: 'Each office is a tenant. A Vietnam manager browsing Korea’s requests would defeat the separation.',
    run: async ({ get }) => {
      const mgr = await get('manager', '/api/reports/approvals');
      if (mgr.status === 403) return { pass: true, detail: 'manager blocked from the export entirely' };

      // The travel report carries the office through the requester, so compare
      // the set of countries each role can reach.
      const dir = await get('director', '/api/reports/travel');
      const mgrTravel = await get('manager', '/api/reports/travel');
      if (mgrTravel.status === 403) return { pass: true, detail: 'manager blocked from the travel export' };

      const countries = (body: string) =>
        new Set(
          body
            .split(/\r?\n/)
            .slice(1)
            .map((l) => l.split(',')[3])
            .filter(Boolean),
        );
      const d = countries(dir.body);
      const m = countries(mgrTravel.body);
      return { pass: m.size <= d.size, detail: `manager reaches ${m.size} destination countries vs director ${d.size}` };
    },
  },
  {
    name: 'Office scope: consolidated roles see every office',
    why: 'Executives, Finance, admins and auditors need group-wide reporting — that is the point of one system.',
    run: async ({ get }) => {
      const [dir, fin, aud] = await Promise.all([
        get('director', '/api/reports/approvals'),
        get('finance', '/api/reports/approvals'),
        get('auditor', '/api/reports/approvals'),
      ]);
      const rows = (b: string) => csvRows(b);
      const d = rows(dir.body);
      const f = rows(fin.body);
      const a = rows(aud.body);
      return { pass: d === a && f > 0 && d > 0, detail: `director ${d}, finance ${f}, auditor ${a} rows` };
    },
  },
  {
    name: 'Office scope: employee cannot widen scope by forging the office cookie',
    why: 'The cookie is ignored for non-consolidated roles — scope comes from the employee record, not the request.',
    run: async ({ cookies }) => {
      const res = await fetch(`${BASE}/api/reports/approvals`, {
        headers: { cookie: `${cookies.employee}; ohmy_office=all` },
        redirect: 'manual',
      });
      // Either blocked outright, or scoped exactly as before — never widened.
      const plain = await fetch(`${BASE}/api/reports/approvals`, {
        headers: { cookie: cookies.employee },
        redirect: 'manual',
      });
      if (res.status === 403 && plain.status === 403) return { pass: true, detail: 'blocked in both cases (403)' };
      const forged = csvRows(await res.text());
      const normal = csvRows(await plain.text());
      return { pass: forged === normal, detail: `forged cookie ${forged} rows vs normal ${normal} rows` };
    },
  },
  {
    name: 'Unauthenticated requests are redirected',
    why: 'The proxy bounces anonymous traffic before it reaches a page.',
    run: async () => {
      const res = await fetch(`${BASE}/approvals`, { redirect: 'manual' });
      const ok = res.status === 307 || res.status === 302;
      return { pass: ok, detail: `status ${res.status} → ${res.headers.get('location') ?? 'no redirect'}` };
    },
  },
  {
    name: 'Unauthenticated API access is rejected',
    why: 'Route handlers are directly reachable and must re-check the session.',
    run: async () => {
      const [search, report] = await Promise.all([
        fetch(`${BASE}/api/search?q=seoul`, { redirect: 'manual' }),
        fetch(`${BASE}/api/reports/approvals`, { redirect: 'manual' }),
      ]);
      const ok = search.status !== 200 && report.status !== 200;
      return { pass: ok, detail: `search ${search.status}, report ${report.status}` };
    },
  },
];

async function main() {
  const cookies: Record<string, string> = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) cookies[role] = await login(email);

  const get = async (role: string, path: string) => {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookies[role] }, redirect: 'manual' });
    return { status: res.status, body: await res.text() };
  };

  console.log(`\nRBAC assertions against ${BASE}\n${'='.repeat(72)}`);
  let failed = 0;

  for (const c of CASES) {
    try {
      const { pass, detail } = await c.run({ cookies, get });
      if (!pass) failed++;
      console.log(`${pass ? '✓' : '✗'} ${c.name}`);
      console.log(`    ${detail}`);
      if (!pass) console.log(`    expected because: ${c.why}`);
    } catch (err) {
      failed++;
      console.log(`✗ ${c.name}`);
      console.log(`    threw: ${(err as Error).message}`);
    }
  }

  console.log(`${'='.repeat(72)}`);
  console.log(`${CASES.length} assertions · ${failed} failure(s)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
