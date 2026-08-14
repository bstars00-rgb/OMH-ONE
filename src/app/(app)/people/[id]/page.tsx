import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, eq, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { canViewEmployee, hasRole } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { departments, employees, leaveBalances, offices, requests, teams } from '@/lib/db/schema';
import { listRequests } from '@/server/queries/requests';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { Avatar, Card, CardHeader, CardBody, DetailRow, Progress } from '@/components/ui/primitives';
import { RequestTable } from '@/components/requests/request-table';
import { StatTile } from '@/components/stat-tile';
import { formatDate } from '@/lib/dates';
import { formatCompact, num } from '@/lib/money';
import { humanize } from '@/lib/utils';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const db = await ready();
  const [e] = await db.select({ name: employees.name }).from(employees).where(eq(employees.id, id)).limit(1);
  return { title: e?.name ?? 'Employee' };
}

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const db = await ready();

  const [person] = await db
    .select({
      id: employees.id,
      code: employees.employeeCode,
      name: employees.name,
      englishName: employees.englishName,
      email: employees.email,
      position: employees.position,
      employmentType: employees.employmentType,
      joinDate: employees.joinDate,
      status: employees.status,
      phone: employees.phone,
      departmentId: employees.departmentId,
      departmentName: departments.name,
      departmentCode: departments.code,
      teamName: teams.name,
      officeName: offices.name,
      officeCountry: offices.country,
      managerName: sql<string | null>`(select m.name from employees m where m.id = ${employees.managerId})`,
      managerId: employees.managerId,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(teams, eq(teams.id, employees.teamId))
    .leftJoin(offices, eq(offices.id, employees.officeId))
    .where(eq(employees.id, id))
    .limit(1);

  if (!person) notFound();
  if (!canViewEmployee(session, person)) return <ForbiddenPage what="this employee profile" />;

  const isSelf = person.id === session.employeeId;
  const year = new Date().getUTCFullYear();

  const [balances, totals, list] = await Promise.all([
    db
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, id), eq(leaveBalances.year, year))),
    db
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where status='APPROVED')::int`,
        open: sql<number>`count(*) filter (where status in ('SUBMITTED','IN_REVIEW'))::int`,
        spend: sql<string>`coalesce(sum(amount_base) filter (where status='APPROVED'), 0)`,
      })
      .from(requests)
      .where(eq(requests.requesterId, id))
      .then((r) => r[0]),
    // Reuses the same visibility-scoped list query as everywhere else, so a
    // manager viewing a profile still cannot see requests outside their scope.
    listRequests(session, { mode: 'all', requesterId: id, sort: 'newest', pageSize: 15 }),
  ]);

  const annual = balances.find((b) => b.leaveType === 'ANNUAL');
  const allowance = annual ? num(annual.allowance) + num(annual.carriedOver) : 0;
  const used = annual ? num(annual.used) : 0;
  const pending = annual ? num(annual.pending) : 0;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Employees', href: '/people' }, { label: person.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={person.name} size="lg" />
            {person.name}
          </span>
        }
        description={`${person.position ?? 'Employee'}${person.departmentName ? ` · ${person.departmentName}` : ''}`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Requests submitted" value={Number(totals?.total ?? 0)} sublabel="All time" icon="FileText" />
        <StatTile label="Approved" value={Number(totals?.approved ?? 0)} sublabel="All time" icon="CheckCircle2" />
        <StatTile
          label="In flight"
          value={Number(totals?.open ?? 0)}
          sublabel="Awaiting a decision"
          icon="Clock"
          tone={Number(totals?.open ?? 0) > 0 ? 'warning' : 'default'}
        />
        <StatTile label="Approved value" value={formatCompact(num(totals?.spend))} sublabel="All time" icon="Wallet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="divide-y divide-border-subtle">
                <DetailRow label="Employee code">{person.code}</DetailRow>
                <DetailRow label="Email">{person.email}</DetailRow>
                <DetailRow label="Department">{person.departmentName ?? '—'}</DetailRow>
                <DetailRow label="Team">{person.teamName ?? '—'}</DetailRow>
                <DetailRow label="Office">
                  {person.officeName ? `${person.officeName}, ${person.officeCountry}` : '—'}
                </DetailRow>
                <DetailRow label="Reports to">
                  {person.managerName && person.managerId ? (
                    <Link href={`/people/${person.managerId}`} className="text-accent hover:underline">
                      {person.managerName}
                    </Link>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow label="Employment">{humanize(person.employmentType)}</DetailRow>
                <DetailRow label="Joined">{formatDate(String(person.joinDate))}</DetailRow>
                <DetailRow label="Status">{humanize(person.status)}</DetailRow>
              </dl>
            </CardBody>
          </Card>

          {/* Leave detail is HR data — visible to the person themselves, HR and directors. */}
          {(isSelf || hasRole(session, 'HR', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN', 'AUDITOR')) && (
            <Card>
              <CardHeader title={`Leave balance ${year}`} />
              <CardBody className="space-y-3">
                {balances.length === 0 ? (
                  <p className="text-xs text-text-muted">No balance configured for this year.</p>
                ) : (
                  balances.map((b) => {
                    const total = num(b.allowance) + num(b.carriedOver);
                    const consumed = num(b.used) + num(b.pending);
                    return (
                      <div key={b.id}>
                        <div className="mb-1 flex items-baseline justify-between text-xs">
                          <span className="font-medium text-text">{humanize(b.leaveType)}</span>
                          <span className="text-text-muted tabular">
                            {total - consumed} of {total} left
                          </span>
                        </div>
                        <Progress value={consumed} max={total} label={`${b.leaveType} utilisation`} />
                        <p className="mt-1 text-[10px] text-text-subtle tabular">
                          {num(b.used)} used · {num(b.pending)} pending
                        </p>
                      </div>
                    );
                  })
                )}
                {annual && (
                  <p className="border-t border-border-subtle pt-2 text-[11px] text-text-subtle">
                    Annual utilisation {allowance > 0 ? Math.round(((used + pending) / allowance) * 100) : 0}%.
                  </p>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="overflow-hidden">
          <CardHeader
            title="Request history"
            description="Limited to requests you are permitted to see."
          />
          <RequestTable
            rows={list.rows}
            total={list.total}
            page={list.page}
            pageSize={list.pageSize}
            baseParams={new URLSearchParams()}
            columns={['type', 'number', 'title', 'amount', 'status', 'submitted']}
            emptyTitle="No requests visible"
            emptyDescription="Either this person has not submitted anything, or their requests are outside your scope."
          />
        </Card>
      </div>
    </>
  );
}
