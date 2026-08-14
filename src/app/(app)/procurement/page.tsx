import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ShoppingCart } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { scopeLabelKey } from '@/lib/rbac';
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
import { getI18n, getT } from '@/lib/i18n/server';
import { formatCompactL, formatMoneyL } from '@/lib/i18n/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('procurement.title') };
}

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const { t, locale } = await getI18n();

  const filters = parseRequestFilters(sp, { mode: 'all', type: ['PURCHASE'], sort: 'newest', pageSize: 20 });
  const [stats, list] = await Promise.all([
    getProcurementStats(session),
    listRequests(session, { ...filters, type: ['PURCHASE'] }),
  ]);

  const params = toURLSearchParams(sp);
  const delta = stats.spendPrev > 0 ? Math.round(((stats.spendMonth - stats.spendPrev) / stats.spendPrev) * 100) : null;
  const scope = scopeLabelKey(session);
  const money = (v: number) => formatMoneyL(locale, v);
  const compact = (v: number) => formatCompactL(locale, v);

  return (
    <>
      <PageHeader
        title={t('procurement.title')}
        description={t('procurement.subtitle', { scope: t(scope.key, scope.vars) })}
        actions={
          <Link href="/requests/new/PURCHASE" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> {t('procurement.new')}
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label={t('procurement.mtd')}
          value={compact(stats.spendMonth)}
          delta={delta === null ? null : { value: delta }}
          sublabel={t('label.vsLastMonth')}
          icon="Wallet"
        />
        <StatTile
          label={t('procurement.pending')}
          value={stats.pending}
          sublabel={compact(stats.pendingValue)}
          icon="Clock"
          href="/approvals?type=PURCHASE"
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label={t('procurement.approved12')}
          value={stats.approvedYear}
          sublabel={t('type.PURCHASE')}
          icon="CheckCircle2"
        />
        <StatTile
          label={t('procurement.topVendor')}
          value={stats.topVendors[0]?.name ?? '—'}
          sublabel={stats.topVendors[0] ? compact(stats.topVendors[0].value) : t('label.noData')}
          icon="Store"
        />
        <StatTile
          label={t('procurement.topCategory')}
          value={stats.byCategory[0] ? t(`purchaseCategory.${stats.byCategory[0].name}`) : '—'}
          sublabel={stats.byCategory[0] ? compact(stats.byCategory[0].value) : t('label.noData')}
          icon="Tags"
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MonthlySpendChart
          title={t('procurement.byMonth')}
          subtitle={t('procurement.byMonthSub')}
          monthly={stats.monthly}
          current={stats.spendMonth}
          previous={stats.spendPrev}
        />
        <BreakdownChart
          title={t('procurement.byCategory')}
          subtitle={t('procurement.byCategorySub')}
          data={stats.byCategory}
          nameKey="purchaseCategory"
        />

        <RankedList
          title={t('procurement.topVendors')}
          description={t('procurement.topVendorsSub')}
          emptyMessage={t('procurement.topVendorsEmpty')}
          items={stats.topVendors.map((v) => ({
            key: v.id,
            primary: v.name,
            secondary: t('procurement.orders', { count: v.orders }),
            value: money(v.value),
            badge: v.isPreferred ? <Badge tone="emerald">{t('procurement.preferred')}</Badge> : undefined,
          }))}
        />

        {/* Price drift is the single most useful procurement signal — same item, different price */}
        <Card>
          <CardHeader title={t('procurement.priceHistory')} description={t('procurement.priceHistorySub')} />
          {stats.priceHistory.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-text-subtle">{t('procurement.priceHistoryEmpty')}</p>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('content.item')}</TH>
                  <TH align="right">{t('procurement.times')}</TH>
                  <TH align="right">{t('procurement.lowest')}</TH>
                  <TH align="right">{t('procurement.average')}</TH>
                  <TH align="right">{t('procurement.highest')}</TH>
                  <TH align="right">{t('procurement.spread')}</TH>
                </TR>
              </THead>
              <TBody>
                {stats.priceHistory.map((p) => {
                  const spread = p.minPrice > 0 ? Math.round(((p.maxPrice - p.minPrice) / p.minPrice) * 100) : 0;
                  return (
                    <TR key={p.name}>
                      <TD className="max-w-56 truncate font-medium">{p.name}</TD>
                      <TD numeric>{p.purchases}</TD>
                      <TD numeric>{money(p.minPrice)}</TD>
                      <TD numeric>{money(p.avgPrice)}</TD>
                      <TD numeric>{money(p.maxPrice)}</TD>
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

      <h2 className="mb-3 text-sm font-semibold text-text">{t('procurement.allRequests')}</h2>
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
          emptyTitle={t('procurement.emptyTitle')}
          emptyDescription={t('procurement.emptyBody')}
          emptyAction={
            <Link href="/requests/new/PURCHASE" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <ShoppingCart /> {t('procurement.new')}
            </Link>
          }
        />
      </Card>
    </>
  );
}
