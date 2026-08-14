import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Inbox } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { can, scopeLabel } from '@/lib/rbac';
import { listRequests } from '@/server/queries/requests';
import { listDepartments, listSelectableEmployees } from '@/server/queries/reference';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { Badge, Card, buttonVariants } from '@/components/ui/primitives';
import { ForbiddenPage } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Approvals' };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireSession();
  if (!can(session, 'request.approve')) {
    return <ForbiddenPage what="the approval inbox" />;
  }

  const sp = await searchParams;
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) ?? 'inbox';
  const isInbox = view !== 'all';

  const filters = parseRequestFilters(sp, {
    mode: isInbox ? 'inbox' : 'all',
    sort: 'priority',
    pageSize: 25,
  });

  const [{ rows, total, page, pageSize }, departments, employees] = await Promise.all([
    listRequests(session, filters),
    listDepartments(),
    listSelectableEmployees(session),
  ]);

  const params = toURLSearchParams(sp);
  const tabHref = (v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v === 'inbox') p.delete('view');
    else p.set('view', v);
    p.delete('page');
    return `?${p.toString()}`;
  };

  // `hoursToDue` is computed by the database, so the count here agrees exactly
  // with the SLA badge rendered on each row.
  const overdue = rows.filter((r) => r.hoursToDue !== null && Number(r.hoursToDue) < 0).length;
  const critical = rows.filter((r) => r.priority === 'CRITICAL').length;

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          isInbox
            ? 'Requests waiting on your decision, ordered by what actually needs attention first.'
            : `All requests visible to you — ${scopeLabel(session).toLowerCase()}.`
        }
        meta={
          isInbox && total > 0 ? (
            <>
              <Badge tone="indigo">{total} awaiting you</Badge>
              {critical > 0 && <Badge tone="rose">{critical} critical</Badge>}
              {overdue > 0 && <Badge tone="orange">{overdue} past SLA</Badge>}
            </>
          ) : undefined
        }
      />

      <div className="mb-3 flex gap-1 border-b border-border-subtle" role="tablist" aria-label="Approval views">
        {[
          { key: 'inbox', label: 'Waiting on me' },
          { key: 'all', label: 'All visible requests' },
        ].map((t) => {
          const active = (t.key === 'inbox') === isInbox;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              role="tab"
              aria-selected={active}
              className={
                active
                  ? 'border-b-2 border-accent px-3 py-2 text-[13px] font-medium text-accent'
                  : 'border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-text-muted hover:text-text'
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <FilterBar
        departments={departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }))}
        requesters={employees.map((e) => ({ value: e.id, label: e.name }))}
      />

      <Card className="overflow-hidden">
        <RequestTable
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          baseParams={params}
          currentSort={filters.sort}
          columns={
            isInbox
              ? ['priority', 'type', 'number', 'title', 'requester', 'department', 'amount', 'submitted', 'sla', 'risk']
              : ['priority', 'type', 'number', 'title', 'requester', 'department', 'amount', 'status', 'submitted', 'approver', 'risk']
          }
          emptyTitle={isInbox ? "You're all caught up" : 'No requests match these filters'}
          emptyDescription={
            isInbox
              ? 'Nothing is waiting on your decision right now. New requests will appear here and in your notifications.'
              : 'Try clearing a filter or widening the date range.'
          }
          emptyAction={
            isInbox ? (
              <Link href={tabHref('all')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <Inbox /> Browse all visible requests
              </Link>
            ) : undefined
          }
        />
      </Card>

      {isInbox && total > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-text-subtle">
          <CheckCircle2 className="size-3.5" />
          Sorted by AI priority, then SLA, then submission date — so the oldest item is not automatically the first.
        </p>
      )}
    </>
  );
}
