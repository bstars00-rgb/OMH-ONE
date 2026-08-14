import * as React from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { TableWrap, THead, TH, TBody, TR, TD, Pagination } from '@/components/ui/table';
import { PriorityBadge, RiskBadge, SlaBadge, StatusBadge, TypeBadge } from '@/components/ui/badges';
import { Avatar } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/dates';
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

const HEADINGS: Record<Column, { label: string; align?: 'left' | 'right' | 'center'; sort?: string }> = {
  priority: { label: 'Priority', sort: 'priority' },
  type: { label: 'Type' },
  number: { label: 'Request' },
  title: { label: 'Title' },
  requester: { label: 'Requester' },
  department: { label: 'Dept' },
  amount: { label: 'Amount', align: 'right', sort: 'amount' },
  status: { label: 'Status' },
  submitted: { label: 'Submitted', sort: 'newest' },
  approver: { label: 'With' },
  sla: { label: 'SLA', sort: 'sla' },
  risk: { label: 'AI risk' },
};

export function RequestTable({
  rows,
  total,
  page,
  pageSize,
  columns = DEFAULT_COLUMNS,
  baseParams,
  emptyTitle = 'Nothing here',
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
  baseParams: URLSearchParams;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  currentSort?: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={<Inbox className="size-5" />} title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  const href = (overrides: Record<string, string>) => {
    const p = new URLSearchParams(baseParams.toString());
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
                  {h.label}
                </TH>
              );
            })}
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id} interactive className="relative">
              {columns.map((c) => (
                <Cell key={c} column={c} row={r} />
              ))}
            </TR>
          ))}
        </TBody>
      </TableWrap>
      <Pagination page={page} pageSize={pageSize} total={total} makeHref={(p) => href({ page: String(p) })} />
    </>
  );
}

function Cell({ column, row }: { column: Column; row: RequestListRow }) {
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
          {Number(row.amountBase) > 0 ? formatMoney(row.amountBase, row.currency) : '—'}
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
          {row.submittedAt ? formatDate(row.submittedAt) : 'Not submitted'}
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
      return <TD>{row.risk ? <RiskBadge risk={row.risk} /> : <span className="text-xs text-text-subtle">Not assessed</span>}</TD>;
    default:
      return <TD />;
  }
}
