'use client';

import * as React from 'react';
import { FileText, UserCog } from 'lucide-react';
import { Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { createGenericAction } from '@/server/actions/create';
import { toISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { CURRENCIES } from '@/types/domain';

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

export function GenericForm({ type }: { type: 'HR' | 'GENERAL' }) {
  const today = toISODate(new Date());
  const categories = type === 'HR' ? HR_CATEGORIES : GENERAL_CATEGORIES;

  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState(categories[0]);
  const [details, setDetails] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [currency, setCurrency] = React.useState('USD');
  const [requestedDate, setRequestedDate] = React.useState('');

  const { pending, result, errors, run } = useCreateForm();
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
            title={type === 'HR' ? 'HR request' : 'General approval'}
            icon={type === 'HR' ? <UserCog className="size-4" /> : <FileText className="size-4" />}
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="title" required className="sm:col-span-2" error={errors.title}>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={type === 'HR' ? 'Employment certificate for visa application' : 'Annual insurance renewal'}
              />
            </Field>

            <Field label="Category" htmlFor="category" required error={errors.category}>
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Needed by" htmlFor="requestedDate" error={errors.requestedDate}>
              <Input
                id="requestedDate"
                type="date"
                min={today}
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
              />
            </Field>

            <Field label="Details" htmlFor="details" required className="sm:col-span-2" error={errors.details}>
              <Textarea
                id="details"
                rows={5}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Explain what you need and why. The approver sees an AI summary of this alongside the full text."
              />
            </Field>

            <Field
              label="Amount"
              htmlFor="amount"
              hint="Leave at zero if there is no cost. Above $1,000 also needs Director approval."
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

            <Field label="Currency" htmlFor="currency" error={errors.currency}>
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
          onSave={() => run((s) => createGenericAction(type, payload(), s), false)}
          onSubmit={() => run((s) => createGenericAction(type, payload(), s), true)}
          pending={pending}
          result={result}
          disabled={!title.trim() || details.trim().length < 10}
        />
      </div>

      <aside>
        <Card className="sticky top-20">
          <CardHeader title="Routing" />
          <CardBody className="space-y-2 text-xs text-text-muted">
            {type === 'HR' ? (
              <p>Goes to your line manager, then HR.</p>
            ) : (
              <p>
                Goes to your line manager
                {numericAmount > 1000 ? ', then the Director because the amount is above $1,000' : ''}.
              </p>
            )}
            {numericAmount > 0 && (
              <p className="text-text">
                Amount <span className="font-semibold tabular">{formatMoney(numericAmount, currency)}</span>
              </p>
            )}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
