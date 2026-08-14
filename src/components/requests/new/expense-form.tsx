'use client';

import * as React from 'react';
import { Loader2, Plus, Receipt, ScanLine, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { createExpenseAction, extractReceiptAction } from '@/server/actions/create';
import { toISODate } from '@/lib/dates';
import { formatMoney, round2 } from '@/lib/money';
import { CURRENCIES, EXPENSE_CATEGORIES } from '@/types/domain';
import { humanize } from '@/lib/utils';

interface ExpenseLine {
  key: string;
  expenseDate: string;
  category: string;
  merchant: string;
  description: string;
  amount: string;
  taxAmount: string;
  extracted?: boolean;
  confidence?: number;
}

const newLine = (): ExpenseLine => ({
  key: Math.random().toString(36).slice(2),
  expenseDate: toISODate(new Date()),
  category: 'MEAL',
  merchant: '',
  description: '',
  amount: '',
  taxAmount: '',
});

export function ExpenseForm({
  trips,
}: {
  trips: { id: string; requestNumber: string; city: string; country: string; startDate: string }[];
}) {
  const [paymentMethod, setPaymentMethod] = React.useState('PERSONAL');
  const [currency, setCurrency] = React.useState('USD');
  const [tripRequestId, setTripRequestId] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [items, setItems] = React.useState<ExpenseLine[]>([newLine()]);
  const [scanning, setScanning] = React.useState(false);

  const { pending, result, errors, run } = useCreateForm();
  const total = round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0));

  const mealsByDay = new Map<string, number>();
  for (const i of items) {
    if (i.category !== 'MEAL') continue;
    mealsByDay.set(i.expenseDate, (mealsByDay.get(i.expenseDate) ?? 0) + (Number(i.amount) || 0));
  }
  const mealBreach = [...mealsByDay.entries()].find(([, amount]) => amount > 50);

  function payload() {
    return {
      paymentMethod,
      currency,
      tripRequestId,
      description,
      items: items
        .filter((i) => Number(i.amount) > 0)
        .map((i) => ({
          expenseDate: i.expenseDate,
          category: i.category,
          merchant: i.merchant,
          description: i.description,
          amount: Number(i.amount),
          taxAmount: Number(i.taxAmount) || 0,
        })),
    };
  }

  /**
   * Receipt structuring. The file is read locally for its name and any text the
   * user pasted; nothing is uploaded in the prototype. Extracted fields land in
   * the form flagged as AI-filled so the user knows to check them.
   */
  async function scanReceipt(files: FileList | null) {
    if (!files?.length) return;
    setScanning(true);
    for (const file of Array.from(files).slice(0, 10)) {
      const res = await extractReceiptAction(file.name);
      if (res.ok) {
        setItems((prev) => [
          ...prev.filter((p) => p.amount || p.merchant),
          {
            key: Math.random().toString(36).slice(2),
            expenseDate: res.line.expenseDate,
            category: res.line.category,
            merchant: res.line.merchant,
            description: `From ${file.name}`,
            amount: res.line.amount ? String(res.line.amount) : '',
            taxAmount: res.line.taxAmount ? String(res.line.taxAmount) : '',
            extracted: true,
            confidence: res.line.confidence,
          },
        ]);
      }
    }
    setScanning(false);
  }

  function applyDraft(fields: Record<string, unknown>) {
    if (typeof fields.description === 'string') setDescription(fields.description);
    if (typeof fields.amount === 'number') {
      setItems((prev) => [{ ...prev[0], amount: String(fields.amount) }, ...prev.slice(1)]);
    }
    if (typeof fields.startDate === 'string') {
      setItems((prev) => [{ ...prev[0], expenseDate: fields.startDate as string }, ...prev.slice(1)]);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <AiDraftBox type="EXPENSE" onDraft={applyDraft} />

        <Card>
          <CardHeader title="Claim detail" icon={<Receipt className="size-4" />} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Paid by" htmlFor="paymentMethod" required error={errors.paymentMethod}>
              <Select id="paymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="PERSONAL">Personal money (reimburse me)</option>
                <option value="CORPORATE_CARD">Corporate card</option>
                <option value="COMPANY_ACCOUNT">Company account</option>
              </Select>
            </Field>

            <Field
              label="Link to a business trip"
              htmlFor="tripRequestId"
              hint="Links the claim to an approved trip so travel cost reporting stays complete."
              error={errors.tripRequestId}
            >
              <Select id="tripRequestId" value={tripRequestId} onChange={(e) => setTripRequestId(e.target.value)}>
                <option value="">Not related to a trip</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.requestNumber} — {t.city}, {t.country} ({t.startDate})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Note for the approver" htmlFor="description" className="sm:col-span-2" error={errors.description}>
              <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Receipts"
            description="Attach receipts and the details are read into the lines below for you to check."
            icon={<ScanLine className="size-4" />}
          />
          <CardBody>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-dashed border-border-strong px-4 py-6 text-center transition-colors hover:border-accent hover:bg-accent-soft/30">
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => scanReceipt(e.target.files)}
                disabled={scanning}
              />
              {scanning ? (
                <Loader2 className="size-5 animate-spin text-accent" />
              ) : (
                <ScanLine className="size-5 text-text-subtle" />
              )}
              <span className="text-xs font-medium text-text">
                {scanning ? 'Reading receipts…' : 'Choose receipt files'}
              </span>
              <span className="text-[11px] text-text-subtle">
                Images or PDF. Each receipt becomes an expense line you can edit.
              </span>
            </label>
            <p className="mt-2 text-[10px] leading-relaxed text-text-subtle">
              Prototype note: files are not uploaded to storage. Merchant, date, amount and category are inferred and
              flagged as AI-filled — always check them against the paper receipt.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Expense lines"
            actions={
              <Button size="sm" variant="secondary" onClick={() => setItems((p) => [...p, newLine()])}>
                <Plus /> Add line
              </Button>
            }
          />
          <CardBody className="space-y-2">
            {items.map((line, i) => (
              <div key={line.key} className="space-y-1">
                <div className="grid gap-2 sm:grid-cols-[9rem_8rem_minmax(0,1fr)_7rem_auto]">
                  <Input
                    aria-label={`Date ${i + 1}`}
                    type="date"
                    value={line.expenseDate}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, expenseDate: e.target.value } : x)))}
                  />
                  <Select
                    aria-label={`Category ${i + 1}`}
                    value={line.category}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, category: e.target.value } : x)))}
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {humanize(c)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Merchant ${i + 1}`}
                    placeholder="Merchant"
                    value={line.merchant}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, merchant: e.target.value } : x)))}
                  />
                  <Input
                    aria-label={`Amount ${i + 1}`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={line.amount}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, amount: e.target.value } : x)))}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove line ${i + 1}`}
                    disabled={items.length === 1}
                    onClick={() => setItems((p) => p.filter((x) => x.key !== line.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {line.extracted && (
                  <p className="pl-1 text-[10px] text-accent">
                    AI-filled from a receipt · {line.confidence}% confidence — check the merchant, date and amount.
                  </p>
                )}
              </div>
            ))}
            <FieldError id="items-error" message={errors.items} />

            <div className="flex items-center justify-between border-t border-border-subtle pt-2.5">
              <Select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-8 w-24">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <p className="text-sm font-semibold text-text tabular">Total {formatMoney(total, currency)}</p>
            </div>
          </CardBody>
        </Card>

        <FieldError id="form-error" message={errors._form} />

        <FormActions
          onSave={() => run((s) => createExpenseAction(payload(), s), false)}
          onSubmit={() => run((s) => createExpenseAction(payload(), s), true)}
          pending={pending}
          result={result}
          disabled={!items.some((i) => Number(i.amount) > 0)}
        />
      </div>

      <aside>
        <Card className="sticky top-20">
          <CardHeader title="Before you submit" />
          <CardBody className="space-y-2 text-xs">
            <p className="text-text-muted">
              Total <span className="font-semibold text-text tabular">{formatMoney(total, currency)}</span> across{' '}
              {items.filter((i) => Number(i.amount) > 0).length} line(s)
            </p>
            {mealBreach && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                Meals on {mealBreach[0]} total {formatMoney(mealBreach[1], currency)} — above the $50 daily allowance.
              </p>
            )}
            {total > 50 && <p className="text-[11px] text-text-subtle">Above $50 — Finance reviews after your manager.</p>}
            <p className="text-[11px] text-text-subtle">
              Each line is checked against every other claim in the company for a matching receipt before it reaches an
              approver.
            </p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
