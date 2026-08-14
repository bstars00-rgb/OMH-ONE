import type { Metadata } from 'next';
import Link from 'next/link';
import { Plane, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { scopeLabelKey } from '@/lib/rbac';
import { getTravelStats } from '@/server/queries/modules';
import { listRequests } from '@/server/queries/requests';
import { getUpcomingTrips } from '@/server/queries/dashboard';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { StatTile } from '@/components/stat-tile';
import { BreakdownChart, MonthlySpendChart, RankedList } from '@/components/module-page';
import { Card, buttonVariants } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/badges';
import { getI18n, getT } from '@/lib/i18n/server';
import { formatCompactL, formatMoneyL, formatRangeL } from '@/lib/i18n/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('travel.title') };
}

export default async function TravelPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const { t, locale } = await getI18n();

  const filters = parseRequestFilters(sp, { mode: 'all', type: ['BUSINESS_TRIP'], sort: 'newest', pageSize: 20 });
  const [stats, list, upcoming] = await Promise.all([
    getTravelStats(session),
    listRequests(session, { ...filters, type: ['BUSINESS_TRIP'] }),
    getUpcomingTrips(session, 8),
  ]);

  const params = toURLSearchParams(sp);
  const spendDelta = stats.spendPrevMonth > 0 ? Math.round(((stats.spendMonth - stats.spendPrevMonth) / stats.spendPrevMonth) * 100) : null;
  const scope = scopeLabelKey(session);
  const money = (v: number) => formatMoneyL(locale, v);
  const compact = (v: number) => formatCompactL(locale, v);

  return (
    <>
      <PageHeader
        title={t('travel.title')}
        description={t('travel.subtitle', { scope: t(scope.key, scope.vars) })}
        actions={
          <Link href="/requests/new/BUSINESS_TRIP" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> {t('travel.new')}
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label={t('travel.upcoming')}
          value={stats.upcoming}
          sublabel={t('travel.travellers', { count: stats.travellersUpcoming })}
          icon="Plane"
        />
        <StatTile
          label={t('travel.spendMtd')}
          value={compact(stats.spendMonth)}
          delta={spendDelta === null ? null : { value: spendDelta }}
          sublabel={t('label.vsLastMonth')}
          icon="Wallet"
        />
        <StatTile
          label={t('travel.avgTripCost')}
          value={compact(stats.avgTripCost)}
          sublabel={t('label.last12Months')}
          icon="Calculator"
        />
        <StatTile
          label={t('travel.perTraveller')}
          value={compact(stats.avgPerTraveller)}
          sublabel={t('label.last12Months')}
          icon="User"
        />
        <StatTile
          label={t('travel.topDestination')}
          value={stats.byCountry[0]?.name ?? '—'}
          sublabel={stats.byCountry[0] ? compact(stats.byCountry[0].value) : t('label.noData')}
          icon="MapPin"
        />
        <StatTile
          label={t('travel.awaitingApproval')}
          value={stats.pending}
          sublabel={t('travel.tripsInChain')}
          icon="Clock"
          href="/approvals?type=BUSINESS_TRIP"
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MonthlySpendChart
          title={t('travel.byMonth')}
          subtitle={t('travel.byMonthSub')}
          monthly={stats.monthly}
          current={stats.spendMonth}
          previous={stats.spendPrevMonth}
        />
        <BreakdownChart
          title={t('travel.byCountry')}
          subtitle={t('travel.byCountrySub')}
          data={stats.byCountry}
        />
        <BreakdownChart title={t('travel.byDept')} subtitle={t('travel.byCountrySub')} data={stats.byDepartment} />

        <RankedList
          title={t('travel.topTravellers')}
          description={t('travel.topTravellersSub')}
          emptyMessage={t('travel.topTravellersEmpty')}
          items={stats.topTravellers.map((row) => ({
            key: row.id,
            primary: row.name,
            secondary: t('travel.tripCount', { count: row.trips }),
            value: money(row.value),
            href: `/people/${row.id}`,
          }))}
        />
      </div>

      <RankedList
        title={t('travel.nextDepartures')}
        description={t('travel.nextDeparturesSub')}
        emptyMessage={t('travel.noUpcoming')}
        items={upcoming.map((row) => ({
          key: row.requestId,
          primary: `${row.city}, ${row.country}`,
          secondary: `${row.leadName}${row.travellers > 1 ? ` +${row.travellers - 1}` : ''} · ${formatRangeL(locale, row.startDate, row.endDate)}`,
          value: money(row.cost),
          href: `/requests/${row.requestId}`,
          badge: <StatusBadge status={row.status} />,
        }))}
      />

      <div className="mt-5">
        <h2 className="mb-3 text-sm font-semibold text-text">{t('travel.allRequests')}</h2>
        <FilterBar showType={false} />
        <Card className="overflow-hidden">
          <RequestTable
            rows={list.rows}
            total={list.total}
            page={list.page}
            pageSize={list.pageSize}
            baseParams={params.toString()}
            currentSort={filters.sort}
            columns={['number', 'title', 'requester', 'department', 'amount', 'status', 'submitted', 'approver', 'risk']}
            emptyTitle={t('travel.emptyFiltered')}
            emptyDescription={t('travel.emptyFilteredHint')}
            emptyAction={
              <Link href="/requests/new/BUSINESS_TRIP" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                <Plane /> {t('travel.new')}
              </Link>
            }
          />
        </Card>
      </div>
    </>
  );
}
