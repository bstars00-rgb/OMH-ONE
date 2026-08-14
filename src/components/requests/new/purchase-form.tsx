'use client';

import * as React from 'react';
import { Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { createPurchaseAction } from '@/server/actions/create';
import { toISODate } from '@/lib/dates';
import { formatMoney, round2 } from '@/lib/money';
import { CURRENCIES, PURCHASE_CATEGORIES } from '@/types/domain';
import { humanize } from '@/lib/utils';

interface ItemLine {
  key: string;
  itemName: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const newItem = (): ItemLine => ({
  key: Math.random().toString(36).slice(2),
  itemName: '',
  description: '',
  quantity: '1',
  unitPrice: '',
});

export function PurchaseForm({
  vendors,
}: {
  vendors: { id: string; name: string; category: string | null; isPreferred: boolean }[];
}) {
  const today = toISODate(new Date());
  const [category, setCategory] = React.useState<string>('IT');
  const [vendorId, setVendorId] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [requiredDate, setRequiredDate] = React.useState('');
  const [quotationCount, setQuotationCount] = React.useState('1');
  const [currency, setCurrency] = React.useState('USD');
  const [items, setItems] = React.useState<ItemLine[]>([newItem()]);

  const { pending, result, errors, run } = useCreateForm();

  const total = round2(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0));
  const quotes = Number(quotationCount) || 0;
  const needsTwoQuotes = total > 3000 && quotes < 2;

  function payload() {
    return {
      category,
      vendorId,
      purpose,
      requiredDate,
      quotationCount: quotes,
      currency,
      items: items
        .filter((i) => i.itemName.trim())
        .map((i) => ({
          itemName: i.itemName,
          description: i.description,
          quantity: Number(i.quantity) || 1,
          unitPrice: Number(i.unitPrice) || 0,
        })),
    };
  }

  function applyDraft(fields: Record<string, unknown>) {
    if (typeof fields.description === 'string') setPurpose(fields.description);
    if (typeof fields.vendorId === 'string') setVendorId(fields.vendorId);
    const qty = typeof fields.quantity === 'number' ? fields.quantity : null;
    const amount = typeof fields.amount === 'number' ? fields.amount : null;
    if (qty || amount) {
      setItems((prev) => {
        const first = prev[0] ?? newItem();
        return [
          {
            ...first,
            itemName: first.itemName || (typeof fields.title === 'string' ? fields.title.slice(0, 60) : ''),
            quantity: qty ? String(qty) : first.quantity,
            unitPrice: amount ? String(amount) : first.unitPrice,
          },
          ...prev.slice(1),
        ];
      });
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <AiDraftBox type="PURCHASE" onDraft={applyDraft} />

        <Card>
          <CardHeader title="Purchase detail" icon={<ShoppingCart className="size-4" />} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="category" required error={errors.category}>
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {PURCHASE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Vendor" htmlFor="vendorId" hint="Preferred vendors are listed first." error={errors.vendorId}>
              <Select id="vendorId" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Not selected</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.isPreferred ? '★ ' : ''}
                    {v.name}
                    {v.category ? ` · ${v.category}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Needed by" htmlFor="requiredDate" error={errors.requiredDate}>
              <Input id="requiredDate" type="date" min={today} value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
            </Field>

            <Field
              label="Quotations attached"
              htmlFor="quotationCount"
              hint="Two are required above $3,000."
              error={errors.quotationCount}
            >
              <Input
                id="quotationCount"
                type="number"
                min={0}
                max={10}
                value={quotationCount}
                onChange={(e) => setQuotationCount(e.target.value)}
              />
            </Field>

            <Field label="Purpose" htmlFor="purpose" required className="sm:col-span-2" error={errors.purpose}>
              <Textarea
                id="purpose"
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Why is this needed, and what happens if it is not approved?"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Line items"
            actions={
              <Button size="sm" variant="secondary" onClick={() => setItems((p) => [...p, newItem()])}>
                <Plus /> Add item
              </Button>
            }
          />
          <CardBody className="space-y-2">
            {items.map((line, i) => {
              const lineTotal = round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
              return (
                <div key={line.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem_auto]">
                  <Input
                    aria-label={`Item name ${i + 1}`}
                    placeholder="Item"
                    value={line.itemName}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, itemName: e.target.value } : x)))}
                  />
                  <Input
                    aria-label={`Quantity ${i + 1}`}
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, quantity: e.target.value } : x)))}
                  />
                  <Input
                    aria-label={`Unit price ${i + 1}`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Unit price"
                    value={line.unitPrice}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, unitPrice: e.target.value } : x)))}
                  />
                  <span className="flex h-9 items-center justify-end px-1 text-xs font-medium text-text tabular">
                    {formatMoney(lineTotal, currency)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove item ${i + 1}`}
                    disabled={items.length === 1}
                    onClick={() => setItems((p) => p.filter((x) => x.key !== line.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
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
          onSave={() => run((s) => createPurchaseAction(payload(), s), false)}
          onSubmit={() => run((s) => createPurchaseAction(payload(), s), true)}
          pending={pending}
          result={result}
          disabled={!items.some((i) => i.itemName.trim())}
        />
      </div>

      <aside>
        <Card className="sticky top-20">
          <CardHeader title="Before you submit" />
          <CardBody className="space-y-2 text-xs">
            <p className="text-text-muted">
              Total <span className="font-semibold text-text tabular">{formatMoney(total, currency)}</span>
            </p>
            {needsTwoQuotes && (
              <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                Above $3,000 with only {quotes} quotation. Company policy requires two — Finance will block this
                otherwise.
              </p>
            )}
            {total > 1000 && (
              <p className="text-[11px] text-text-subtle">Above $1,000 — routes to the Director after Finance.</p>
            )}
            <p className="text-[11px] text-text-subtle">
              The approver will see this priced against previous purchases of the same item and against your
              department&apos;s remaining budget.
            </p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
