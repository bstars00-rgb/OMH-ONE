import * as React from 'react';
import { FileText, Paperclip, Plane, Receipt, ShoppingCart } from 'lucide-react';
import { Avatar, Badge, Card, CardHeader, CardBody, DetailRow } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { formatMoney, num } from '@/lib/money';
import { formatDate, formatRange } from '@/lib/dates';
import type { RequestDetail } from '@/server/queries/requests';

/** Renders the body of a request according to its type. */
export function RequestContent({ detail }: { detail: RequestDetail }) {
  switch (detail.request.requestType) {
    case 'LEAVE':
      return <LeaveContent detail={detail} />;
    case 'BUSINESS_TRIP':
      return <TripContent detail={detail} />;
    case 'PURCHASE':
      return <PurchaseContent detail={detail} />;
    case 'EXPENSE':
      return <ExpenseContent detail={detail} />;
    default:
      return <GenericContent detail={detail} />;
  }
}

function LeaveContent({ detail }: { detail: RequestDetail }) {
  const l = detail.leave;
  if (!l) return <MissingDetail />;
  return (
    <Card>
      <CardHeader title="Leave detail" />
      <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        <dl>
          <DetailRow label="Leave type">{title(l.leaveType)}</DetailRow>
          <DetailRow label="Period">{formatRange(String(l.startDate), String(l.endDate))}</DetailRow>
          <DetailRow label="Calendar days">{l.calendarDays}</DetailRow>
          <DetailRow label="Working days">
            <span className="text-sm font-semibold">{num(l.workingDays)}</span>
          </DetailRow>
        </dl>
        <dl>
          <DetailRow label="Half day at start">{l.halfDayStart ? 'Yes' : 'No'}</DetailRow>
          <DetailRow label="Half day at end">{l.halfDayEnd ? 'Yes' : 'No'}</DetailRow>
          <DetailRow label="Emergency contact">{l.emergencyContact ?? '—'}</DetailRow>
        </dl>
        {l.reason && (
          <div className="sm:col-span-2">
            <p className="mt-3 mb-1 text-xs text-text-muted">Reason</p>
            <p className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-text">
              {l.reason}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TripContent({ detail }: { detail: RequestDetail }) {
  const t = detail.trip;
  if (!t) return <MissingDetail />;
  const total = num(t.totalBase);
  const perTraveller = t.travelers.length ? total / t.travelers.length : total;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Trip detail" icon={<Plane className="size-4" />} />
        <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <dl>
            <DetailRow label="Destination">
              {t.city}, {t.country}
            </DetailRow>
            <DetailRow label="Type">{t.isInternational ? 'International' : 'Domestic'}</DetailRow>
            <DetailRow label="Period">{formatRange(String(t.startDate), String(t.endDate))}</DetailRow>
            <DetailRow label="Duration">{t.durationDays} days</DetailRow>
            <DetailRow label="Event">{t.eventName ?? '—'}</DetailRow>
            <DetailRow label="Partner">{t.partner ?? '—'}</DetailRow>
          </dl>
          <dl>
            <DetailRow label="Outbound flight">{t.outboundFlight ?? '—'}</DetailRow>
            <DetailRow label="Return flight">{t.inboundFlight ?? '—'}</DetailRow>
            <DetailRow label="Hotel">{t.hotelName ?? '—'}</DetailRow>
            <DetailRow label="Nights">{t.hotelNights}</DetailRow>
            <DetailRow label="Rate per night">{t.hotelRatePerNight ? formatMoney(t.hotelRatePerNight) : '—'}</DetailRow>
            <DetailRow label="Transport">{t.transportation ?? '—'}</DetailRow>
          </dl>
          <div className="sm:col-span-2">
            <p className="mt-3 mb-1 text-xs text-text-muted">Purpose</p>
            <p className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-text">
              {t.purpose}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Travellers (${t.travelers.length})`} />
        <CardBody className="flex flex-wrap gap-2">
          {t.travelers.map((tr) => (
            <span
              key={tr.id}
              className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-sunken py-1 pr-3 pl-1"
            >
              <Avatar name={tr.name} size="xs" />
              <span className="text-xs font-medium text-text">{tr.name}</span>
              {tr.isLead && <Badge tone="indigo">Lead</Badge>}
            </span>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Cost breakdown"
          description={`${formatMoney(perTraveller)} per traveller`}
          actions={<span className="text-sm font-semibold text-text tabular">{formatMoney(total)}</span>}
        />
        <TableWrap>
          <THead>
            <TR>
              <TH>Category</TH>
              <TH>Description</TH>
              <TH align="right">Amount</TH>
              <TH align="right">Share</TH>
            </TR>
          </THead>
          <TBody>
            {t.costs.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{title(c.category)}</TD>
                <TD className="text-text-muted">{c.description ?? '—'}</TD>
                <TD numeric>{formatMoney(c.amountBase)}</TD>
                <TD numeric className="text-text-muted">
                  {total > 0 ? `${Math.round((num(c.amountBase) / total) * 100)}%` : '—'}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </Card>
    </div>
  );
}

function PurchaseContent({ detail }: { detail: RequestDetail }) {
  const p = detail.purchase;
  if (!p) return <MissingDetail />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Purchase detail" icon={<ShoppingCart className="size-4" />} />
        <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <dl>
            <DetailRow label="Category">{title(p.category)}</DetailRow>
            <DetailRow label="Vendor">{p.vendorName ?? 'Not selected'}</DetailRow>
            <DetailRow label="Required by">{p.requiredDate ? formatDate(String(p.requiredDate)) : '—'}</DetailRow>
          </dl>
          <dl>
            <DetailRow label="Quotations">
              <span className={p.quotationCount < 2 && num(p.totalBase) > 3000 ? 'text-rose-600 dark:text-rose-400' : ''}>
                {p.quotationCount}
              </span>
            </DetailRow>
            <DetailRow label="Currency">{p.currency}</DetailRow>
            <DetailRow label="Total">
              <span className="text-sm font-semibold">{formatMoney(p.totalBase)}</span>
            </DetailRow>
          </dl>
          <div className="sm:col-span-2">
            <p className="mt-3 mb-1 text-xs text-text-muted">Purpose</p>
            <p className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-text">
              {p.purpose}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Line items (${p.items.length})`} />
        <TableWrap>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH>Description</TH>
              <TH align="right">Qty</TH>
              <TH align="right">Unit price</TH>
              <TH align="right">Line total</TH>
            </TR>
          </THead>
          <TBody>
            {p.items.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium">{i.itemName}</TD>
                <TD className="text-text-muted">{i.description ?? '—'}</TD>
                <TD numeric>{num(i.quantity)}</TD>
                <TD numeric>{formatMoney(i.unitPrice)}</TD>
                <TD numeric className="font-medium">
                  {formatMoney(i.lineTotal)}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </Card>
    </div>
  );
}

function ExpenseContent({ detail }: { detail: RequestDetail }) {
  const e = detail.expense;
  if (!e) return <MissingDetail />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Claim detail" icon={<Receipt className="size-4" />} />
        <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <dl>
            <DetailRow label="Payment method">{title(e.paymentMethod)}</DetailRow>
            <DetailRow label="Currency">{e.currency}</DetailRow>
            <DetailRow label="Linked trip">
              {e.linkedTripNumber ? (
                <span className="font-mono text-[11px]">{e.linkedTripNumber}</span>
              ) : (
                'Not linked'
              )}
            </DetailRow>
          </dl>
          <dl>
            <DetailRow label="Lines">{e.items.length}</DetailRow>
            <DetailRow label="Total">
              <span className="text-sm font-semibold">{formatMoney(e.totalBase)}</span>
            </DetailRow>
            <DetailRow label="Reimbursed">{e.reimbursedAt ? formatDate(e.reimbursedAt) : 'Not yet'}</DetailRow>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Expense lines (${e.items.length})`} />
        <TableWrap>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>Merchant</TH>
              <TH align="right">Amount</TH>
              <TH align="right">Tax</TH>
              <TH>Source</TH>
            </TR>
          </THead>
          <TBody>
            {e.items.map((i) => (
              <TR key={i.id}>
                <TD className="whitespace-nowrap tabular">{formatDate(String(i.expenseDate))}</TD>
                <TD>
                  <Badge tone="slate">{title(i.category)}</Badge>
                </TD>
                <TD className="font-medium">{i.merchant ?? '—'}</TD>
                <TD numeric className="font-medium">
                  {formatMoney(i.amountBase)}
                </TD>
                <TD numeric className="text-text-muted">
                  {formatMoney(i.taxAmount)}
                </TD>
                <TD className="text-text-muted">
                  {i.extractedByAi ? <Badge tone="indigo">AI extracted</Badge> : 'Manual'}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </Card>
    </div>
  );
}

function GenericContent({ detail }: { detail: RequestDetail }) {
  const g = detail.generic;
  return (
    <Card>
      <CardHeader title="Request detail" icon={<FileText className="size-4" />} />
      <CardBody className="space-y-3">
        {g?.category && (
          <dl>
            <DetailRow label="Category">{g.category}</DetailRow>
            {g.requestedDate && <DetailRow label="Requested date">{formatDate(String(g.requestedDate))}</DetailRow>}
          </dl>
        )}
        <div>
          <p className="mb-1 text-xs text-text-muted">Details</p>
          <p className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-text">
            {g?.details ?? detail.request.description ?? 'No further detail provided.'}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

export function AttachmentList({ items }: { items: RequestDetail['attachments'] }) {
  if (items.length === 0) {
    return <p className="text-xs text-text-subtle">No files attached.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-2">
          <Paperclip className="size-3.5 shrink-0 text-text-subtle" />
          <span className="min-w-0 flex-1 truncate text-xs text-text" title={a.fileName}>
            {a.fileName}
          </span>
          <span className="shrink-0 text-[10px] text-text-subtle tabular">{formatBytes(a.sizeBytes)}</span>
        </li>
      ))}
    </ul>
  );
}

function MissingDetail() {
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-text-muted">
          The type-specific detail for this request could not be loaded. The approval record itself is intact — see the
          timeline below.
        </p>
      </CardBody>
    </Card>
  );
}

function title(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
