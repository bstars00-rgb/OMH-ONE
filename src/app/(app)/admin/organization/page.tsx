import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, count, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { costCenters, departments, employees, offices, teams } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { OrgManager } from '@/components/admin/org-manager';
import { ROUTING_DEPT_CODES } from '@/lib/validation/organization';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('org.title') };
}

export default async function OrganizationPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!can(session, 'admin.organization')) return <ForbiddenPage what={t('org.title')} />;

  const db = await ready();
  const [officeRows, deptRows, teamRows, ccRows, headcounts] = await Promise.all([
    db
      .select({
        id: offices.id,
        code: offices.code,
        name: offices.name,
        country: offices.country,
        city: offices.city,
        timezone: offices.timezone,
        baseCurrency: offices.baseCurrency,
      })
      .from(offices)
      .orderBy(asc(offices.code)),
    db
      .select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        officeId: departments.officeId,
        officeCode: offices.code,
        headName: employees.name,
        headId: employees.id,
        headPosition: employees.position,
      })
      .from(departments)
      .leftJoin(offices, eq(offices.id, departments.officeId))
      .leftJoin(employees, eq(employees.id, departments.headEmployeeId))
      .orderBy(asc(departments.code)),
    db
      .select({
        id: teams.id,
        code: teams.code,
        name: teams.name,
        departmentId: teams.departmentId,
        departmentCode: departments.code,
      })
      .from(teams)
      .leftJoin(departments, eq(departments.id, teams.departmentId))
      .orderBy(asc(teams.code)),
    db
      .select({
        id: costCenters.id,
        code: costCenters.code,
        name: costCenters.name,
        departmentId: costCenters.departmentId,
        departmentCode: departments.code,
        active: costCenters.active,
      })
      .from(costCenters)
      .leftJoin(departments, eq(departments.id, costCenters.departmentId))
      .orderBy(asc(costCenters.code)),
    // One grouped pass instead of a correlated subquery per row. The subquery
    // form silently returned zero here — every office read "0 headcount" while
    // the departments underneath them clearly had people — so headcounts are
    // counted once and matched up below.
    db
      .select({ officeId: employees.officeId, departmentId: employees.departmentId, n: count() })
      .from(employees)
      .where(eq(employees.status, 'ACTIVE'))
      .groupBy(employees.officeId, employees.departmentId),
  ]);

  const byOffice = new Map<string, number>();
  const byDept = new Map<string, number>();
  for (const row of headcounts) {
    if (row.officeId) byOffice.set(row.officeId, (byOffice.get(row.officeId) ?? 0) + row.n);
    if (row.departmentId) byDept.set(row.departmentId, (byDept.get(row.departmentId) ?? 0) + row.n);
  }

  return (
    <>
      <PageHeader title={t('org.title')} description={t('org.subtitle')} />

      <OrgManager
        offices={officeRows.map((o) => ({ ...o, headcount: byOffice.get(o.id) ?? 0 }))}
        departments={deptRows.map((d) => ({
          ...d,
          headcount: byDept.get(d.id) ?? 0,
          // Marks the three codes the approval engine resolves approvers from,
          // so the row shows why it cannot be deleted before anyone tries.
          routing: (ROUTING_DEPT_CODES as readonly string[]).includes(d.code),
        }))}
        teams={teamRows}
        costCenters={ccRows}
      />

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-text-subtle">
        {t('org.readOnlyNote')}{' '}
        <Link href="/people" className="text-accent hover:underline">
          {t('people.title')} →
        </Link>
      </p>
    </>
  );
}
