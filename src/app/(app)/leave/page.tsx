import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { can, scopeLabelKey } from '@/lib/rbac';
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
import { getI18n, getT } from '@/lib/i18n/server';
import { formatDateL, formatRangeL } from '@/lib/i18n/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('leave.title') };
}

export default async function LeavePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const { t, locale } = await getI18n();
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
  const scope = scopeLabelKey(session);

  return (
    <>
      <PageHeader
        title={t('leave.title')}
        description={t('leave.subtitle', { scope: t(scope.key, scope.vars) })}
        actions={
          <Link href="/requests/new/LEAVE" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> {t('leave.request')}
          </Link>
        }
      />

      {/* Your own position first — this is what most people came for */}
      <Card className="mb-5">
        <CardHeader
          title={t('leave.yourBalance')}
          description={t('leave.entitlementFor', { year: new Date().getUTCFullYear() })}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {mine.balances.length === 0 ? (
            <p className="text-xs text-text-muted">{t('leave.noBalance')}</p>
          ) : (
            mine.balances.map((b) => (
              <div key={b.leaveType}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-text">{t(`leaveType.${b.leaveType}`)}</span>
                  <span className="text-sm font-semibold text-text tabular">{b.remaining}</span>
                </div>
                <Progress
                  value={b.used + b.pending}
                  max={b.allowance}
                  label={t('leaveForm.usedAria', { type: t(`leaveType.${b.leaveType}`) })}
                />
                <p className="mt-1 text-[10px] text-text-subtle tabular">
                  {t('leave.usedPendingTotal', { used: b.used, pending: b.pending, total: b.allowance })}
                </p>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      {seesEveryone && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={t('leave.daysTaken')}
              value={totalTaken}
              sublabel={t('leave.daysTakenSub')}
              icon="CalendarCheck"
            />
            <StatTile label={t('leave.avgUtil')} value={`${avgUtil}%`} sublabel={t('leave.avgUtilSub')} icon="Gauge" />
            <StatTile
              label={t('leave.awayNext30')}
              value={new Set(upcoming.map((u) => u.employeeName)).size}
              sublabel={t('label.people')}
              icon="Users"
              href="/calendar"
            />
            <StatTile
              label={t('leave.yourRemaining')}
              value={annual ? annual.remaining : '—'}
              sublabel={t('leave.yourRemainingSub')}
              icon="CalendarDays"
            />
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <BreakdownChart
              title={t('leave.byDept')}
              subtitle={t('leave.byDeptSub')}
              data={stats.byDepartment}
              money={false}
            />

            <Card>
              <CardHeader
                title={t('leave.topUtil')}
                description={t('leave.topUtilSub')}
              />
              <TableWrap>
                <THead>
                  <TR>
                    <TH>{t('label.employee')}</TH>
                    <TH>{t('label.departmentShort')}</TH>
                    <TH align="right">{t('leave.used')}</TH>
                    <TH align="right">{t('leave.pending')}</TH>
                    <TH align="right">{t('leave.left')}</TH>
                    <TH align="right">{t('leave.usedPct')}</TH>
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
        <CardHeader title={t('leave.away30')} description={t('leave.away30Sub')} />
        {upcoming.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-text-subtle">{t('leave.nobodyAway')}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {upcoming.map((l, i) => (
              <li key={`${l.employeeName}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text">{l.employeeName}</span>
                  <span className="block truncate text-[11px] text-text-muted">
                    {l.departmentCode ?? '—'} · {t(`leaveType.${l.leaveType}`)}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-text-muted tabular">
                  {formatRangeL(locale, l.startDate, l.endDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-text">
        {t(seesEveryone ? 'leave.allRequests' : 'leave.yourRequests')}
      </h2>
      <FilterBar showType={false} showRisk={false} />
      <Card className="overflow-hidden">
        <RequestTable
          rows={list.rows}
          total={list.total}
          page={list.page}
          pageSize={list.pageSize}
          baseParams={params.toString()}
          currentSort={filters.sort}
          columns={['number', 'title', 'requester', 'department', 'status', 'submitted', 'approver', 'sla']}
          emptyTitle={t('leave.emptyFiltered')}
          emptyDescription={t('leave.emptyFilteredHint')}
          emptyAction={
            <Link href="/requests/new/LEAVE" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <CalendarDays /> {t('leave.request')}
            </Link>
          }
        />
      </Card>

      <p className="mt-3 text-[11px] text-text-subtle">
        {t('leave.calcNote', { date: formatDateL(locale, new Date()) })}
      </p>
    </>
  );
}
