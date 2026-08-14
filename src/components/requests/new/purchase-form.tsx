'use client';

import * as React from 'react';
import { Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { createPurchaseAction } from '@/server/actions/create';
import { toISODate } from '@/lib/dates';
import { round2 } from '@/lib/money';
import { useI18n } from '@/lib/i18n/client';
import { formatMoneyL } from '@/lib/i18n/format';
import { CURRENCIES, PURCHASE_CATEGORIES } from '@/types/domain';

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
  const { t, locale } = useI18n();
  const today = toISODate(new Date());
  const [category, setCategory] = React.useState<string>('IT');
  const [vendorId, setVendorId] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [requiredDate, setRequiredDate] = React.useState('');
  const [quotationCount, setQuotationCount] = React.useState('1');
  const [currency, setCurrency] = React.useState('USD');
  const [items, setItems] = React.useState<ItemLine[]>([newItem()]);

  const { pending, result, errors, run } = useCreateForm();
  const money = (v: number) => formatMoneyL(locale, v, currency);

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
          <CardHeader title={t('prForm.detail')} icon={<ShoppingCart className="size-4" />} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t('label.category')} htmlFor="category" required error={errors.category}>
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {PURCHASE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`purchaseCategory.${c}`)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={t('content.vendor')}
              htmlFor="vendorId"
              hint={t('prForm.vendorHint')}
              error={errors.vendorId}
            >
              <Select id="vendorId" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">{t('content.noVendor')}</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.isPreferred ? '★ ' : ''}
                    {v.name}
                    {v.category ? ` · ${v.category}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('prForm.neededBy')} htmlFor="requiredDate" error={errors.requiredDate}>
              <Input id="requiredDate" type="date" min={today} value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
            </Field>

            <Field
              label={t('prForm.quotationsLabel')}
              htmlFor="quotationCount"
              hint={t('prForm.quotationsHint')}
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

            <Field label={t('label.purpose')} htmlFor="purpose" required className="sm:col-span-2" error={errors.purpose}>
              <Textarea
                id="purpose"
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={t('prForm.purposePlaceholder')}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t('prForm.lineItems')}
            actions={
              <Button size="sm" variant="secondary" onClick={() => setItems((p) => [...p, newItem()])}>
                <Plus /> {t('prForm.addItem')}
              </Button>
            }
          />
          <CardBody className="space-y-2">
            {items.map((line, i) => {
              const lineTotal = round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
              return (
                <div key={line.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem_auto]">
                  <Input
                    aria-label={t('prForm.itemName', { n: i + 1 })}
                    placeholder={t('content.item')}
                    value={line.itemName}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, itemName: e.target.value } : x)))}
                  />
                  <Input
                    aria-label={t('prForm.quantityAria', { n: i + 1 })}
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, quantity: e.target.value } : x)))}
                  />
                  <Input
                    aria-label={t('prForm.unitPriceAria', { n: i + 1 })}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={t('content.unitPrice')}
                    value={line.unitPrice}
                    onChange={(e) => setItems((p) => p.map((x) => (x.key === line.key ? { ...x, unitPrice: e.target.value } : x)))}
                  />
                  <span className="flex h-9 items-center justify-end px-1 text-xs font-medium text-text tabular">
                    {money(lineTotal)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('prForm.removeItem', { n: i + 1 })}
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
              <Select aria-label={t('label.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-8 w-24">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <p className="text-sm font-semibold text-text tabular">{t('tripForm.totalLine', { amount: money(total) })}</p>
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
          <CardHeader title={t('prForm.beforeSubmit')} />
          <CardBody className="space-y-2 text-xs">
            <p className="text-text-muted">
              {t('label.total')} <span className="font-semibold text-text tabular">{money(total)}</span>
            </p>
            {needsTwoQuotes && (
              <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {t('prForm.needTwoQuotes', { count: quotes })}
              </p>
            )}
            {total > 1000 && <p className="text-[11px] text-text-subtle">{t('prForm.directorNote')}</p>}
            <p className="text-[11px] text-text-subtle">{t('prForm.approverNote')}</p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
