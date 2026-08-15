'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Power, Save, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Input, Select, Textarea } from '@/components/ui/primitives';
import { generateTemplateAction, saveTemplateAction, setTemplateActiveAction } from '@/server/actions/template-admin';
import { useI18n } from '@/lib/i18n/client';
import { FIELD_TYPES, TEMPLATE_CATEGORIES, buildTitle, type TemplateField } from '@/lib/validation/templates';
import { cn } from '@/lib/utils';

export interface TemplateRow {
  id: string;
  code: string;
  nameEn: string;
  nameKo: string;
  descriptionEn: string | null;
  descriptionKo: string | null;
  officeId: string | null;
  category: string;
  icon: string;
  fields: TemplateField[];
  titlePattern: string;
  amountField: string | null;
  amountCommitsBudget: boolean;
  workflowId: string | null;
  isActive: boolean;
  createdByAi: boolean;
  sortOrder: number;
}

interface Draft {
  amountCommitsBudget: boolean;
  workflowId: string | null;
  code: string;
  nameEn: string;
  nameKo: string;
  descriptionEn: string;
  descriptionKo: string;
  officeId: string | null;
  category: string;
  icon: string;
  fields: TemplateField[];
  titlePattern: string;
  amountField: string | null;
  isActive: boolean;
  sortOrder: number;
}

const blank = (): Draft => ({
  amountCommitsBudget: true,
  workflowId: null,
  code: '',
  nameEn: '',
  nameKo: '',
  descriptionEn: '',
  descriptionKo: '',
  officeId: null,
  category: 'GENERAL',
  icon: 'FileText',
  fields: [],
  titlePattern: '',
  amountField: null,
  isActive: true,
  sortOrder: 100,
});

/**
 * Authoring surface for form templates.
 *
 * The generator is the front door and the field editor is the review step,
 * deliberately in that order: the common task is "we already have this form on
 * paper, get it into the system", not "design a form from nothing". Publishing
 * is always a separate, explicit click on a draft the administrator has read.
 */
