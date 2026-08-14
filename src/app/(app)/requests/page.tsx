import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireLiveSession } from '@/server/auth-guard';
import { countByStatus, listRequests } from '@/server/queries/requests';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { getI18n } from '@/lib/i18n/server';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { Card, buttonVariants } from '@/components/ui/primitives';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('myRequests.title') };
}

const TABS = [
  { key: '', labelKey: 'myRequests.tab.all' },
  { key: 'DRAFT', labelKey: 'myRequests.tab.draft' },
  { key: 'SUBMITTED,IN_REVIEW', labelKey: 'myRequests.tab.pending' },
  { key: 'APPROVED', labelKey: 'myRequests.tab.approved' },
  { key: 'RETURNED', labelKey: 'myRequests.tab.returned' },
  { key: 'REJECTED', labelKey: 'myRequests.tab.rejected' },
  { key: 'CANCELED', labelKey: 'myRequests.tab.canceled' },
];

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireLiveSession();
  const { t } = await getI18n();
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

  const countFor = (key: string) =>
    key ? key.split(',').reduce((sum, s) => sum + (counts[s] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title={t('myRequests.title')}
        description={t('myRequests.subtitle')}
        actions={
          <Link href="/requests/new" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Plus /> {t('action.newRequest')}
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1 border-b border-border-subtle" role="tablist" aria-label={t('myRequests.statusAria')}>
        {TABS.map((tab) => {
          const active = activeStatus === tab.key;
          return (
            <Link
              key={tab.key || 'all'}
              href={tabHref(tab.key)}
              role="tab"
              aria-selected={active}
              className={
                active
                  ? 'flex items-center gap-1.5 border-b-2 border-accent px-3 py-2 text-[13px] font-medium text-accent'
                  : 'flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-text-muted hover:text-text'
              }
            >
              {t(tab.labelKey)}
              <span className="rounded bg-surface-sunken px-1 text-[10px] tabular">{countFor(tab.key)}</span>
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
          baseParams={params.toString()}
          currentSort={filters.sort}
          columns={['type', 'number', 'title', 'amount', 'status', 'submitted', 'approver', 'sla']}
          emptyTitle={t('myRequests.empty')}
          emptyDescription={t('myRequests.emptyHint')}
          emptyAction={
            <Link href="/requests/new" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <Plus /> {t('action.newRequest')}
            </Link>
          }
        />
      </Card>
    </>
  );
}
