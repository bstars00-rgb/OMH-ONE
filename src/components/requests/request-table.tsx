'use client';

import * as React from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { TableWrap, THead, TH, TBody, TR, TD, Pagination } from '@/components/ui/table';
import { PriorityBadge, RiskBadge, SlaBadge, StatusBadge, TypeBadge } from '@/components/ui/badges';
import { Avatar } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { useI18n } from '@/lib/i18n/client';
import { formatDateL, formatMoneyL } from '@/lib/i18n/format';
import type { RequestListRow } from '@/server/queries/requests';

export type Column =
  | 'priority'
  | 'type'
  | 'number'
  | 'title'
  | 'requester'
  | 'department'
  | 'amount'
  | 'status'
  | 'submitted'
  | 'approver'
  | 'sla'
  | 'risk';

const DEFAULT_COLUMNS: Column[] = [
  'priority',
  'type',
  'number',
  'title',
  'requester',
  'department',
  'amount',
  'status',
  'submitted',
  'approver',
  'sla',
  'risk',
];

/** Header label key and sort key per column. */
const HEADINGS: Record<Column, { key: string; align?: 'left' | 'right' | 'center'; sort?: string }> = {
  priority: { key: 'label.priority', sort: 'priority' },
  type: { key: 'label.type' },
  number: { key: 'label.request' },
  title: { key: 'label.title' },
  requester: { key: 'label.requester' },
  department: { key: 'label.departmentShort' },
  amount: { key: 'label.amount', align: 'right', sort: 'amount' },
  status: { key: 'label.status' },
  submitted: { key: 'label.submitted', sort: 'newest' },
  approver: { key: 'label.with' },
  sla: { key: 'label.sla', sort: 'sla' },
  risk: { key: 'label.aiRisk' },
};

export function RequestTable({
  rows,
  total,
  page,
  pageSize,
  columns = DEFAULT_COLUMNS,
  baseParams,
  emptyTitle,
  emptyDescription,
  emptyAction,
  currentSort,
}: {
  rows: RequestListRow[];
  total: number;
  page: number;
  pageSize: number;
  columns?: Column[];
  /** Current query string, so sort/pagination links preserve active filters. */
  baseParams: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  currentSort?: string;
}) {
  const { t, locale } = useI18n();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-5" />}
        title={emptyTitle ?? t('empty.nothingHere')}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const href = (overrides: Record<string, string>) => {
    const p = new URLSearchParams(baseParams);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `?${p.toString()}`;
  };

  return (
    <>
      <TableWrap>
        <THead>
          <TR>
            {columns.map((c) => {
              const h = HEADINGS[c];
              return (
                <TH
                  key={c}
                  align={h.align}
                  href={h.sort ? href({ sort: h.sort, page: '' }) : undefined}
                  sort={h.sort ? (currentSort === h.sort ? 'desc' : 'none') : undefined}
                >
                  {t(h.key)}
                </TH>
              );
            })}
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id} interactive className="relative">
              {columns.map((c) => (
                <Cell key={c} column={c} row={r} t={t} locale={locale} />
              ))}
            </TR>
          ))}
        </TBody>
      </TableWrap>
      <Pagination page={page} pageSize={pageSize} total={total} baseParams={baseParams} />
    </>
  );
}

function Cell({
  column,
  row,
  t,
  locale,
}: {
  column: Column;
  row: RequestListRow;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: 'en' | 'ko';
}) {
  switch (column) {
    case 'priority':
      return (
        <TD>
          <PriorityBadge priority={row.priority} />
        </TD>
      );
    case 'type':
      return (
        <TD>
          <TypeBadge type={row.requestType} />
        </TD>
      );
    case 'number':
      return (
        <TD>
          <Link href={`/requests/${row.id}`} className="font-mono text-xs font-medium text-accent hover:underline">
            {row.requestNumber}
          </Link>
        </TD>
      );
    case 'title':
      return (
        <TD className="max-w-72">
          <Link href={`/requests/${row.id}`} className="block truncate font-medium hover:underline" title={row.title}>
            {row.title}
          </Link>
        </TD>
      );
    case 'requester':
      return (
        <TD>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Avatar name={row.requesterName} size="xs" />
            <span className="truncate">{row.requesterName}</span>
          </span>
        </TD>
      );
    case 'department':
      return <TD className="text-text-muted">{row.departmentCode ?? '—'}</TD>;
    case 'amount':
      return (
        <TD numeric className={Number(row.amountBase) > 0 ? 'font-medium' : 'text-text-subtle'}>
          {Number(row.amountBase) > 0 ? formatMoneyL(locale, row.amountBase, row.currency) : '—'}
        </TD>
      );
    case 'status':
      return (
        <TD>
          <StatusBadge status={row.status} />
        </TD>
      );
    case 'submitted':
      return (
        <TD className="whitespace-nowrap text-text-muted tabular">
          {row.submittedAt ? formatDateL(locale, row.submittedAt) : t('detail.notSubmitted')}
        </TD>
      );
    case 'approver':
      return (
        <TD className="text-text-muted">
          {['SUBMITTED', 'IN_REVIEW'].includes(row.status) && row.currentApproverName ? (
            <span className="whitespace-nowrap" title={row.currentStepName ?? undefined}>
              {row.currentApproverName}
            </span>
          ) : (
            '—'
          )}
        </TD>
      );
    case 'sla':
      return (
        <TD>
          <SlaBadge
            hoursRemaining={row.hoursToDue === null ? null : Number(row.hoursToDue)}
            completed={!['SUBMITTED', 'IN_REVIEW'].includes(row.status)}
          />
        </TD>
      );
    case 'risk':
      return (
        <TD>
          {row.risk ? <RiskBadge risk={row.risk} /> : <span className="text-xs text-text-subtle">{t('risk.notAssessed')}</span>}
        </TD>
      );
    default:
      return <TD />;
  }
}
