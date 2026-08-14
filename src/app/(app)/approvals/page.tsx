import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Inbox } from 'lucide-react';
import { requireLiveSession } from '@/server/auth-guard';
import { can, scopeLabelKey } from '@/lib/rbac';
import { listRequests } from '@/server/queries/requests';
import { listDepartments, listSelectableEmployees } from '@/server/queries/reference';
import { parseRequestFilters, toURLSearchParams, type RawSearchParams } from '@/lib/search-params';
import { getI18n } from '@/lib/i18n/server';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from '@/components/requests/filter-bar';
import { RequestTable } from '@/components/requests/request-table';
import { Badge, Card, buttonVariants } from '@/components/ui/primitives';
import { ForbiddenPage } from '@/components/ui/states';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('approvals.title') };
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await requireLiveSession();
  const { t } = await getI18n();

  if (!can(session, 'request.approve')) return <ForbiddenPage what={t('nav.approvals')} />;

  const sp = await searchParams;
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) ?? 'inbox';
  const isInbox = view !== 'all';

  const filters = parseRequestFilters(sp, { mode: isInbox ? 'inbox' : 'all', sort: 'priority', pageSize: 25 });

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
  const scope = scopeLabelKey(session);

  return (
    <>
      <PageHeader
        title={t('approvals.title')}
        description={isInbox ? t('approvals.subtitleInbox') : t('approvals.subtitleAll', { scope: t(scope.key, scope.vars) })}
        meta={
          isInbox && total > 0 ? (
            <>
              <Badge tone="indigo">{t('approvals.awaiting', { count: total })}</Badge>
              {critical > 0 && <Badge tone="rose">{t('approvals.critical', { count: critical })}</Badge>}
              {overdue > 0 && <Badge tone="orange">{t('approvals.overdue', { count: overdue })}</Badge>}
            </>
          ) : undefined
        }
      />

      <div className="mb-3 flex gap-1 border-b border-border-subtle" role="tablist" aria-label={t('approvals.viewsAria')}>
        {[
          { key: 'inbox', label: t('approvals.tabInbox') },
          { key: 'all', label: t('approvals.tabAll') },
        ].map((tab) => {
          const active = (tab.key === 'inbox') === isInbox;
          return (
            <Link
              key={tab.key}
              href={tabHref(tab.key)}
              role="tab"
              aria-selected={active}
              className={
                active
                  ? 'border-b-2 border-accent px-3 py-2 text-[13px] font-medium text-accent'
                  : 'border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-text-muted hover:text-text'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <FilterBar
        departments={departments.map((d) => ({ value: d.id, label: `${d.code} — ${t(`dept.${d.code}`)}` }))}
        requesters={employees.map((e) => ({ value: e.id, label: e.name }))}
      />

      <Card className="overflow-hidden">
        <RequestTable
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          baseParams={params.toString()}
          currentSort={filters.sort}
          columns={
            isInbox
              ? ['priority', 'type', 'number', 'title', 'requester', 'department', 'amount', 'submitted', 'sla', 'risk']
              : ['priority', 'type', 'number', 'title', 'requester', 'department', 'amount', 'status', 'submitted', 'approver', 'risk']
          }
          emptyTitle={isInbox ? t('approvals.emptyInbox') : t('approvals.emptyFiltered')}
          emptyDescription={isInbox ? t('approvals.emptyInboxHint') : t('approvals.emptyFilteredHint')}
          emptyAction={
            isInbox ? (
              <Link href={tabHref('all')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <Inbox /> {t('approvals.browseAll')}
              </Link>
            ) : undefined
          }
        />
      </Card>

      {isInbox && total > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-text-subtle">
          <CheckCircle2 className="size-3.5" />
          {t('approvals.sortNote')}
        </p>
      )}
    </>
  );
}
