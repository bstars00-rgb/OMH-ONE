import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can, canViewEmployee, scopeLabel } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { departments, employees, offices } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage, NoResults } from '@/components/ui/states';
import { Avatar, Badge, Card } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { formatDate } from '@/lib/dates';

export const metadata: Metadata = { title: 'Employees' };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!can(session, 'employee.viewAll')) return <ForbiddenPage what="the employee directory" />;

  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().toLowerCase() ?? '';
  const deptFilter = Array.isArray(sp.dept) ? sp.dept[0] : sp.dept;

  const db = await ready();
  const rows = await db
    .select({
      id: employees.id,
      code: employees.employeeCode,
      name: employees.name,
      email: employees.email,
      position: employees.position,
      joinDate: employees.joinDate,
      status: employees.status,
      departmentId: employees.departmentId,
      departmentCode: departments.code,
      officeCode: offices.code,
      officeName: offices.name,
      managerName: sql<string | null>`(select m.name from employees m where m.id = ${employees.managerId})`,
      openRequests: sql<number>`(select count(*)::int from requests r where r.requester_id = ${employees.id} and r.status in ('SUBMITTED','IN_REVIEW'))`,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(offices, eq(offices.id, employees.officeId))
    .orderBy(asc(employees.name));

  // Row-level filter applied after the fetch, so a manager sees their department
  // only — the same rule the profile page enforces.
  const visible = rows
    .filter((r) => canViewEmployee(session, r))
    .filter((r) => (deptFilter ? r.departmentCode === deptFilter : true))
    .filter((r) => (q ? `${r.name} ${r.email} ${r.position ?? ''}`.toLowerCase().includes(q) : true));

  const deptCodes = [...new Set(rows.filter((r) => canViewEmployee(session, r)).map((r) => r.departmentCode).filter(Boolean))] as string[];

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${visible.length} people · ${scopeLabel(session).toLowerCase()}.`}
      />

      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="q">
          Search employees
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by name, email or position…"
          className="h-8 max-w-xs flex-1 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle"
        />
        <label className="sr-only" htmlFor="dept">
          Filter by department
        </label>
        <select
          id="dept"
          name="dept"
          defaultValue={deptFilter ?? ''}
          className="h-8 rounded-[var(--radius-control)] border border-border-strong bg-surface px-2 text-sm text-text"
        >
          <option value="">All departments</option>
          {deptCodes.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-8 rounded-[var(--radius-control)] bg-accent px-3 text-xs font-medium text-accent-fg"
        >
          Search
        </button>
        {(q || deptFilter) && (
          <Link href="/people" className="text-xs text-text-muted hover:text-text hover:underline">
            Clear
          </Link>
        )}
      </form>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <NoResults onReset={<Link href="/people" className="text-xs text-accent hover:underline">Clear filters</Link>} />
        ) : (
          <TableWrap>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Position</TH>
                <TH>Dept</TH>
                <TH>Office</TH>
                <TH>Manager</TH>
                <TH>Joined</TH>
                <TH align="right">Open requests</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((e) => (
                <TR key={e.id} interactive>
                  <TD>
                    <Link href={`/people/${e.id}`} className="flex items-center gap-2">
                      <Avatar name={e.name} size="xs" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium hover:underline">{e.name}</span>
                        <span className="block truncate text-[11px] text-text-subtle">{e.email}</span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="text-text-muted">{e.position ?? '—'}</TD>
                  <TD>{e.departmentCode ? <Badge tone="slate">{e.departmentCode}</Badge> : '—'}</TD>
                  <TD className="text-text-muted">{e.officeCode ?? '—'}</TD>
                  <TD className="text-text-muted">{e.managerName ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-text-muted tabular">{formatDate(String(e.joinDate))}</TD>
                  <TD numeric>{Number(e.openRequests) > 0 ? e.openRequests : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
