import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { can, scopeLabel } from '@/lib/rbac';
import {
  getApprovalTrend,
  getBottlenecks,
  getBudgetPositions,
  getDashboardStats,
  getLeaveMix,
  getSpendByCategory,
  getSpendByDepartment,
  getStatusMix,
} from '@/server/queries/dashboard';
import { getExpenseStats, getProcurementStats, getTravelStats } from '@/server/queries/modules';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { StatTile } from '@/components/stat-tile';
import { BottleneckBars, CategoryBars, ChartCard, SpendLine, StatusDonut, TrendArea } from '@/components/charts';
import { Card, CardHeader, buttonVariants } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { formatCompact, formatMoney } from '@/lib/money';
import { formatDuration, monthLabel } from '@/lib/dates';
import { humanize } from '@/lib/utils';
import { STATUS_META, type RequestStatus } from '@/types/domain';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  const session = await requireSession();
  if (!can(session, 'analytics.view')) return <ForbiddenPage what="analytics" />;

  const [stats, trend, statusMix, deptSpend, catSpend, leaveMix, bottlenecks, budgets, travel, procurement, expense] =
    await Promise.all([
      getDashboardStats(session),
      getApprovalTrend(session, 12),
      getStatusMix(session),
      getSpendByDepartment(session, 12),
      getSpendByCategory(session, 12),
      getLeaveMix(session),
      getBottlenecks(session),
      getBudgetPositions(session),
      getTravelStats(session),
      getProcurementStats(session),
      getExpenseStats(session),
    ]);

  const yearSpend = trend.reduce((s, t) => s + t.spend, 0);
  const yearRequests = trend.reduce((s, t) => s + t.submitted, 0);
  const approvalRate =
    yearRequests > 0 ? Math.round((trend.reduce((s, t) => s + t.approved, 0) / yearRequests) * 100) : 0;
  const totalAllocated = budgets.reduce((s, b) => s + b.allocated, 0);
  const totalUsed = budgets.reduce((s, b) => s + b.spent + b.committed, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Twelve months of approval and spend activity across ${scopeLabel(session).toLowerCase()}.`}
        actions={
          can(session, 'reports.export') ? (
            <Link href="/reports" className={buttonVariants({ variant: 'secondary', size: 'md' })}>
              Export reports
            </Link>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Approved spend" value={formatCompact(yearSpend)} sublabel="Last 12 months" icon="Wallet" />
        <StatTile label="Requests" value={yearRequests} sublabel="Last 12 months" icon="FileText" />
        <StatTile label="Approval rate" value={`${approvalRate}%`} sublabel="Of submitted requests" icon="CheckCircle2" />
        <StatTile
          label="Average decision"
          value={stats.avgApprovalHours === null ? '—' : formatDuration(stats.avgApprovalHours)}
          sublabel="Per approval step"
          icon="Timer"
        />
        <StatTile
          label="Past SLA now"
          value={stats.slaOverdue}
          sublabel="Open steps"
          icon="AlarmClockOff"
          tone={stats.slaOverdue > 0 ? 'warning' : 'positive'}
        />
        <StatTile
          label="Budget used"
          value={totalAllocated > 0 ? `${Math.round((totalUsed / totalAllocated) * 100)}%` : '—'}
          sublabel="This quarter"
          icon="PiggyBank"
          tone={totalUsed > totalAllocated ? 'critical' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Approved spend by month"
          subtitle="Twelve-month view, base currency USD"
          metric={formatMoney(yearSpend)}
          isEmpty={trend.every((t) => t.spend === 0)}
          height={240}
        >
          <SpendLine data={trend} />
        </ChartCard>

        <ChartCard
          title="Request volume"
          subtitle="Submitted, approved and rejected"
          metric={String(yearRequests)}
          isEmpty={trend.every((t) => t.submitted === 0)}
          height={240}
        >
          <TrendArea data={trend} />
        </ChartCard>

        <ChartCard title="Status mix" subtitle="Last 6 months" metric={String(statusMix.reduce((s, x) => s + x.count, 0))} isEmpty={statusMix.length === 0}>
          <StatusDonut data={statusMix.map((s) => ({ ...s, label: STATUS_META[s.status as RequestStatus]?.label ?? s.status }))} />
        </ChartCard>

        <ChartCard
          title="Approval bottleneck"
          subtitle="Average hours per decision by role"
          metric={bottlenecks[0] ? `${bottlenecks[0].avgHours}h` : '—'}
          isEmpty={bottlenecks.length === 0}
        >
          <BottleneckBars data={bottlenecks.map((b) => ({ role: humanize(b.role), avgHours: b.avgHours }))} />
        </ChartCard>

        <ChartCard title="Spend by department" subtitle="Approved, 12 months" metric={formatMoney(deptSpend.reduce((s, d) => s + d.value, 0))} isEmpty={deptSpend.length === 0}>
          <CategoryBars data={deptSpend} />
        </ChartCard>

        <ChartCard title="Spend by category" subtitle="All money, 12 months" metric={formatMoney(catSpend.reduce((s, d) => s + d.value, 0))} isEmpty={catSpend.length === 0}>
          <CategoryBars data={catSpend.map((c) => ({ ...c, name: humanize(c.name) }))} />
        </ChartCard>

        <ChartCard title="Travel by country" subtitle="Approved trips, 12 months" metric={formatMoney(travel.byCountry.reduce((s, d) => s + d.value, 0))} isEmpty={travel.byCountry.length === 0}>
          <CategoryBars data={travel.byCountry} />
        </ChartCard>

        <ChartCard title="Leave days by type" subtitle="Approved this year" metric={`${leaveMix.reduce((s, l) => s + l.value, 0)} days`} isEmpty={leaveMix.length === 0}>
          <CategoryBars data={leaveMix.map((l) => ({ ...l, name: humanize(l.name) }))} money={false} />
        </ChartCard>
      </div>

      {/* Module comparison — the "one number per module" management view */}
      <Card className="mt-5">
        <CardHeader title="Module summary" description="Where the money and the work actually sits" />
        <TableWrap>
          <THead>
            <TR>
              <TH>Module</TH>
              <TH align="right">This month</TH>
              <TH align="right">Last month</TH>
              <TH align="right">Change</TH>
              <TH align="right">Awaiting decision</TH>
              <TH>Largest contributor</TH>
            </TR>
          </THead>
          <TBody>
            <ModuleRow
              name="Business travel"
              current={travel.spendMonth}
              previous={travel.spendPrevMonth}
              pending={travel.pending}
              top={travel.byCountry[0]?.name}
              href="/travel"
            />
            <ModuleRow
              name="Procurement"
              current={procurement.spendMonth}
              previous={procurement.spendPrev}
              pending={procurement.pending}
              top={procurement.topVendors[0]?.name}
              href="/procurement"
            />
            <ModuleRow
              name="Expenses"
              current={expense.spendMonth}
              previous={expense.spendPrev}
              pending={expense.pending}
              top={expense.byCategory[0] ? humanize(expense.byCategory[0].name) : undefined}
              href="/expenses"
            />
          </TBody>
        </TableWrap>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Approval SLA by role" description="Completed steps over the last six months" />
        <TableWrap>
          <THead>
            <TR>
              <TH>Approver role</TH>
              <TH align="right">Average decision time</TH>
              <TH align="right">Decisions</TH>
              <TH align="right">Currently overdue</TH>
            </TR>
          </THead>
          <TBody>
            {bottlenecks.map((b) => (
              <TR key={b.role}>
                <TD className="font-medium">{humanize(b.role)}</TD>
                <TD numeric className={b.avgHours > 30 ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>
                  {formatDuration(b.avgHours)}
                </TD>
                <TD numeric>{b.completed}</TD>
                <TD numeric className={b.overdue > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-text-muted'}>
                  {b.overdue}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </Card>

      <p className="mt-3 text-[11px] text-text-subtle">
        Monthly figures use the month a request was <em>decided</em>, not submitted, so a request approved in{' '}
        {monthLabel(trend.at(-1)?.month ?? '2026-01')} counts there even if it was raised earlier.
      </p>
    </>
  );
}

function ModuleRow({
  name,
  current,
  previous,
  pending,
  top,
  href,
}: {
  name: string;
  current: number;
  previous: number;
  pending: number;
  top?: string;
  href: string;
}) {
  const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return (
    <TR interactive>
      <TD>
        <Link href={href} className="font-medium hover:underline">
          {name}
        </Link>
      </TD>
      <TD numeric>{formatMoney(current)}</TD>
      <TD numeric className="text-text-muted">
        {formatMoney(previous)}
      </TD>
      <TD numeric>
        {delta === null ? (
          '—'
        ) : (
          <span className={delta > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-semibold text-emerald-600 dark:text-emerald-400'}>
            {delta > 0 ? '+' : ''}
            {delta}%
          </span>
        )}
      </TD>
      <TD numeric>{pending}</TD>
      <TD className="text-text-muted">{top ?? '—'}</TD>
    </TR>
  );
}
