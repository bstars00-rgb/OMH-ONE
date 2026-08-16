import * as React from 'react';
import { FileText, Paperclip, Plane, Receipt, ShoppingCart } from 'lucide-react';
import { Avatar, Badge, Card, CardHeader, CardBody, DetailRow } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { num } from '@/lib/money';
import { getI18n } from '@/lib/i18n/server';
import { formatMoneyL, formatDateL, formatRangeL } from '@/lib/i18n/format';
import type { Locale, Translator } from '@/lib/i18n';
import type { RequestDetail } from '@/server/queries/requests';

/**
 * Translation handles resolved once by `RequestContent` and threaded down.
 *
 * The sub-renderers stay synchronous that way: only the entry point awaits the
 * locale, so a request body never renders half-translated.
 */
interface L {
  t: Translator;
  /** Enum values come from the database; unmapped codes fall back to the raw text. */
  tOr: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
}

/** Renders the body of a request according to its type. */
export async function RequestContent({ detail }: { detail: RequestDetail }) {
  const l = await getI18n();

  switch (detail.request.requestType) {
    case 'LEAVE':
      return <LeaveContent detail={detail} l={l} />;
    case 'BUSINESS_TRIP':
      return <TripContent detail={detail} l={l} />;
    case 'PURCHASE':
      return <PurchaseContent detail={detail} l={l} />;
    case 'EXPENSE':
      return <ExpenseContent detail={detail} l={l} />;
    default:
      // A template-filed request renders from its own field definitions.
      return detail.template ? (
        <TemplateContent detail={detail} l={l} />
      ) : (
        <GenericContent detail={detail} l={l} />
      );
  }
}

