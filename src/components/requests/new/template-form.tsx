'use client';

import * as React from 'react';
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { ChainPicker, type LineOption } from './chain-picker';
import { EmployeePicker, type PickedPerson } from '@/components/ui/employee-picker';
import { createTemplateRequestAction } from '@/server/actions/templates';
import { useI18n } from '@/lib/i18n/client';
import { buildTitle, type TemplateField } from '@/lib/validation/templates';

export interface TemplateDto {
  id: string;
  code: string;
  nameEn: string;
  nameKo: string;
  descriptionEn: string | null;
  descriptionKo: string | null;
  category: string;
  fields: TemplateField[];
  titlePattern: string;
  amountField: string | null;
}

/**
 * Renders a form from a template's field definitions.
 *
 * One component replaces what would otherwise be a new React file per form. The
 * six built-in forms stay hand-written because their fields carry logic — a
 * leave form recalculates working days as you type, an expense form hashes
 * receipts for duplicates. Everything else is labelled inputs plus an approval
 * route, and that is what this renders.
 */
export function TemplateForm({
  template,
  colleagues,
  lines,
}: {
  template: TemplateDto;
  colleagues: { id: string; name: string }[];
  lines: LineOption[];
}) {
  const { t, locale } = useI18n();
  const label = locale === 'ko' ? template.nameKo : template.nameEn;

  const [values, setValues] = React.useState<Record<string, unknown>>(() =>
    Object.fromEntries(template.fields.map((f) => [f.key, f.type === 'checkbox' ? false : ''])),
  );
  // Employee fields store an id; the picker needs the name too, so it is kept
  // alongside rather than looked up on every render.
  const [people, setPeople] = React.useState<Record<string, PickedPerson | null>>({});

  const { pending, result, errors, run } = useCreateForm();
  const [approverIds, setApproverIds] = React.useState<string[]>([]);
  const [lineId, setLineId] = React.useState<string | null>(null);

  function set(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** The generated title, shown live so the naming convention is visible, not memorised. */
  const title = buildTitle(template.titlePattern, label, values);

  const required = template.fields.filter((f) => f.required);
  const incomplete = required.some((f) => {
    const v = values[f.key];
    return f.type === 'checkbox' ? false : v === undefined || v === null || String(v).trim() === '';
  });

  function applyDraft(fields: Record<string, unknown>) {
    setValues((prev) => {
      const next = { ...prev };
      for (const f of template.fields) {
        if (fields[f.key] !== undefined && fields[f.key] !== null) next[f.key] = fields[f.key];
      }
      return next;
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <AiDraftBox type="GENERAL" onDraft={applyDraft} />

        <Card>
          <CardHeader title={label} description={(locale === 'ko' ? template.descriptionKo : template.descriptionEn) ?? undefined} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {template.fields.map((field) => {
              const fieldLabel = locale === 'ko' ? field.labelKo : field.labelEn;
              const hint = locale === 'ko' ? field.hintKo : field.hintEn;
              const wide = field.type === 'textarea';

              return (
                <Field
                  key={field.key}
                  label={fieldLabel}
                  htmlFor={field.key}
                  required={field.required}
                  hint={hint}
                  error={errors[field.key]}
                  className={wide ? 'sm:col-span-2' : undefined}
                >
                  {field.type === 'textarea' ? (
                    <Textarea
                      id={field.key}
                      rows={3}
                      value={String(values[field.key] ?? '')}
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                  ) : field.type === 'select' ? (
                    <Select id={field.key} value={String(values[field.key] ?? '')} onChange={(e) => set(field.key, e.target.value)}>
                      <option value="">{t('tpl.choose')}</option>
                      {(field.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {locale === 'ko' ? o.labelKo : o.labelEn}
                        </option>
                      ))}
                    </Select>
                  ) : field.type === 'employee' ? (
                    <EmployeePicker
                      id={field.key}
                      value={people[field.key] ?? null}
                      ariaLabel={fieldLabel}
                      onChange={(person) => {
                        setPeople((prev) => ({ ...prev, [field.key]: person }));
                        set(field.key, person?.id ?? '');
                      }}
                    />
                  ) : field.type === 'checkbox' ? (
                    <label className="flex h-9 items-center gap-2 text-xs text-text">
                      <Checkbox checked={Boolean(values[field.key])} onChange={(e) => set(field.key, e.target.checked)} />
                      {fieldLabel}
                    </label>
                  ) : (
                    <Input
                      id={field.key}
                      type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'money' ? 'number' : 'text'}
                      min={field.type === 'date' ? undefined : 0}
                      step={field.type === 'money' ? '0.01' : undefined}
                      value={String(values[field.key] ?? '')}
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                  )}
                </Field>
              );
            })}
          </CardBody>
        </Card>

        <FieldError id="form-error" message={errors._form} />

        <FormActions
          onSave={() => run((s) => createTemplateRequestAction(template.id, values, s, { approverIds, approvalLineId: lineId }), false)}
          onSubmit={() => run((s) => createTemplateRequestAction(template.id, values, s, { approverIds, approvalLineId: lineId }), true)}
          pending={pending}
          result={result}
          disabled={incomplete}
        />
      </div>

      <aside className="space-y-4">
        <ChainPicker
          facts={{
            requestType: 'GENERAL',
            templateId: template.id,
            amountBase: template.amountField ? Number(values[template.amountField]) || 0 : 0,
          }}
          colleagues={colleagues}
          lines={lines}
          value={approverIds}
          onChange={setApproverIds}
          onLineChange={setLineId}
        />
        <Card className="sticky top-20">
          <CardHeader title={t('tpl.preview')} description={t('tpl.previewSub')} />
          <CardBody className="space-y-2 text-xs">
            <div>
              <p className="mb-1 text-[10px] text-text-muted">{t('label.title')}</p>
              <p className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-2.5 py-2 text-[13px] font-medium text-text">
                {title}
              </p>
            </div>
            <p className="text-[11px] leading-relaxed text-text-subtle">{t('tpl.titleNote')}</p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
