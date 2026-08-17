import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { requireLiveSession } from '@/server/auth-guard';
import { can, scopeLabelKey } from '@/lib/rbac';
import { isLiveModel } from '@/lib/ai';
import { aiLocale } from '@/lib/ai/locale-context';
import { buildMorningBrief } from '@/lib/ai/insights';
import { getI18n } from '@/lib/i18n/server';
import { formatCompactL, formatDateL, formatDurationL, formatMoneyL, formatRangeL, monthLabelL } from '@/lib/i18n/format';
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
import { humanize } from '@/lib/utils';

export default async function HomePage() {
  const session = await requireLiveSession();
  const { t, tOr, locale } = await getI18n();

  /**
   * Spend-by-category unions three tables that each carry their own enum —
   * expense lines, trip costs and purchase requests. Reading every value through
   * `expenseCategory.*` printed the raw key for the ones that family does not
   * contain (TRANSPORT, EVENT_FEE, VISA, IT, SERVICE), so each family is tried
   * in turn and the code itself is the last resort.
   */
  const categoryLabel = (code: string) =>
    tOr(`expenseCategory.${code}`, tOr(`tripCost.${code}`, tOr(`purchaseCategory.${code}`, humanize(code))));
  const companyWide = can(session, 'analytics.company');
  const scope = scopeLabelKey(session);
  const scopeText = t(scope.key, scope.vars);

  const [brief, stats, attention, statusMix, trend, deptSpend, catSpend, leaveMix, bottlenecks, trips, leave, budgets] =
    await Promise.all([
      buildMorningBrief(session, aiLocale(locale)),
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

  const money = (v: number | string) => formatMoneyL(locale, v);
  const compact = (v: number | string) => formatCompactL(locale, v);
  const pct = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);
  const spendDelta = pct(stats.spendThisMonth, stats.spendLastMonth);
  const requestDelta = pct(stats.requestsThisMonth, stats.requestsLastMonth);
  const strainedBudgets = budgets.filter((b) => b.utilization >= 0.7).slice(0, 5);
  const trendData = trend.map((p) => ({ ...p, label: monthLabelL(locale, p.month) }));

  return (
    <>
      <PageHeader
        title={t('home.title')}
        description={t('home.subtitle', { scope: scopeText })}
        actions={
          <Link href="/requests/new" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> {t('action.newRequest')}
          </Link>
        }
      />

      <div className="space-y-5">
        <MorningBriefCard brief={brief} liveModel={isLiveModel()} />

        {/* Metric tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          <StatTile
            label={t('home.tile.pending')}
            value={stats.pendingForMe}
            sublabel={stats.overdueForMe > 0 ? t('home.tile.pendingOverdue', { count: stats.overdueForMe }) : t('home.tile.onTrack')}
            icon="Inbox"
            href="/approvals"
            tone={stats.overdueForMe > 0 ? 'critical' : stats.pendingForMe > 0 ? 'warning' : 'positive'}
          />
          <StatTile
            label={t('home.tile.requestsThisMonth')}
            value={stats.requestsThisMonth}
            delta={requestDelta === null ? null : { value: requestDelta }}
            sublabel={t('label.vsLastMonth')}
            icon="FileText"
            href="/approvals?view=all"
          />
          <StatTile
            label={t('home.tile.spendMtd')}
            value={compact(stats.spendThisMonth)}
            delta={spendDelta === null ? null : { value: spendDelta }}
            sublabel={t('label.vsLastMonth')}
            icon="Wallet"
            href="/analytics"
          />
          <StatTile label={t('home.tile.onLeave')} value={stats.onLeaveToday} sublabel={t('home.tile.inScope')} icon="CalendarDays" href="/leave" />
          <StatTile
            label={t('home.tile.tripsActive')}
            value={stats.activeTrips}
            sublabel={t('home.tile.tripsUpcoming', { count: stats.upcomingTrips })}
            icon="Plane"
            href="/travel"
          />
          <StatTile
            label={t('home.tile.prPending')}
            value={stats.pendingPurchase}
            sublabel={compact(stats.pendingPurchaseValue)}
            icon="ShoppingCart"
            href="/procurement"
          />
          <StatTile
            label={t('home.tile.avgApproval')}
            value={stats.avgApprovalHours === null ? '—' : formatDurationL(locale, stats.avgApprovalHours)}
            sublabel={t('label.last90Days')}
            icon="Timer"
            href="/analytics"
          />
          <StatTile
            label={t('home.tile.pastSla')}
            value={stats.slaOverdue}
            sublabel={t('home.tile.companySteps')}
            icon="AlarmClockOff"
            href="/approvals?sort=sla"
            tone={stats.slaOverdue > 0 ? 'warning' : 'positive'}
          />
        </div>

        {/* Needs your attention */}
        <Card>
          <CardHeader
            title={t('home.attention.title')}
            description={t('home.attention.subtitle')}
            actions={
              <Link href="/approvals" className="text-xs font-medium text-accent hover:underline">
                {t('action.viewAll')}
              </Link>
            }
          />
          {attention.length === 0 ? (
            <EmptyState title={t('home.attention.empty')} description={t('home.attention.emptyHint')} className="py-10" />
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
                    {a.amountBase > 0 && <span className="text-[13px] font-medium text-text tabular">{money(a.amountBase)}</span>}
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
            title={t('home.chart.statusMix')}
            subtitle={t('home.chart.statusMixSub')}
            metric={String(statusMix.reduce((s, x) => s + x.count, 0))}
            isEmpty={statusMix.length === 0}
          >
            <StatusDonut data={statusMix.map((s) => ({ ...s, label: t(`status.${s.status}`) }))} />
          </ChartCard>

          <ChartCard
            title={t('home.chart.trend')}
            subtitle={t('home.chart.trendSub')}
            metric={String(trend.reduce((s, x) => s + x.submitted, 0))}
            delta={requestDelta === null ? null : { value: requestDelta, label: t('label.thisMonth') }}
            isEmpty={trend.every((x) => x.submitted === 0)}
          >
            <TrendArea data={trendData} />
          </ChartCard>

          <ChartCard
            title={t('home.chart.spend')}
            subtitle={t('home.chart.spendSub')}
            metric={money(stats.spendThisMonth)}
            delta={spendDelta === null ? null : { value: spendDelta, label: t('label.vsLastMonth') }}
            isEmpty={trend.every((x) => x.spend === 0)}
          >
            <SpendLine data={trendData} />
          </ChartCard>

          <ChartCard
            title={t('home.chart.byDept')}
            subtitle={t('home.chart.byDeptSub')}
            metric={money(deptSpend.reduce((s, d) => s + d.value, 0))}
            isEmpty={deptSpend.length === 0}
            emptyMessage={t('home.chart.byDeptEmpty')}
          >
            <CategoryBars data={deptSpend} />
          </ChartCard>

          <ChartCard
            title={t('home.chart.byCategory')}
            subtitle={t('home.chart.byCategorySub')}
            metric={money(catSpend.reduce((s, d) => s + d.value, 0))}
            isEmpty={catSpend.length === 0}
          >
            <CategoryBars data={catSpend.map((c) => ({ ...c, name: categoryLabel(c.name) }))} />
          </ChartCard>

          <ChartCard
            title={t('home.chart.bottleneck')}
            subtitle={t('home.chart.bottleneckSub')}
            metric={bottlenecks[0] ? formatDurationL(locale, bottlenecks[0].avgHours) : '—'}
            isEmpty={bottlenecks.length === 0}
            emptyMessage={t('home.chart.bottleneckEmpty')}
          >
            <BottleneckBars data={bottlenecks.map((b) => ({ role: t(`approverRole.${b.role}`), avgHours: b.avgHours }))} />
          </ChartCard>

          <ChartCard
            title={t('home.chart.leave')}
            subtitle={t('home.chart.leaveSub')}
            metric={`${leaveMix.reduce((s, x) => s + x.value, 0)}${t('label.days')}`}
            isEmpty={leaveMix.length === 0}
          >
            <CategoryBars data={leaveMix.map((x) => ({ ...x, name: t(`leaveType.${x.name}`) }))} money={false} />
          </ChartCard>

          {/* Budget position — a table, because the exact figure matters more than the shape */}
          <Card>
            <CardHeader
              title={t('home.budget.title')}
              description={t('home.budget.subtitle')}
              actions={
                can(session, 'finance.view') ? (
                  <Link href="/budgets" className="text-xs font-medium text-accent hover:underline">
                    {t('home.budget.allBudgets')}
                  </Link>
                ) : undefined
              }
            />
            <CardBody className="space-y-3">
              {strainedBudgets.length === 0 ? (
                <p className="py-6 text-center text-xs text-text-subtle">{t('home.budget.none')}</p>
              ) : (
                strainedBudgets.map((b) => (
                  <div key={`${b.departmentCode}-${b.category}`}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium text-text">
                        {b.departmentCode} · {t(`budgetCategory.${b.category}`)}
                      </span>
                      <span className="text-text-muted tabular">
                        {money(b.spent + b.committed)} / {money(b.allocated)}
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
                    <Progress value={b.spent + b.committed} max={b.allocated} label={`${b.departmentCode} ${b.category}`} />
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
              title={t('home.trips.title')}
              description={t('home.trips.subtitle')}
              actions={
                <Link href="/travel" className="text-xs font-medium text-accent hover:underline">
                  {t('home.trips.link')}
                </Link>
              }
            />
            {trips.length === 0 ? (
              <EmptyState title={t('home.trips.empty')} description={t('home.trips.emptyHint')} className="py-8" />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {trips.map((tr) => (
                  <li key={tr.requestId}>
                    <Link
                      href={`/requests/${tr.requestId}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text">
                          {tr.city}, {tr.country}
                        </span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {tr.leadName}
                          {tr.travellers > 1 ? ` +${tr.travellers - 1}` : ''} · {formatRangeL(locale, tr.startDate, tr.endDate)}
                        </span>
                      </span>
                      <span className="text-[13px] font-medium text-text tabular">{money(tr.cost)}</span>
                      <StatusBadge status={tr.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t('home.leave.title')} description={t('home.leave.subtitle')} actions={
              <Link href="/calendar" className="text-xs font-medium text-accent hover:underline">
                {t('nav.calendar')}
              </Link>
            } />
            {leave.length === 0 ? (
              <EmptyState title={t('home.leave.empty')} description={t('home.leave.emptyHint')} className="py-8" />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {leave.map((row, i) => (
                  <li key={`${row.employeeName}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text">{row.employeeName}</span>
                      <span className="block truncate text-[11px] text-text-muted">
                        {row.departmentCode ?? '—'} · {t(`leaveType.${row.leaveType}`)}
                      </span>
                    </span>
                    <span className="text-[11px] text-text-muted tabular">
                      {formatDateL(locale, row.startDate, 'short')} – {formatDateL(locale, row.endDate, 'short')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {!companyWide && <p className="text-center text-[11px] text-text-subtle">{t('meta.scopeNote')}</p>}
      </div>
    </>
  );
}
