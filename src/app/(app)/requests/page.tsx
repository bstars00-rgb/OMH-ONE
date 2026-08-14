import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { countByStatus, listRequests } from '@/server/queries/requests';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { Card, buttonVariants } from '@/components/ui/primitives';
import { REQUEST_STATUSES, STATUS_META } from '@/types/domain';

export const metadata: Metadata = { title: 'My Requests' };

const TABS = [
  { key: '', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED,IN_REVIEW', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'RETURNED', label: 'Returned' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELED', label: 'Canceled' },
];

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;

  const filters = parseRequestFilters(sp, { mode: 'mine', sort: 'newest', pageSize: 25 });
  const [{ rows, total, page, pageSize }, counts] = await Promise.all([
    listRequests(session, filters),
    countByStatus(session, { mode: 'mine' }),
  ]);

  const params = toURLSearchParams(sp);
  const activeStatus = (Array.isArray(sp.status) ? sp.status[0] : sp.status) ?? '';

  const tabHref = (key: string) => {
    const p = new URLSearchParams(params.toString());
    if (key) p.set('status', key);
    else p.delete('status');
    p.delete('page');
    const qs = p.toString();
    return qs ? `?${qs}` : '/requests';
  };

  const countFor = (key: string) => {
    if (!key) return Object.values(counts).reduce((a, b) => a + b, 0);
    return key
      .split(',')
      .reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  };

  return (
    <>
      <PageHeader
        title="My Requests"
        description="Everything you have submitted, and everything still in draft."
        actions={
          <Link href="/requests/new" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> New request
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1 border-b border-border-subtle" role="tablist" aria-label="Request status">
        {TABS.map((t) => {
          const active = activeStatus === t.key;
          const n = countFor(t.key);
          return (
            <Link
              key={t.key || 'all'}
              href={tabHref(t.key)}
              role="tab"
              aria-selected={active}
              className={
                active
                  ? 'flex items-center gap-1.5 border-b-2 border-accent px-3 py-2 text-[13px] font-medium text-accent'
                  : 'flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-text-muted hover:text-text'
              }
            >
              {t.label}
              <span className="rounded bg-surface-sunken px-1 text-[10px] tabular">{n}</span>
            </Link>
          );
        })}
      </div>

      <FilterBar showStatus={false} showRisk={false} />

      <Card className="overflow-hidden">
        <RequestTable
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          baseParams={params}
          currentSort={filters.sort}
          columns={['type', 'number', 'title', 'amount', 'status', 'submitted', 'approver', 'sla']}
          emptyTitle={activeStatus ? `No ${STATUS_META[activeStatus.split(',')[0] as (typeof REQUEST_STATUSES)[number]]?.label.toLowerCase() ?? ''} requests` : 'You have not created any requests yet'}
          emptyDescription="Create a leave, business trip, purchase, expense, HR or general approval request — the system routes it to the right approvers automatically."
          emptyAction={
            <Link href="/requests/new" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <Plus /> New request
            </Link>
          }
        />
      </Card>
    </>
  );
}
