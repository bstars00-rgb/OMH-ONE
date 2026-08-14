import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Plus, Receipt } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { scopeLabel } from '@/lib/rbac';
import { getExpenseStats } from '@/server/queries/modules';
import { listRequests } from '@/server/queries/requests';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { StatTile } from '@/components/stat-tile';
import { BreakdownChart, MonthlySpendChart } from '@/components/module-page';
import { Alert, Card, buttonVariants } from '@/components/ui/primitives';
import { formatCompact, formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/dates';

export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;

  const filters = parseRequestFilters(sp, { mode: 'all', type: ['EXPENSE'], sort: 'newest', pageSize: 20 });
  const [stats, list] = await Promise.all([
    getExpenseStats(session),
    listRequests(session, { ...filters, type: ['EXPENSE'] }),
  ]);

  const params = toURLSearchParams(sp);
  const delta = stats.spendPrev > 0 ? Math.round(((stats.spendMonth - stats.spendPrev) / stats.spendPrev) * 100) : null;

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`Expense claims and reimbursement across ${scopeLabel(session).toLowerCase()}.`}
        actions={
          <Link href="/requests/new/EXPENSE" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> New expense claim
          </Link>
        }
      />

      {stats.duplicates.length > 0 && (
        <Alert
          tone="rose"
          title={`${stats.duplicates.length} possible duplicate receipt${stats.duplicates.length === 1 ? '' : 's'}`}
          icon={<AlertTriangle className="size-4" />}
          className="mb-5"
        >
          <ul className="mt-1 space-y-1">
            {stats.duplicates.map((d, i) => (
              <li key={i}>
                <Link href={`/requests/${d.firstRequestId}`} className="hover:underline">
                  {d.merchant} · {formatDate(d.date)} · {formatMoney(d.amount)} — claimed on{' '}
                  {d.requestNumbers.join(' and ')}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] opacity-80">
            Matched on merchant, date and amount. Splitting one bill across lines of the same claim is not flagged.
          </p>
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Claims (MTD)"
          value={formatCompact(stats.spendMonth)}
          delta={delta === null ? null : { value: delta }}
          sublabel="vs last month"
          icon="Receipt"
        />
        <StatTile
          label="Awaiting approval"
          value={stats.pending}
          sublabel={formatCompact(stats.pendingValue)}
          icon="Clock"
          href="/approvals?type=EXPENSE"
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
        <StatTile label="Average claim" value={formatCompact(stats.avgClaim)} sublabel="Last 12 months" icon="Calculator" />
        <StatTile
          label="Duplicate flags"
          value={stats.duplicates.length}
          sublabel="Receipts on 2+ claims"
          icon="CopyCheck"
          tone={stats.duplicates.length > 0 ? 'critical' : 'positive'}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MonthlySpendChart
          title="Claims by month"
          subtitle="Approved expense claims"
          monthly={stats.monthly}
          current={stats.spendMonth}
          previous={stats.spendPrev}
        />
        <BreakdownChart title="Spend by category" subtitle="Expense lines, last 12 months" data={stats.byCategory} />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-text">All expense claims</h2>
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
          emptyTitle="No expense claims match these filters"
          emptyDescription="Try clearing a filter, or submit a new claim."
          emptyAction={
            <Link href="/requests/new/EXPENSE" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <Receipt /> New expense claim
            </Link>
          }
        />
      </Card>
    </>
  );
}
