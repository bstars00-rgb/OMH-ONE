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
        title={t('org.title')}
        description={t('org.subtitle')}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title={t('org.offices', { count: officeRows.length })} icon={<Building2 className="size-4" />} />
          <TableWrap>
            <THead>
              <TR>
                <TH>{t('org.code')}</TH>
                <TH>{t('label.name')}</TH>
                <TH>{t('org.location')}</TH>
                <TH>{t('org.timezone')}</TH>
                <TH>{t('org.baseCurrency')}</TH>
                <TH align="right">{t('org.headcount')}</TH>
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
            title={t('org.departments', { count: deptRows.length })}
            description={t('org.departmentsSub')}
          />
          <TableWrap>
            <THead>
              <TR>
                <TH>{t('org.code')}</TH>
                <TH>{t('label.name')}</TH>
                <TH>{t('label.office')}</TH>
                <TH>{t('org.head')}</TH>
                <TH align="right">{t('org.headcount')}</TH>
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
                      <span className="text-rose-600 dark:text-rose-400">{t('org.headNotSet')}</span>
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
            <CardHeader title={t('org.teams', { count: teamRows.length })} />
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('org.code')}</TH>
                  <TH>{t('label.name')}</TH>
                  <TH>{t('label.department')}</TH>
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
            <CardHeader title={t('org.costCenters', { count: ccRows.length })} description={t('org.costCentersSub')} />
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('org.code')}</TH>
                  <TH>{t('label.name')}</TH>
                  <TH>{t('label.department')}</TH>
                  <TH>{t('label.status')}</TH>
                </TR>
              </THead>
              <TBody>
                {ccRows.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-xs">{c.code}</TD>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-text-muted">{c.departmentCode ?? '—'}</TD>
                    <TD>
                      <Badge tone={c.active ? 'emerald' : 'slate'}>
                        {t(c.active ? 'state.active' : 'state.inactive')}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </Card>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-text-subtle">
        {t('org.readOnlyNote')}{' '}
        <Link href="/people" className="text-accent hover:underline">
          {t('people.title')} →
        </Link>
      </p>
    </>
  );
}
