import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq, sql } from 'drizzle-orm';
import { Building2 } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { costCenters, departments, employees, offices, teams } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { Avatar, Badge, Card, CardHeader } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Organization' };

export default async function OrganizationPage() {
  const session = await requireSession();
  if (!can(session, 'admin.organization')) return <ForbiddenPage what="organization settings" />;

  const db = await ready();
  const [officeRows, deptRows, teamRows, ccRows] = await Promise.all([
    db
      .select({
        id: offices.id,
        code: offices.code,
        name: offices.name,
        country: offices.country,
        city: offices.city,
        timezone: offices.timezone,
        baseCurrency: offices.baseCurrency,
        headcount: sql<number>`(select count(*)::int from employees e where e.office_id = ${offices.id} and e.status='ACTIVE')`,
      })
      .from(offices)
      .orderBy(asc(offices.code)),
    db
      .select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        officeCode: offices.code,
        headName: employees.name,
        headId: employees.id,
        headcount: sql<number>`(select count(*)::int from employees e where e.department_id = ${departments.id} and e.status='ACTIVE')`,
      })
      .from(departments)
      .leftJoin(offices, eq(offices.id, departments.officeId))
      .leftJoin(employees, eq(employees.id, departments.headEmployeeId))
      .orderBy(asc(departments.code)),
    db
      .select({ id: teams.id, code: teams.code, name: teams.name, departmentCode: departments.code })
      .from(teams)
      .leftJoin(departments, eq(departments.id, teams.departmentId))
      .orderBy(asc(teams.code)),
    db
      .select({ id: costCenters.id, code: costCenters.code, name: costCenters.name, departmentCode: departments.code, active: costCenters.active })
      .from(costCenters)
      .leftJoin(departments, eq(departments.id, costCenters.departmentId))
      .orderBy(asc(costCenters.code)),
  ]);

  return (
    <>
      <PageHeader
        title="Organization"
        description="Offices, departments, teams and cost centres. Department heads drive approval routing."
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title={`Offices (${officeRows.length})`} icon={<Building2 className="size-4" />} />
          <TableWrap>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Location</TH>
                <TH>Timezone</TH>
                <TH>Base currency</TH>
                <TH align="right">Headcount</TH>
              </TR>
            </THead>
            <TBody>
              {officeRows.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Badge tone="slate">{o.code}</Badge>
                  </TD>
                  <TD className="font-medium">{o.name}</TD>
                  <TD className="text-text-muted">
                    {o.city}, {o.country}
                  </TD>
                  <TD className="text-text-muted">{o.timezone}</TD>
                  <TD className="text-text-muted">{o.baseCurrency}</TD>
                  <TD numeric>{o.headcount}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader
            title={`Departments (${deptRows.length})`}
            description="The department head resolves the DEPT_HEAD approval step; HR, FIN and CEO heads resolve the HR, Finance and Director steps."
          />
          <TableWrap>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Office</TH>
                <TH>Head</TH>
                <TH align="right">Headcount</TH>
              </TR>
            </THead>
            <TBody>
              {deptRows.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <Badge tone="slate">{d.code}</Badge>
                  </TD>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="text-text-muted">{d.officeCode ?? '—'}</TD>
                  <TD>
                    {d.headName && d.headId ? (
                      <Link href={`/people/${d.headId}`} className="flex items-center gap-1.5 hover:underline">
                        <Avatar name={d.headName} size="xs" />
                        {d.headName}
                      </Link>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400">Not set — routing will skip this step</span>
                    )}
                  </TD>
                  <TD numeric>{d.headcount}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={`Teams (${teamRows.length})`} />
            <TableWrap>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Department</TH>
                </TR>
              </THead>
              <TBody>
                {teamRows.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-mono text-xs">{t.code}</TD>
                    <TD className="font-medium">{t.name}</TD>
                    <TD className="text-text-muted">{t.departmentCode ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </Card>

          <Card>
            <CardHeader title={`Cost centres (${ccRows.length})`} description="Charge target on every request" />
            <TableWrap>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Department</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {ccRows.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-xs">{c.code}</TD>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-text-muted">{c.departmentCode ?? '—'}</TD>
                    <TD>
                      <Badge tone={c.active ? 'emerald' : 'slate'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </Card>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-text-subtle">
        The organization structure is read-only in this prototype — it is seeded and edited directly in the database.
        Everything downstream reads from it live, so changing a department head immediately changes who new requests
        route to. Employee records themselves are managed under{' '}
        <Link href="/people" className="text-accent hover:underline">
          Employees
        </Link>
        .
      </p>
    </>
  );
}
