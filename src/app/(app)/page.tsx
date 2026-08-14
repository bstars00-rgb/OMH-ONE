import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { requireLiveSession } from '@/server/auth-guard';
import { can, scopeLabel } from '@/lib/rbac';
import { isLiveModel } from '@/lib/ai';
import { buildMorningBrief } from '@/lib/ai/insights';
import {
  getApprovalTrend,
  getAttentionItems,
  getBottlenecks,
  getBudgetPositions,
  getDashboardStats,
  getLeaveMix,
  getSpendByCategory,
  getSpendByDepartment,
  getStatusMix,
  getTeamLeave,
  getUpcomingTrips,
} from '@/server/queries/dashboard';
import { PageHeader } from '@/components/page-header';
import { MorningBriefCard } from '@/components/morning-brief';
import { StatTile } from '@/components/stat-tile';
import { BottleneckBars, CategoryBars, ChartCard, SpendLine, StatusDonut, TrendArea } from '@/components/charts';
import { Card, CardHeader, CardBody, Progress, buttonVariants } from '@/components/ui/primitives';
import { PriorityBadge, RiskBadge, SlaBadge, StatusBadge, TypeBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/states';
import { formatCompact, formatMoney } from '@/lib/money';
import { formatDate, formatDuration, formatRange } from '@/lib/dates';
import { humanize } from '@/lib/utils';
import { STATUS_META, type RequestStatus } from '@/types/domain';

export default async function HomePage() {
  const session = await requireLiveSession();
  const companyWide = can(session, 'analytics.company');

  const [brief, stats, attention, statusMix, trend, deptSpend, catSpend, leaveMix, bottlenecks, trips, leave, budgets] =
    await Promise.all([
      buildMorningBrief(session),
      getDashboardStats(session),
      getAttentionItems(session),
      getStatusMix(session),
      getApprovalTrend(session, 6),
      getSpendByDepartment(session, 3),
      getSpendByCategory(session, 3),
      getLeaveMix(session),
      getBottlenecks(session),
      getUpcomingTrips(session, 5),
      getTeamLeave(session, 14),
      getBudgetPositions(session),
    ]);

  const pct = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);
  const spendDelta = pct(stats.spendThisMonth, stats.spendLastMonth);
  const requestDelta = pct(stats.requestsThisMonth, stats.requestsLastMonth);
  const strainedBudgets = budgets.filter((b) => b.utilization >= 0.7).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Home"
        description={`${scopeLabel(session)} · everything below reflects only what your role can see.`}
        actions={
          <Link href="/requests/new" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> New request
          </Link>
        }
      />

      <div className="space-y-5">
        <MorningBriefCard brief={brief} liveModel={isLiveModel()} />

        {/* Metric tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          <StatTile
            label="Pending approvals"
            value={stats.pendingForMe}
            sublabel={stats.overdueForMe > 0 ? `${stats.overdueForMe} overdue` : 'On track'}
            icon="Inbox"
            href="/approvals"
            tone={stats.overdueForMe > 0 ? 'critical' : stats.pendingForMe > 0 ? 'warning' : 'positive'}
          />
          <StatTile
            label="Requests this month"
            value={stats.requestsThisMonth}
            delta={requestDelta === null ? null : { value: requestDelta }}
            sublabel="vs last month"
            icon="FileText"
            href="/approvals?view=all"
          />
          <StatTile
            label="Approved spend (MTD)"
            value={formatCompact(stats.spendThisMonth)}
            delta={spendDelta === null ? null : { value: spendDelta }}
            sublabel="vs last month"
            icon="Wallet"
            href="/analytics"
          />
          <StatTile label="On leave today" value={stats.onLeaveToday} sublabel="Across your scope" icon="CalendarDays" href="/leave" />
          <StatTile label="Trips in progress" value={stats.activeTrips} sublabel={`${stats.upcomingTrips} upcoming`} icon="Plane" href="/travel" />
          <StatTile
            label="PR pending"
            value={stats.pendingPurchase}
            sublabel={formatCompact(stats.pendingPurchaseValue)}
            icon="ShoppingCart"
            href="/procurement"
          />
          <StatTile
            label="Avg approval time"
            value={stats.avgApprovalHours === null ? '—' : formatDuration(stats.avgApprovalHours)}
            sublabel="Last 90 days"
            icon="Timer"
            href="/analytics"
          />
          <StatTile
            label="Past SLA"
            value={stats.slaOverdue}
            sublabel="Company-wide steps"
            icon="AlarmClockOff"
            href="/approvals?sort=sla"
            tone={stats.slaOverdue > 0 ? 'warning' : 'positive'}
          />
        </div>

        {/* Needs your attention */}
        <Card>
          <CardHeader
            title="Needs your attention"
            description="The requests waiting on your decision, most consequential first."
            actions={
              <Link href="/approvals" className="text-xs font-medium text-accent hover:underline">
                View all
              </Link>
            }
          />
          {attention.length === 0 ? (
            <EmptyState
              title="You're all caught up"
              description="Nothing is waiting on your decision right now."
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {attention.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/requests/${a.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <PriorityBadge priority={a.priority} />
                    <TypeBadge type={a.requestType} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text">{a.title}</span>
                      <span className="block truncate text-[11px] text-text-muted">
                        {a.requestNumber} · {a.requesterName}
                      </span>
                    </span>
                    {a.amountBase > 0 && (
                      <span className="text-[13px] font-medium text-text tabular">{formatMoney(a.amountBase)}</span>
                    )}
                    {a.risk && <RiskBadge risk={a.risk} />}
                    <SlaBadge hoursRemaining={a.hoursToDue} />
                    <ArrowRight className="size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Approval status"
            subtitle="Requests in your scope, last 6 months"
            metric={String(statusMix.reduce((s, x) => s + x.count, 0))}
            isEmpty={statusMix.length === 0}
          >
            <StatusDonut
              data={statusMix.map((s) => ({
                ...s,
                label: STATUS_META[s.status as RequestStatus]?.label ?? s.status,
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Approval trend"
            subtitle="Submitted, approved and rejected by month"
            metric={String(trend.reduce((s, t) => s + t.submitted, 0))}
            delta={requestDelta === null ? null : { value: requestDelta, label: 'this month' }}
            isEmpty={trend.every((t) => t.submitted === 0)}
          >
            <TrendArea data={trend} />
          </ChartCard>

          <ChartCard
            title="Approved spend"
            subtitle="Monthly total, base currency USD"
            metric={formatMoney(stats.spendThisMonth)}
            delta={spendDelta === null ? null : { value: spendDelta, label: 'vs last month' }}
            isEmpty={trend.every((t) => t.spend === 0)}
          >
            <SpendLine data={trend} />
          </ChartCard>

          <ChartCard
            title="Spend by department"
            subtitle="Approved, last 3 months"
            metric={formatMoney(deptSpend.reduce((s, d) => s + d.value, 0))}
            isEmpty={deptSpend.length === 0}
            emptyMessage="No approved spend in your scope for this period."
          >
            <CategoryBars data={deptSpend} />
          </ChartCard>

          <ChartCard
            title="Spend by category"
            subtitle="Expense lines, trip costs and purchases combined"
            metric={formatMoney(catSpend.reduce((s, d) => s + d.value, 0))}
            isEmpty={catSpend.length === 0}
          >
            <CategoryBars data={catSpend.map((c) => ({ ...c, name: title(c.name) }))} />
          </ChartCard>

          <ChartCard
            title="Approval bottleneck"
            subtitle="Average hours per decision by approver role"
            metric={bottlenecks[0] ? `${bottlenecks[0].avgHours}h` : '—'}
            isEmpty={bottlenecks.length === 0}
            emptyMessage="Not enough completed approvals to measure."
          >
            <BottleneckBars data={bottlenecks.map((b) => ({ role: roleLabel(b.role), avgHours: b.avgHours }))} />
          </ChartCard>

          <ChartCard
            title="Leave taken this year"
            subtitle="Approved working days by leave type"
            metric={`${leaveMix.reduce((s, l) => s + l.value, 0)} days`}
            isEmpty={leaveMix.length === 0}
          >
            <CategoryBars data={leaveMix.map((l) => ({ ...l, name: title(l.name) }))} money={false} />
          </ChartCard>

          {/* Budget position — a table, because the exact figure matters more than the shape */}
          <Card>
            <CardHeader
              title="Budget pressure"
              description="Quarterly lines above 70% utilisation"
              actions={
                can(session, 'finance.view') ? (
                  <Link href="/budgets" className="text-xs font-medium text-accent hover:underline">
                    All budgets
                  </Link>
                ) : undefined
              }
            />
            <CardBody className="space-y-3">
              {strainedBudgets.length === 0 ? (
                <p className="py-6 text-center text-xs text-text-subtle">
                  No budget line is above 70% utilisation this quarter.
                </p>
              ) : (
                strainedBudgets.map((b) => (
                  <div key={`${b.departmentCode}-${b.category}`}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium text-text">
                        {b.departmentCode} · {title(b.category)}
                      </span>
                      <span className="text-text-muted tabular">
                        {formatMoney(b.spent + b.committed)} / {formatMoney(b.allocated)}
                        <span
                          className={
                            b.utilization >= 1
                              ? 'ml-1.5 font-semibold text-rose-600 dark:text-rose-400'
                              : 'ml-1.5 font-semibold text-amber-600 dark:text-amber-400'
                          }
                        >
                          {Math.round(b.utilization * 100)}%
                        </span>
                      </span>
                    </div>
                    <Progress
                      value={b.spent + b.committed}
                      max={b.allocated}
                      label={`${b.departmentCode} ${b.category} budget utilisation`}
                    />
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* Travel + leave lists */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Upcoming business trips"
              description="Next departures in your scope"
              actions={
                <Link href="/travel" className="text-xs font-medium text-accent hover:underline">
                  Travel dashboard
                </Link>
              }
            />
            {trips.length === 0 ? (
              <EmptyState title="No upcoming trips" description="Approved and pending trips appear here." className="py-8" />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {trips.map((t) => (
                  <li key={t.requestId}>
                    <Link
                      href={`/requests/${t.requestId}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text">
                          {t.city}, {t.country}
                        </span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {t.leadName}
                          {t.travellers > 1 ? ` +${t.travellers - 1}` : ''} · {formatRange(t.startDate, t.endDate)}
                        </span>
                      </span>
                      <span className="text-[13px] font-medium text-text tabular">{formatMoney(t.cost)}</span>
                      <StatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Team leave, next 14 days"
              description="Approved and pending"
              actions={
                <Link href="/calendar" className="text-xs font-medium text-accent hover:underline">
                  Calendar
                </Link>
              }
            />
            {leave.length === 0 ? (
              <EmptyState title="Nobody is scheduled off" description="Approved leave appears here." className="py-8" />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {leave.map((l, i) => (
                  <li key={`${l.employeeName}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text">{l.employeeName}</span>
                      <span className="block truncate text-[11px] text-text-muted">
                        {l.departmentCode ?? '—'} · {title(l.leaveType)}
                      </span>
                    </span>
                    <span className="text-[11px] text-text-muted tabular">
                      {formatDate(l.startDate, 'short')} – {formatDate(l.endDate, 'short')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {!companyWide && (
          <p className="text-center text-[11px] text-text-subtle">
            Figures are limited to what your role can see. A director sees the company-wide equivalent of this page.
          </p>
        )}
      </div>
    </>
  );
}

const title = humanize;
const roleLabel = humanize;