function LeaveContent({ detail, l }: { detail: RequestDetail; l: L }) {
  const { t, tOr, locale } = l;
  const leave = detail.leave;
  if (!leave) return <MissingDetail t={t} />;

  return (
    <Card>
      <CardHeader title={t('content.leaveTitle')} />
      <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        <dl>
          <DetailRow label={t('content.leaveType')}>
            {tOr(`leaveType.${leave.leaveType}`, title(leave.leaveType))}
          </DetailRow>
          <DetailRow label={t('label.period')}>
            {formatRangeL(locale, String(leave.startDate), String(leave.endDate))}
          </DetailRow>
          <DetailRow label={t('content.calendarDays')}>{leave.calendarDays}</DetailRow>
          <DetailRow label={t('content.workingDays')}>
            <span className="text-sm font-semibold">{num(leave.workingDays)}</span>
          </DetailRow>
        </dl>
        <dl>
          <DetailRow label={t('content.halfDayStart')}>{t(leave.halfDayStart ? 'common.yes' : 'common.no')}</DetailRow>
          <DetailRow label={t('content.halfDayEnd')}>{t(leave.halfDayEnd ? 'common.yes' : 'common.no')}</DetailRow>
          <DetailRow label={t('content.emergencyContact')}>{leave.emergencyContact ?? '—'}</DetailRow>
          <DetailRow label={t('leaveForm.handoverTo')}>{leave.handoverName ?? '—'}</DetailRow>
        </dl>
        {leave.reason && (
          <div className="sm:col-span-2">
            <p className="mt-3 mb-1 text-xs text-text-muted">{t('label.reason')}</p>
            <Prose>{leave.reason}</Prose>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TripContent({ detail, l }: { detail: RequestDetail; l: L }) {
  const { t, tOr, locale } = l;
  const trip = detail.trip;
  if (!trip) return <MissingDetail t={t} />;

  const total = num(trip.totalBase);
  const perTraveller = trip.travelers.length ? total / trip.travelers.length : total;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('content.tripTitle')} icon={<Plane className="size-4" />} />
        <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <dl>
            <DetailRow label={t('content.destination')}>
              {trip.city}, {trip.country}
            </DetailRow>
            <DetailRow label={t('label.type')}>
              {t(trip.isInternational ? 'content.international' : 'content.domestic')}
            </DetailRow>
            <DetailRow label={t('label.period')}>
              {formatRangeL(locale, String(trip.startDate), String(trip.endDate))}
            </DetailRow>
            <DetailRow label={t('content.duration')}>{t('unit.days', { count: trip.durationDays })}</DetailRow>
            <DetailRow label={t('content.event')}>{trip.eventName ?? '—'}</DetailRow>
            <DetailRow label={t('content.partner')}>{trip.partner ?? '—'}</DetailRow>
          </dl>
          <dl>
            <DetailRow label={t('content.outbound')}>{trip.outboundFlight ?? '—'}</DetailRow>
            <DetailRow label={t('content.inbound')}>{trip.inboundFlight ?? '—'}</DetailRow>
            <DetailRow label={t('content.hotel')}>{trip.hotelName ?? '—'}</DetailRow>
            <DetailRow label={t('content.nights')}>{trip.hotelNights}</DetailRow>
            <DetailRow label={t('content.ratePerNight')}>
              {trip.hotelRatePerNight ? formatMoneyL(locale, trip.hotelRatePerNight) : '—'}
            </DetailRow>
            <DetailRow label={t('content.transport')}>{trip.transportation ?? '—'}</DetailRow>
          </dl>
          <div className="sm:col-span-2">
            <p className="mt-3 mb-1 text-xs text-text-muted">{t('label.purpose')}</p>
            <Prose>{trip.purpose}</Prose>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('content.travellers', { count: trip.travelers.length })} />
        <CardBody className="flex flex-wrap gap-2">
          {trip.travelers.map((tr) => (
            <span
              key={tr.id}
              className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-sunken py-1 pr-3 pl-1"
            >
              <Avatar name={tr.name} size="xs" />
              <span className="text-xs font-medium text-text">{tr.name}</span>
              {tr.isLead && <Badge tone="indigo">{t('content.lead')}</Badge>}
            </span>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('content.costBreakdown')}
          description={t('content.perTraveller', { amount: formatMoneyL(locale, perTraveller) })}
          actions={<span className="text-sm font-semibold text-text tabular">{formatMoneyL(locale, total)}</span>}
        />
        <TableWrap>
          <THead>
            <TR>
              <TH>{t('label.category')}</TH>
              <TH>{t('label.description')}</TH>
              <TH align="right">{t('label.amount')}</TH>
              <TH align="right">{t('content.share')}</TH>
            </TR>
          </THead>
          <TBody>
            {trip.costs.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{tOr(`tripCost.${c.category}`, title(c.category))}</TD>
                <TD className="text-text-muted">{c.description ?? '—'}</TD>
                <TD numeric>{formatMoneyL(locale, c.amountBase)}</TD>
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

function PurchaseContent({ detail, l }: { detail: RequestDetail; l: L }) {
  const { t, tOr, locale } = l;
  const p = detail.purchase;
  if (!p) return <MissingDetail t={t} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('content.purchaseTitle')} icon={<ShoppingCart className="size-4" />} />
        <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <dl>
            <DetailRow label={t('label.category')}>
              {tOr(`purchaseCategory.${p.category}`, title(p.category))}
            </DetailRow>
            <DetailRow label={t('content.vendor')}>{p.vendorName ?? t('content.noVendor')}</DetailRow>
            <DetailRow label={t('content.requiredBy')}>
              {p.requiredDate ? formatDateL(locale, String(p.requiredDate)) : '—'}
            </DetailRow>
          </dl>
          <dl>
            <DetailRow label={t('content.quotations')}>
              <span className={p.quotationCount < 2 && num(p.totalBase) > 3000 ? 'text-rose-600 dark:text-rose-400' : ''}>
                {p.quotationCount}
              </span>
            </DetailRow>
            <DetailRow label={t('label.currency')}>{p.currency}</DetailRow>
            <DetailRow label={t('label.total')}>
              <span className="text-sm font-semibold">{formatMoneyL(locale, p.totalBase)}</span>
            </DetailRow>
          </dl>
          <div className="sm:col-span-2">
            <p className="mt-3 mb-1 text-xs text-text-muted">{t('label.purpose')}</p>
            <Prose>{p.purpose}</Prose>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('content.lineItems', { count: p.items.length })} />
        <TableWrap>
          <THead>
            <TR>
              <TH>{t('content.item')}</TH>
              <TH>{t('label.description')}</TH>
              <TH align="right">{t('content.qty')}</TH>
              <TH align="right">{t('content.unitPrice')}</TH>
              <TH align="right">{t('content.lineTotal')}</TH>
            </TR>
          </THead>
          <TBody>
            {p.items.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium">{i.itemName}</TD>
                <TD className="text-text-muted">{i.description ?? '—'}</TD>
                <TD numeric>{num(i.quantity)}</TD>
                <TD numeric>{formatMoneyL(locale, i.unitPrice)}</TD>
                <TD numeric className="font-medium">
                  {formatMoneyL(locale, i.lineTotal)}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </Card>
    </div>
  );
}

function ExpenseContent({ detail, l }: { detail: RequestDetail; l: L }) {
  const { t, tOr, locale } = l;
  const e = detail.expense;
  if (!e) return <MissingDetail t={t} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('content.claimTitle')} icon={<Receipt className="size-4" />} />
        <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <dl>
            <DetailRow label={t('content.paymentMethod')}>
              {tOr(`payment.${e.paymentMethod}.short`, title(e.paymentMethod))}
            </DetailRow>
            <DetailRow label={t('label.currency')}>{e.currency}</DetailRow>
            <DetailRow label={t('content.linkedTrip')}>
              {e.linkedTripNumber ? (
                <span className="font-mono text-[11px]">{e.linkedTripNumber}</span>
              ) : (
                t('content.notLinked')
              )}
            </DetailRow>
          </dl>
          <dl>
            <DetailRow label={t('content.lines')}>{e.items.length}</DetailRow>
            <DetailRow label={t('label.total')}>
              <span className="text-sm font-semibold">{formatMoneyL(locale, e.totalBase)}</span>
            </DetailRow>
            <DetailRow label={t('content.reimbursed')}>
              {e.reimbursedAt ? formatDateL(locale, e.reimbursedAt) : t('content.notYet')}
            </DetailRow>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('content.expenseLines', { count: e.items.length })} />
        <TableWrap>
          <THead>
            <TR>
              <TH>{t('label.date')}</TH>
              <TH>{t('label.category')}</TH>
              <TH>{t('content.merchant')}</TH>
              <TH align="right">{t('label.amount')}</TH>
              <TH align="right">{t('content.tax')}</TH>
              <TH>{t('content.source')}</TH>
            </TR>
          </THead>
          <TBody>
            {e.items.map((i) => (
              <TR key={i.id}>
                <TD className="whitespace-nowrap tabular">{formatDateL(locale, String(i.expenseDate))}</TD>
                <TD>
                  <Badge tone="slate">{tOr(`expenseCategory.${i.category}`, title(i.category))}</Badge>
                </TD>
                <TD className="font-medium">{i.merchant ?? '—'}</TD>
                <TD numeric className="font-medium">
                  {formatMoneyL(locale, i.amountBase)}
                </TD>
                <TD numeric className="text-text-muted">
                  {formatMoneyL(locale, i.taxAmount)}
                </TD>
                <TD className="text-text-muted">
                  {i.extractedByAi ? <Badge tone="indigo">{t('content.aiExtracted')}</Badge> : t('content.manual')}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </Card>
    </div>
  );
}

/**
 * Renders a template-filed request from the template's own fields.
 *
 * Reads the definitions rather than the stored keys so the approver sees the
 * labels in their language and in the order the form declared — and so a field
 * added to the template later does not silently disappear from old requests
 * (it renders as "—" instead, which is the truth).
 */
function TemplateContent({ detail, l }: { detail: RequestDetail; l: L }) {
  const { t, locale } = l;
  const template = detail.template!;
  const values = (detail.request.values ?? {}) as Record<string, unknown>;

  const show = (field: (typeof template.fields)[number]) => {
    const raw = values[field.key];
    if (raw === undefined || raw === null || raw === '') return '—';
    switch (field.type) {
      case 'money':
        return formatMoneyL(locale, Number(raw), detail.request.currency);
      case 'date':
        return formatDateL(locale, String(raw));
      case 'checkbox':
        return t(raw ? 'common.yes' : 'common.no');
      case 'select': {
        const option = field.options?.find((o) => o.value === String(raw));
        return option ? (locale === 'ko' ? option.labelKo : option.labelEn) : String(raw);
      }
      default:
        return String(raw);
    }
  };

  // Long text reads better full width, below the paired rows.
  const rows = template.fields.filter((f) => f.type !== 'textarea');
  const blocks = template.fields.filter((f) => f.type === 'textarea');

  return (
    <Card>
      <CardHeader title={locale === 'ko' ? template.nameKo : template.nameEn} icon={<FileText className="size-4" />} />
      <CardBody className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        <dl>
          {rows.slice(0, Math.ceil(rows.length / 2)).map((f) => (
            <DetailRow key={f.key} label={locale === 'ko' ? f.labelKo : f.labelEn}>
              {show(f)}
            </DetailRow>
          ))}
        </dl>
        <dl>
          {rows.slice(Math.ceil(rows.length / 2)).map((f) => (
            <DetailRow key={f.key} label={locale === 'ko' ? f.labelKo : f.labelEn}>
              {show(f)}
            </DetailRow>
          ))}
        </dl>
        {blocks.map((f) => (
          <div key={f.key} className="sm:col-span-2">
            <p className="mt-3 mb-1 text-xs text-text-muted">{locale === 'ko' ? f.labelKo : f.labelEn}</p>
            <Prose preserveBreaks>{show(f)}</Prose>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function GenericContent({ detail, l }: { detail: RequestDetail; l: L }) {
  const { t, tOr, locale } = l;
  const g = detail.generic;

  return (
    <Card>
      <CardHeader title={t('content.genericTitle')} icon={<FileText className="size-4" />} />
      <CardBody className="space-y-3">
        {g?.category && (
          <dl>
            <DetailRow label={t('label.category')}>{tOr(`genericCategory.${g.category}`, g.category)}</DetailRow>
            {g.requestedDate && (
              <DetailRow label={t('content.requestedDate')}>{formatDateL(locale, String(g.requestedDate))}</DetailRow>
            )}
          </dl>
        )}
        <div>
          <p className="mb-1 text-xs text-text-muted">{t('content.details')}</p>
          <Prose preserveBreaks>{g?.details ?? detail.request.description ?? t('content.noDetail')}</Prose>
        </div>
      </CardBody>
    </Card>
  );
}

export async function AttachmentList({ items }: { items: RequestDetail['attachments'] }) {
  const { t } = await getI18n();

  if (items.length === 0) {
    return <p className="text-xs text-text-subtle">{t('detail.noFiles')}</p>;
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

function MissingDetail({ t }: { t: Translator }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-text-muted">{t('detail.missingDetail')}</p>
      </CardBody>
    </Card>
  );
}

function Prose({ children, preserveBreaks }: { children: React.ReactNode; preserveBreaks?: boolean }) {
  return (
    <p
      className={
        'rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-text' +
        (preserveBreaks ? ' whitespace-pre-wrap' : '')
      }
    >
      {children}
    </p>
  );
}

/** Fallback display for an enum value the dictionary does not cover. */
function title(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
