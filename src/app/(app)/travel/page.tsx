import type { Metadata } from 'next';
import Link from 'next/link';
import { Plane, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { scopeLabel } from '@/lib/rbac';
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
import { formatCompact, formatMoney } from '@/lib/money';
import { formatRange } from '@/lib/dates';

export const metadata: Metadata = { title: 'Business Trips' };

export default async function TravelPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;

  const filters = parseRequestFilters(sp, { mode: 'all', type: ['BUSINESS_TRIP'], sort: 'newest', pageSize: 20 });
  const [stats, list, upcoming] = await Promise.all([
    getTravelStats(session),
    listRequests(session, { ...filters, type: ['BUSINESS_TRIP'] }),
    getUpcomingTrips(session, 8),
  ]);

  const params = toURLSearchParams(sp);
  const spendDelta = stats.spendPrevMonth > 0 ? Math.round(((stats.spendMonth - stats.spendPrevMonth) / stats.spendPrevMonth) * 100) : null;

  return (
    <>
      <PageHeader
        title="Business Trips"
        description={`Travel activity and cost across ${scopeLabel(session).toLowerCase()}.`}
        actions={
          <Link href="/requests/new/BUSINESS_TRIP" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> New trip
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Upcoming trips" value={stats.upcoming} sublabel={`${stats.travellersUpcoming} travellers`} icon="Plane" />
        <StatTile
          label="Travel spend (MTD)"
          value={formatCompact(stats.spendMonth)}
          delta={spendDelta === null ? null : { value: spendDelta }}
          sublabel="vs last month"
          icon="Wallet"
        />
        <StatTile label="Average trip cost" value={formatCompact(stats.avgTripCost)} sublabel="Last 12 months" icon="Calculator" />
        <StatTile label="Per traveller" value={formatCompact(stats.avgPerTraveller)} sublabel="Last 12 months" icon="User" />
        <StatTile
          label="Top destination"
          value={stats.byCountry[0]?.name ?? '—'}
          sublabel={stats.byCountry[0] ? formatCompact(stats.byCountry[0].value) : 'No data'}
          icon="MapPin"
        />
        <StatTile
          label="Awaiting approval"
          value={stats.pending}
          sublabel="Trips in the chain"
          icon="Clock"
          href="/approvals?type=BUSINESS_TRIP"
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MonthlySpendChart
          title="Travel spend by month"
          subtitle="Approved trips, base currency USD"
          monthly={stats.monthly}
          current={stats.spendMonth}
          previous={stats.spendPrevMonth}
        />
        <BreakdownChart
          title="Cost by destination country"
          subtitle="Approved trips, last 12 months"
          data={stats.byCountry}
          humanizeNames={false}
        />
        <BreakdownChart title="Cost by department" subtitle="Approved trips, last 12 months" data={stats.byDepartment} humanizeNames={false} />

        <RankedList
          title="Most frequent travellers"
          description="Cost apportioned per traveller across the last 12 months"
          emptyMessage="No approved trips in your scope yet."
          items={stats.topTravellers.map((t) => ({
            key: t.id,
            primary: t.name,
            secondary: `${t.trips} trip${t.trips === 1 ? '' : 's'}`,
            value: formatMoney(t.value),
            href: `/people/${t.id}`,
          }))}
        />
      </div>

      <RankedList
        title="Next departures"
        description="Approved and in-flight trips, soonest first"
        emptyMessage="No upcoming trips."
        items={upcoming.map((t) => ({
          key: t.requestId,
          primary: `${t.city}, ${t.country}`,
          secondary: `${t.leadName}${t.travellers > 1 ? ` +${t.travellers - 1}` : ''} · ${formatRange(t.startDate, t.endDate)}`,
          value: formatMoney(t.cost),
          href: `/requests/${t.requestId}`,
          badge: <StatusBadge status={t.status} />,
        }))}
      />

      <div className="mt-5">
        <h2 className="mb-3 text-sm font-semibold text-text">All trip requests</h2>
        <FilterBar showType={false} />
        <Card className="overflow-hidden">
          <RequestTable
            rows={list.rows}
            total={list.total}
            page={list.page}
            pageSize={list.pageSize}
            baseParams={params}
            currentSort={filters.sort}
            columns={['number', 'title', 'requester', 'department', 'amount', 'status', 'submitted', 'approver', 'risk']}
            emptyTitle="No business trips match these filters"
            emptyDescription="Try clearing a filter, or create a new trip request."
            emptyAction={
              <Link href="/requests/new/BUSINESS_TRIP" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                <Plane /> New trip
              </Link>
            }
          />
        </Card>
      </div>
    </>
  );
}
