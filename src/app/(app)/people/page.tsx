import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can, canViewEmployee, scopeLabelKey } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { departments, employees, offices } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage, NoResults } from '@/components/ui/states';
import { Avatar, Badge, Card } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { getI18n, getT } from '@/lib/i18n/server';
import { formatDateL } from '@/lib/i18n/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('people.title') };
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { t, locale } = await getI18n();
  if (!can(session, 'employee.viewAll')) return <ForbiddenPage what={t('people.directory')} />;

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
  const scope = scopeLabelKey(session);

  return (
    <>
      <PageHeader
        title={t('people.title')}
        description={t('people.subtitle', { count: visible.length, scope: t(scope.key, scope.vars) })}
      />

      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="q">
          {t('people.searchAria')}
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder={t('people.searchPlaceholder')}
          className="h-8 max-w-xs flex-1 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle"
        />
        <label className="sr-only" htmlFor="dept">
          {t('people.filterDept')}
        </label>
        <select
          id="dept"
          name="dept"
          defaultValue={deptFilter ?? ''}
          className="h-8 rounded-[var(--radius-control)] border border-border-strong bg-surface px-2 text-sm text-text"
        >
          <option value="">{t('people.allDepartments')}</option>
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
          {t('action.search')}
        </button>
        {(q || deptFilter) && (
          <Link href="/people" className="text-xs text-text-muted hover:text-text hover:underline">
            {t('action.clear')}
          </Link>
        )}
      </form>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <NoResults
            onReset={
              <Link href="/people" className="text-xs text-accent hover:underline">
                {t('action.clearFilters')}
              </Link>
            }
          />
        ) : (
          <TableWrap>
            <THead>
              <TR>
                <TH>{t('label.employee')}</TH>
                <TH>{t('label.position')}</TH>
                <TH>{t('label.departmentShort')}</TH>
                <TH>{t('label.office')}</TH>
                <TH>{t('label.manager')}</TH>
                <TH>{t('people.joined')}</TH>
                <TH align="right">{t('people.openRequests')}</TH>
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
                  <TD className="whitespace-nowrap text-text-muted tabular">{formatDateL(locale, String(e.joinDate))}</TD>
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
