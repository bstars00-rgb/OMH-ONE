import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Plus, Receipt } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { scopeLabelKey } from '@/lib/rbac';
import { getExpenseStats } from '@/server/queries/modules';
import { listRequests } from '@/server/queries/requests';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { StatTile } from '@/components/stat-tile';
import { BreakdownChart, MonthlySpendChart } from '@/components/module-page';
import { Alert, Card, buttonVariants } from '@/components/ui/primitives';
import { getI18n, getT } from '@/lib/i18n/server';
import { formatCompactL, formatDateL, formatMoneyL } from '@/lib/i18n/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('expense.title') };
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const { t, locale } = await getI18n();

  const filters = parseRequestFilters(sp, { mode: 'all', type: ['EXPENSE'], sort: 'newest', pageSize: 20 });
  const [stats, list] = await Promise.all([
    getExpenseStats(session),
    listRequests(session, { ...filters, type: ['EXPENSE'] }),
  ]);

  const params = toURLSearchParams(sp);
  const delta = stats.spendPrev > 0 ? Math.round(((stats.spendMonth - stats.spendPrev) / stats.spendPrev) * 100) : null;
  const scope = scopeLabelKey(session);
  const compact = (v: number) => formatCompactL(locale, v);

  return (
    <>
      <PageHeader
        title={t('expense.title')}
        description={t('expense.subtitle', { scope: t(scope.key, scope.vars) })}
        actions={
          <Link href="/requests/new/EXPENSE" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> {t('expense.new')}
          </Link>
        }
      />

      {stats.duplicates.length > 0 && (
        <Alert
          tone="rose"
          title={t('expense.dupTitle', { count: stats.duplicates.length })}
          icon={<AlertTriangle className="size-4" />}
          className="mb-5"
        >
          <ul className="mt-1 space-y-1">
            {stats.duplicates.map((d, i) => (
              <li key={i}>
                <Link href={`/requests/${d.firstRequestId}`} className="hover:underline">
                  {t('expense.dupLine', {
                    merchant: d.merchant,
                    date: formatDateL(locale, d.date),
                    amount: formatMoneyL(locale, d.amount),
                    numbers: d.requestNumbers.join(', '),
                  })}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] opacity-80">{t('expense.dupNote')}</p>
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t('expense.mtd')}
          value={compact(stats.spendMonth)}
          delta={delta === null ? null : { value: delta }}
          sublabel={t('label.vsLastMonth')}
          icon="Receipt"
        />
        <StatTile
          label={t('travel.awaitingApproval')}
          value={stats.pending}
          sublabel={compact(stats.pendingValue)}
          icon="Clock"
          href="/approvals?type=EXPENSE"
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label={t('expense.avgClaim')}
          value={compact(stats.avgClaim)}
          sublabel={t('label.last12Months')}
          icon="Calculator"
        />
        <StatTile
          label={t('expense.dupFlags')}
          value={stats.duplicates.length}
          sublabel={t('expense.dupFlagsSub')}
          icon="CopyCheck"
          tone={stats.duplicates.length > 0 ? 'critical' : 'positive'}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MonthlySpendChart
          title={t('expense.byMonth')}
          subtitle={t('expense.byMonthSub')}
          monthly={stats.monthly}
          current={stats.spendMonth}
          previous={stats.spendPrev}
        />
        <BreakdownChart
          title={t('procurement.byCategory')}
          subtitle={t('expense.byCategorySub')}
          data={stats.byCategory}
          nameKey="expenseCategory"
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-text">{t('expense.allClaims')}</h2>
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
          emptyTitle={t('expense.emptyFiltered')}
          emptyDescription={t('expense.emptyFilteredHint')}
          emptyAction={
            <Link href="/requests/new/EXPENSE" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <Receipt /> {t('expense.new')}
            </Link>
          }
        />
      </Card>
    </>
  );
}
