import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ShoppingCart } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { scopeLabel } from '@/lib/rbac';
import { getProcurementStats } from '@/server/queries/modules';
import { listRequests } from '@/server/queries/requests';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { StatTile } from '@/components/stat-tile';
import { BreakdownChart, MonthlySpendChart, RankedList } from '@/components/module-page';
import { Badge, Card, CardHeader, buttonVariants } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { formatCompact, formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Purchase Requests' };

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;

  const filters = parseRequestFilters(sp, { mode: 'all', type: ['PURCHASE'], sort: 'newest', pageSize: 20 });
  const [stats, list] = await Promise.all([
    getProcurementStats(session),
    listRequests(session, { ...filters, type: ['PURCHASE'] }),
  ]);

  const params = toURLSearchParams(sp);
  const delta = stats.spendPrev > 0 ? Math.round(((stats.spendMonth - stats.spendPrev) / stats.spendPrev) * 100) : null;

  return (
    <>
      <PageHeader
        title="Purchase Requests"
        description={`Procurement activity, vendors and price history across ${scopeLabel(session).toLowerCase()}.`}
        actions={
          <Link href="/requests/new/PURCHASE" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> New purchase request
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Procurement (MTD)"
          value={formatCompact(stats.spendMonth)}
          delta={delta === null ? null : { value: delta }}
          sublabel="vs last month"
          icon="Wallet"
        />
        <StatTile
          label="Pending approval"
          value={stats.pending}
          sublabel={formatCompact(stats.pendingValue)}
          icon="Clock"
          href="/approvals?type=PURCHASE"
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
        <StatTile label="Approved (12 months)" value={stats.approvedYear} sublabel="Purchase requests" icon="CheckCircle2" />
        <StatTile
          label="Top vendor"
          value={stats.topVendors[0]?.name ?? '—'}
          sublabel={stats.topVendors[0] ? formatCompact(stats.topVendors[0].value) : 'No data'}
          icon="Store"
        />
        <StatTile
          label="Top category"
          value={stats.byCategory[0]?.name ?? '—'}
          sublabel={stats.byCategory[0] ? formatCompact(stats.byCategory[0].value) : 'No data'}
          icon="Tags"
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MonthlySpendChart
          title="Procurement by month"
          subtitle="Approved purchase requests"
          monthly={stats.monthly}
          current={stats.spendMonth}
          previous={stats.spendPrev}
        />
        <BreakdownChart title="Spend by category" subtitle="Approved, last 12 months" data={stats.byCategory} />

        <RankedList
          title="Top vendors"
          description="By approved spend over the last 12 months"
          emptyMessage="No approved purchases with a vendor recorded."
          items={stats.topVendors.map((v) => ({
            key: v.id,
            primary: v.name,
            secondary: `${v.orders} order${v.orders === 1 ? '' : 's'}`,
            value: formatMoney(v.value),
            badge: v.isPreferred ? <Badge tone="emerald">Preferred</Badge> : undefined,
          }))}
        />

        {/* Price drift is the single most useful procurement signal — same item, different price */}
        <Card>
          <CardHeader
            title="Price history"
            description="Items bought more than once, ordered by the spread between cheapest and dearest"
          />
          {stats.priceHistory.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-text-subtle">
              No item has been purchased twice yet, so there is nothing to compare.
            </p>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH align="right">Times</TH>
                  <TH align="right">Lowest</TH>
                  <TH align="right">Average</TH>
                  <TH align="right">Highest</TH>
                  <TH align="right">Spread</TH>
                </TR>
              </THead>
              <TBody>
                {stats.priceHistory.map((p) => {
                  const spread = p.minPrice > 0 ? Math.round(((p.maxPrice - p.minPrice) / p.minPrice) * 100) : 0;
                  return (
                    <TR key={p.name}>
                      <TD className="max-w-56 truncate font-medium">{p.name}</TD>
                      <TD numeric>{p.purchases}</TD>
                      <TD numeric>{formatMoney(p.minPrice)}</TD>
                      <TD numeric>{formatMoney(p.avgPrice)}</TD>
                      <TD numeric>{formatMoney(p.maxPrice)}</TD>
                      <TD numeric>
                        <span className={spread > 20 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-text-muted'}>
                          +{spread}%
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          )}
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-text">All purchase requests</h2>
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
          emptyTitle="No purchase requests match these filters"
          emptyDescription="Try clearing a filter, or raise a new purchase request."
          emptyAction={
            <Link href="/requests/new/PURCHASE" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <ShoppingCart /> New purchase request
            </Link>
          }
        />
      </Card>
    </>
  );
}
