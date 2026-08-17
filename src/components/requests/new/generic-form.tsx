'use client';

import * as React from 'react';
import { FileText, UserCog } from 'lucide-react';
import { Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { ChainPicker, type LineOption } from './chain-picker';
import { createGenericAction } from '@/server/actions/create';
import { toISODate } from '@/lib/dates';
import { useI18n } from '@/lib/i18n/client';
import { formatMoneyL } from '@/lib/i18n/format';
import { CURRENCIES } from '@/types/domain';

/**
 * Stored values, deliberately English.
 *
 * The chosen string is what lands in the database, so translating it would make
 * a Korean-entered request unsearchable next to an English-entered one. The
 * dictionary maps each value to a display label instead.
 */
const HR_CATEGORIES = [
  'Employment certificate',
  'Contract amendment',
  'Work-from-home arrangement',
  'Training sponsorship',
  'Equipment request',
  'Parental leave planning',
  'Payroll query',
  'Other',
];

const GENERAL_CATEGORIES = [
  'Contract or agreement',
  'Membership or subscription',
  'Insurance',
  'Event or sponsorship',
  'Donation',
  'Facilities',
  'Other',
];

export function GenericForm({ type, lines }: { type: 'HR' | 'GENERAL'; lines: LineOption[] }) {
  const { t, tOr, locale } = useI18n();
  const today = toISODate(new Date());
  const categories = type === 'HR' ? HR_CATEGORIES : GENERAL_CATEGORIES;

  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState(categories[0]);
  const [details, setDetails] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [currency, setCurrency] = React.useState('USD');
  const [requestedDate, setRequestedDate] = React.useState('');

  const { pending, result, errors, run } = useCreateForm();
  const [approverIds, setApproverIds] = React.useState<string[]>([]);
  const [lineId, setLineId] = React.useState<string | null>(null);
  const numericAmount = Number(amount) || 0;

  function payload() {
    return { title, category, details, amount: numericAmount, currency, requestedDate };
  }

  function applyDraft(fields: Record<string, unknown>) {
    if (typeof fields.title === 'string') setTitle(fields.title);
    if (typeof fields.details === 'string') setDetails(fields.details);
    if (typeof fields.description === 'string') setDetails(fields.description);
    if (typeof fields.amount === 'number') setAmount(String(fields.amount));
    if (typeof fields.startDate === 'string') setRequestedDate(fields.startDate);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <AiDraftBox type={type} onDraft={applyDraft} />

        <Card>
          <CardHeader
            title={t(type === 'HR' ? 'genForm.hrTitle' : 'genForm.generalTitle')}
            icon={type === 'HR' ? <UserCog className="size-4" /> : <FileText className="size-4" />}
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t('label.title')} htmlFor="title" required className="sm:col-span-2" error={errors.title}>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t(type === 'HR' ? 'genForm.titlePlaceholderHr' : 'genForm.titlePlaceholderGeneral')}
              />
            </Field>

            <Field label={t('label.category')} htmlFor="category" required error={errors.category}>
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {tOr(`genericCategory.${c}`, c)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('prForm.neededBy')} htmlFor="requestedDate" error={errors.requestedDate}>
              <Input
                id="requestedDate"
                type="date"
                min={today}
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
              />
            </Field>

            <Field label={t('content.details')} htmlFor="details" required className="sm:col-span-2" error={errors.details}>
              <Textarea
                id="details"
                rows={5}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t('genForm.detailsPlaceholder')}
              />
            </Field>

            <Field
              label={t('label.amount')}
              htmlFor="amount"
              hint={t('genForm.amountHint')}
              error={errors.amount}
            >
              <Input
                id="amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>

            <Field label={t('label.currency')} htmlFor="currency" error={errors.currency}>
              <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <FieldError id="form-error" message={errors._form} />

        <FormActions
          onSave={() => run((s) => createGenericAction(type, payload(), s, { approverIds, approvalLineId: lineId }), false)}
          onSubmit={() => run((s) => createGenericAction(type, payload(), s, { approverIds, approvalLineId: lineId }), true)}
          pending={pending}
          result={result}
          disabled={!title.trim() || details.trim().length < 10}
        />
      </div>

      <aside className="space-y-4">
        <ChainPicker
          facts={{ requestType: type }}
          colleagues={[]}
          lines={lines}
          value={approverIds}
          onChange={setApproverIds}
          onLineChange={setLineId}
        />
        <Card className="sticky top-20">
          <CardHeader title={t('genForm.routing')} />
          <CardBody className="space-y-2 text-xs text-text-muted">
            <p>
              {t(
                type === 'HR'
                  ? 'genForm.routingHr'
                  : numericAmount > 1000
                    ? 'genForm.routingGeneralDirector'
                    : 'genForm.routingGeneral',
              )}
            </p>
            {numericAmount > 0 && (
              <p className="text-text">
                {t('label.amount')}{' '}
                <span className="font-semibold tabular">{formatMoneyL(locale, numericAmount, currency)}</span>
              </p>
            )}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