export function TemplateStudio({
  templates,
  offices,
  workflows,
}: {
  templates: TemplateRow[];
  offices: { id: string; code: string; name: string }[];
  workflows: { id: string; name: string; requestType: string; steps: number }[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();

  const [source, setSource] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null);

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const name = (row: TemplateRow) => (locale === 'ko' ? row.nameKo : row.nameEn);

  async function generate() {
    if (source.trim().length < 10 || generating) return;
    setGenerating(true);
    setStatus(null);
    setNotes([]);

    const res = await generateTemplateAction(source);
    setGenerating(false);
    setStatus({ ok: res.ok, message: res.message });

    if (res.ok && res.draft) {
      const d = res.draft;
      setEditingId(null);
      setNotes(d.notes);
      setDraft({
        // Suggested by the generator, which knows the office and category and
        // therefore produces something usable even for a CJK form name.
        code: d.code,
        nameEn: d.nameEn,
        nameKo: d.nameKo,
        descriptionEn: d.descriptionEn,
        descriptionKo: d.descriptionKo,
        officeId: d.officeId,
        category: d.category,
        icon: d.icon,
        fields: d.fields,
        titlePattern: d.titlePattern,
        amountField: d.amountField,
        amountCommitsBudget: true,
        workflowId: null,
        isActive: true,
        sortOrder: 100,
      });
    }
  }

  function edit(row: TemplateRow) {
    setEditingId(row.id);
    setNotes([]);
    setStatus(null);
    setDraft({
      code: row.code,
      nameEn: row.nameEn,
      nameKo: row.nameKo,
      descriptionEn: row.descriptionEn ?? '',
      descriptionKo: row.descriptionKo ?? '',
      officeId: row.officeId,
      category: row.category,
      icon: row.icon,
      fields: row.fields,
      titlePattern: row.titlePattern,
      amountField: row.amountField,
      amountCommitsBudget: row.amountCommitsBudget,
      workflowId: row.workflowId,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    const res = await saveTemplateAction(draft, editingId ?? undefined);
    setSaving(false);
    setStatus(res);
    if (res.ok) {
      setDraft(null);
      setEditingId(null);
      setSource('');
      router.refresh();
    }
  }

  async function toggle(row: TemplateRow) {
    setBusyId(row.id);
    const res = await setTemplateActiveAction(row.id, !row.isActive);
    setBusyId(null);
    setStatus(res);
    if (res.ok) router.refresh();
  }

  function patchField(i: number, patch: Partial<TemplateField>) {
    setDraft((d) => (d ? { ...d, fields: d.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) } : d));
  }

  const sampleValues = React.useMemo(() => {
    if (!draft) return {};
    return Object.fromEntries(draft.fields.map((f) => [f.key, locale === 'ko' ? f.labelKo : f.labelEn]));
  }, [draft, locale]);

  return (
    <div className="space-y-5">
      {status && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'rounded-[var(--radius-control)] border px-3 py-2 text-xs font-medium',
            status.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
          )}
        >
          {status.message}
        </p>
      )}

      {/* Generate */}
      <Card className="border-accent-border bg-accent-soft/30">
        <CardHeader
          title={t('tplGen.title')}
          description={t('tplGen.subtitle')}
          icon={<Sparkles className="size-4 text-accent" />}
        />
        <CardBody className="space-y-2.5">
          <Textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={5}
            maxLength={8000}
            placeholder={t('tplGen.placeholder')}
            aria-label={t('tplGen.title')}
            disabled={generating}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={generate} disabled={generating || source.trim().length < 10}>
              {generating ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {generating ? t('tplGen.working') : t('tplGen.generate')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDraft(blank());
                setEditingId(null);
                setNotes([]);
              }}
            >
              <Plus /> {t('tplGen.blank')}
            </Button>
          </div>
          {notes.length > 0 && (
            <ul className="space-y-0.5 pt-1">
              {notes.map((n) => (
                <li key={n} className="text-[11px] text-text-muted">
                  · {t(n)}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Review and edit */}
      {draft && (
        <Card>
          <CardHeader
            title={editingId ? t('tplGen.editing', { name: draft.nameEn || draft.code }) : t('tplGen.review')}
            description={t('tplGen.reviewSub')}
            actions={
              <span className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  {t('action.cancel')}
                </Button>
                <Button variant="primary" size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {editingId ? t('action.save') : t('tplGen.publish')}
                </Button>
              </span>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Labelled label={t('tplGen.code')}>
                <Input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  className="h-8 font-mono"
                />
              </Labelled>
              <Labelled label={t('tplGen.nameEn')}>
                <Input value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} className="h-8" />
              </Labelled>
              <Labelled label={t('tplGen.nameKo')}>
                <Input value={draft.nameKo} onChange={(e) => setDraft({ ...draft, nameKo: e.target.value })} className="h-8" />
              </Labelled>
              <Labelled label={t('label.office')}>
                <Select
                  value={draft.officeId ?? ''}
                  onChange={(e) => setDraft({ ...draft, officeId: e.target.value || null })}
                  className="h-8"
                >
                  <option value="">{t('tplGen.allOffices')}</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} · {o.name}
                    </option>
                  ))}
                </Select>
              </Labelled>
              <Labelled label={t('label.category')}>
                <Select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  className="h-8"
                >
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`pick.cat.${c}`)}
                    </option>
                  ))}
                </Select>
              </Labelled>
              <Labelled label={t('tplGen.amountField')}>
                <Select
                  value={draft.amountField ?? ''}
                  onChange={(e) => setDraft({ ...draft, amountField: e.target.value || null })}
                  className="h-8"
                >
                  <option value="">{t('tplGen.noAmount')}</option>
                  {draft.fields
                    .filter((f) => f.type === 'money' || f.type === 'number')
                    .map((f) => (
                      <option key={f.key} value={f.key}>
                        {locale === 'ko' ? f.labelKo : f.labelEn}
                      </option>
                    ))}
                </Select>
              </Labelled>
              <Labelled label={t('tplGen.budgetEffect')} className={draft.amountField ? '' : 'opacity-40'}>
                <label className="flex h-8 items-center gap-2 text-xs text-text">
                  <Checkbox
                    checked={draft.amountCommitsBudget}
                    disabled={!draft.amountField}
                    onChange={(e) => setDraft({ ...draft, amountCommitsBudget: e.target.checked })}
                  />
                  {t('tplGen.commitsBudget')}
                </label>
              </Labelled>
              <Labelled label={t('tplGen.workflow')} className="sm:col-span-2">
                <Select
                  value={draft.workflowId ?? ''}
                  onChange={(e) => setDraft({ ...draft, workflowId: e.target.value || null })}
                  className="h-8"
                >
                  <option value="">{t('tplGen.defaultWorkflow')}</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · {t('wf.steps', { count: w.steps })}
                    </option>
                  ))}
                </Select>
              </Labelled>
              <Labelled label={t('tplGen.titlePattern')} className="sm:col-span-2">
                <Input
                  value={draft.titlePattern}
                  onChange={(e) => setDraft({ ...draft, titlePattern: e.target.value })}
                  className="h-8"
                />
              </Labelled>
            </div>

            <p className="text-[11px] leading-relaxed text-text-subtle">{t('tplGen.workflowNote')}</p>
            {draft.amountField && !draft.amountCommitsBudget && (
              <p className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                {t('tplGen.referenceOnlyNote')}
              </p>
            )}

            <p className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-3 py-2 text-[11px] text-text-muted">
              {t('tplGen.titlePreview')}{' '}
              <span className="font-medium text-text">
                {buildTitle(draft.titlePattern, draft.nameKo || draft.nameEn, sampleValues)}
              </span>
            </p>

            {/* Fields */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-text">{t('tplGen.fields', { count: draft.fields.length })}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      fields: [
                        ...draft.fields,
                        {
                          key: `field${draft.fields.length + 1}`,
                          labelEn: '',
                          labelKo: '',
                          type: 'text',
                          required: false,
                        },
                      ],
                    })
                  }
                  disabled={draft.fields.length >= 25}
                >
                  <Plus /> {t('tplGen.addField')}
                </Button>
              </div>

              {draft.fields.map((field, i) => (
                <div
                  key={i}
                  className="grid gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken p-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_8rem_5rem_auto]"
                >
                  <Input
                    aria-label={t('tplGen.fieldKey', { n: i + 1 })}
                    value={field.key}
                    onChange={(e) => patchField(i, { key: e.target.value })}
                    className="h-8 font-mono text-[11px]"
                  />
                  <Input
                    aria-label={t('tplGen.fieldLabelEn', { n: i + 1 })}
                    placeholder="English"
                    value={field.labelEn}
                    onChange={(e) => patchField(i, { labelEn: e.target.value })}
                    className="h-8"
                  />
                  <Input
                    aria-label={t('tplGen.fieldLabelKo', { n: i + 1 })}
                    placeholder="한국어"
                    value={field.labelKo}
                    onChange={(e) => patchField(i, { labelKo: e.target.value })}
                    className="h-8"
                  />
                  <Select
                    aria-label={t('tplGen.fieldType', { n: i + 1 })}
                    value={field.type}
                    onChange={(e) => patchField(i, { type: e.target.value as TemplateField['type'] })}
                    className="h-8"
                  >
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft} value={ft}>
                        {t(`tplGen.type.${ft}`)}
                      </option>
                    ))}
                  </Select>
                  <label className="flex h-8 items-center gap-1.5 text-[11px] text-text-muted">
                    <Checkbox checked={Boolean(field.required)} onChange={(e) => patchField(i, { required: e.target.checked })} />
                    {t('tplGen.required')}
                  </label>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={t('tplGen.removeField', { n: i + 1 })}
                    onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, idx) => idx !== i) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Existing */}
      <Card>
        <CardHeader title={t('tplGen.existing', { count: templates.length })} description={t('tplGen.existingSub')} />
        <CardBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((row) => (
            <div
              key={row.id}
              className={cn(
                'rounded-[var(--radius-control)] border border-border-subtle bg-surface p-3',
                !row.isActive && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-text">{name(row)}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-text-subtle">{row.code}</p>
                </div>
                <span className="flex shrink-0 gap-1">
                  {row.createdByAi && <Badge tone="indigo">AI</Badge>}
                  {!row.isActive && <Badge tone="slate">{t('state.inactive')}</Badge>}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-text-muted">
                {t('tplGen.fieldCount', { count: row.fields.length })} · {t(`pick.cat.${row.category}`)}
              </p>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => edit(row)}>
                  {t('action.edit')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(row)} disabled={busyId === row.id}>
                  {busyId === row.id ? <Loader2 className="animate-spin" /> : <Power />}
                  {t(row.isActive ? 'tplGen.retire' : 'tplGen.restore')}
                </Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function Labelled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[11px] font-medium text-text-muted">{label}</span>
      {children}
    </label>
  );
}
