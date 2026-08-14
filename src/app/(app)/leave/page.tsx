import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { can, scopeLabel } from '@/lib/rbac';
import { getLeaveStats } from '@/server/queries/modules';
import { getLeaveFormData } from '@/server/queries/form-context';
import { listRequests } from '@/server/queries/requests';
import { getTeamLeave } from '@/server/queries/dashboard';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { StatTile } from '@/components/stat-tile';
import { BreakdownChart } from '@/components/module-page';
import { Card, CardHeader, CardBody, Progress, buttonVariants } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { formatDate, formatRange } from '@/lib/dates';
import { humanize } from '@/lib/utils';

export const metadata: Metadata = { title: 'Leave' };

export default async function LeavePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const seesEveryone = can(session, 'leave.manageAll');

  const filters = parseRequestFilters(sp, {
    mode: seesEveryone ? 'all' : 'mine',
    type: ['LEAVE'],
    sort: 'newest',
    pageSize: 20,
  });

  const [stats, mine, list, upcoming] = await Promise.all([
    getLeaveStats(session),
    getLeaveFormData(session),
    listRequests(session, { ...filters, type: ['LEAVE'] }),
    getTeamLeave(session, 30),
  ]);

  const params = toURLSearchParams(sp);
  const annual = mine.balances.find((b) => b.leaveType === 'ANNUAL');
  const totalTaken = stats.balances.reduce((s, b) => s + b.used, 0);
  const avgUtil = stats.balances.length
    ? Math.round((stats.balances.reduce((s, b) => s + b.utilization, 0) / stats.balances.length) * 100)
    : 0;

  return (
    <>
      <PageHeader
        title="Leave"
        description={`Your balance, and leave activity across ${scopeLabel(session).toLowerCase()}.`}
        actions={
          <Link href="/requests/new/LEAVE" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> Request leave
          </Link>
        }
      />

      {/* Your own position first — this is what most people came for */}
      <Card className="mb-5">
        <CardHeader title="Your leave balance" description={`Entitlement for ${new Date().getUTCFullYear()}`} />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {mine.balances.length === 0 ? (
            <p className="text-xs text-text-muted">No balance is configured for you this year.</p>
          ) : (
            mine.balances.map((b) => (
              <div key={b.leaveType}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-text">{humanize(b.leaveType)}</span>
                  <span className="text-sm font-semibold text-text tabular">{b.remaining}</span>
                </div>
                <Progress value={b.used + b.pending} max={b.allowance} label={`${b.leaveType} utilisation`} />
                <p className="mt-1 text-[10px] text-text-subtle tabular">
                  {b.used} used · {b.pending} pending · {b.allowance} total
                </p>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      {seesEveryone && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Days taken this year" value={totalTaken} sublabel="Approved, all employees" icon="CalendarCheck" />
            <StatTile label="Average utilisation" value={`${avgUtil}%`} sublabel="Of annual entitlement" icon="Gauge" />
            <StatTile
              label="Away in next 30 days"
              value={new Set(upcoming.map((u) => u.employeeName)).size}
              sublabel="People"
              icon="Users"
              href="/calendar"
            />
            <StatTile
              label="Your remaining"
              value={annual ? annual.remaining : '—'}
              sublabel="Annual leave days"
              icon="CalendarDays"
            />
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <BreakdownChart
              title="Leave days by department"
              subtitle="Approved working days this year"
              data={stats.byDepartment}
              money={false}
              humanizeNames={false}
            />

            <Card>
              <CardHeader
                title="Highest utilisation"
                description="Employees closest to using their full entitlement"
              />
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH>Dept</TH>
                    <TH align="right">Used</TH>
                    <TH align="right">Pending</TH>
                    <TH align="right">Left</TH>
                    <TH align="right">Used %</TH>
                  </TR>
                </THead>
                <TBody>
                  {stats.balances.slice(0, 10).map((b) => (
                    <TR key={b.id} interactive>
                      <TD>
                        <Link href={`/people/${b.id}`} className="font-medium hover:underline">
                          {b.name}
                        </Link>
                      </TD>
                      <TD className="text-text-muted">{b.department ?? '—'}</TD>
                      <TD numeric>{b.used}</TD>
                      <TD numeric className="text-text-muted">
                        {b.pending}
                      </TD>
                      <TD numeric className={b.remaining <= 2 ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>
                        {b.remaining}
                      </TD>
                      <TD numeric>{Math.round(b.utilization * 100)}%</TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </Card>
          </div>
        </>
      )}

      <Card className="mb-5">
        <CardHeader title="Away in the next 30 days" description="Approved and pending leave in your scope" />
        {upcoming.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-text-subtle">Nobody is scheduled to be away.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {upcoming.map((l, i) => (
              <li key={`${l.employeeName}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text">{l.employeeName}</span>
                  <span className="block truncate text-[11px] text-text-muted">
                    {l.departmentCode ?? '—'} · {humanize(l.leaveType)}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-text-muted tabular">
                  {formatRange(l.startDate, l.endDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-text">{seesEveryone ? 'All leave requests' : 'Your leave requests'}</h2>
      <FilterBar showType={false} showRisk={false} />
      <Card className="overflow-hidden">
        <RequestTable
          rows={list.rows}
          total={list.total}
          page={list.page}
          pageSize={list.pageSize}
          baseParams={params}
          currentSort={filters.sort}
          columns={['number', 'title', 'requester', 'department', 'status', 'submitted', 'approver', 'sla']}
          emptyTitle="No leave requests match these filters"
          emptyDescription="Try clearing a filter, or request leave."
          emptyAction={
            <Link href="/requests/new/LEAVE" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <CalendarDays /> Request leave
            </Link>
          }
        />
      </Card>

      <p className="mt-3 text-[11px] text-text-subtle">
        Working days exclude weekends and the public holidays configured for your office. Last calculated{' '}
        {formatDate(new Date())}.
      </p>
    </>
  );
}
